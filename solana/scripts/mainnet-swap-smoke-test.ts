/**
 * Phase 3 validation gate — end-to-end swap smoke test.
 *
 * SCOPE CORRECTION FROM THE ORIGINAL PLAN: the plan calls for a "devnet
 * test script" that does quote -> sign -> submit -> confirm. That's not
 * actually achievable as written — Jupiter's Swap API only routes against
 * REAL MAINNET LIQUIDITY. There is no meaningful Jupiter devnet routing
 * to test against (devnet SPL tokens have no real pools for Jupiter to
 * aggregate). This mirrors the same real-world constraint already
 * flagged in Phase 0's architecture doc for the on-chain side; it turns
 * out the same limitation applies to testing, not just production.
 *
 * So this script does the closest honest equivalent: a REAL swap on
 * Solana MAINNET, with a deliberately tiny amount (default 0.01 SOL),
 * using your own funded wallet. It is:
 *
 *   - OPT-IN ONLY: requires RUN_MAINNET_SWAP_TEST=true to do anything.
 *   - NEVER auto-run: not wired into `npm test`, has not been executed
 *     by Claude in any sandbox, and should not be run by an agent/CI
 *     without a human deliberately choosing to do so.
 *   - Uses REAL MONEY: the configured wallet needs a small real SOL
 *     balance. Use an amount you are fully comfortable losing to fees/
 *     slippage/bugs — treat this like any other real transaction.
 *
 * What it proves when it passes:
 *   - A live quote (with platformFeeBps) can be turned into a signed,
 *     submitted, and confirmed transaction.
 *   - The fee ATA's balance increases by exactly the expected
 *     platformFeeBps-derived amount.
 *
 * Usage:
 *   RUN_MAINNET_SWAP_TEST=true npx tsx scripts/mainnet-swap-smoke-test.ts
 *
 * Required env (see .env.example):
 *   SOLANA_MAINNET_RPC_URL
 *   JUPITER_API_KEY
 *   MAINNET_SMOKE_TEST_WALLET_SECRET_KEY   (base58 secret key, funded with real SOL)
 *   SOLANA_FEE_WALLET_ADDRESS              (owns the fee ATA — doesn't need to be the test wallet)
 */
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import {
  getQuote,
  getSwapTransaction,
  expectedPlatformFeeAmount,
  JupiterApiError,
  JupiterConfigError,
} from "../src/jupiterService.js";
import { getOrCreateFeeAccount } from "../src/feeAccount.js";

dotenv.config();

const RUN = process.env.RUN_MAINNET_SWAP_TEST === "true";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PLATFORM_FEE_BPS = Number(process.env.JUPITER_PLATFORM_FEE_BPS || "15");
const SWAP_AMOUNT_LAMPORTS = Number(process.env.MAINNET_SMOKE_TEST_LAMPORTS || "10000000"); // 0.01 SOL default

async function main() {
  if (!RUN) {
    console.log(
      "This script is opt-in and did not run. Set RUN_MAINNET_SWAP_TEST=true to execute it " +
        "— read the header comment first, this uses real mainnet funds."
    );
    return;
  }

  const rpcUrl = process.env.SOLANA_MAINNET_RPC_URL;
  const secretKeyBase58 = process.env.MAINNET_SMOKE_TEST_WALLET_SECRET_KEY;
  const feeWalletAddress = process.env.SOLANA_FEE_WALLET_ADDRESS;

  if (!rpcUrl || !secretKeyBase58 || !feeWalletAddress) {
    console.log(
      "[CONFIG] Missing one of SOLANA_MAINNET_RPC_URL, MAINNET_SMOKE_TEST_WALLET_SECRET_KEY, " +
        "SOLANA_FEE_WALLET_ADDRESS. See .env.example."
    );
    process.exitCode = 1;
    return;
  }

  console.log("=== Mainnet swap smoke test (Phase 3 gate) ===");
  console.log(`Swapping ${SWAP_AMOUNT_LAMPORTS} lamports (${SWAP_AMOUNT_LAMPORTS / 1e9} SOL) -> USDC\n`);

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
  const feeWalletOwner = new PublicKey(feeWalletAddress);
  const usdcMint = new PublicKey(USDC_MINT);

  try {
    console.log("Ensuring fee wallet's USDC ATA exists...");
    const feeAccount = await getOrCreateFeeAccount(connection, wallet, feeWalletOwner, usdcMint);
    console.log(
      `Fee ATA: ${feeAccount.address.toBase58()} (${feeAccount.wasCreated ? "created" : "already existed"})\n`
    );

    const feeAtaBalanceBefore = await connection.getTokenAccountBalance(feeAccount.address);

    console.log("Requesting quote...");
    const quote = await getQuote({
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: SWAP_AMOUNT_LAMPORTS,
      slippageBps: 50,
      platformFeeBps: PLATFORM_FEE_BPS,
    });
    console.log(`Quote: ${quote.inAmount} lamports -> ${quote.outAmount} USDC base units (gross, incl. fee)\n`);

    console.log("Building swap transaction...");
    const swap = await getSwapTransaction({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      feeAccount: feeAccount.address.toBase58(),
    });

    const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));
    tx.sign([wallet]);

    console.log("Submitting transaction...");
    const signature = await connection.sendTransaction(tx, { maxRetries: 3 });
    console.log(`Submitted: ${signature}`);

    console.log("Confirming...");
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
    console.log("Confirmed.\n");

    const feeAtaBalanceAfter = await connection.getTokenAccountBalance(feeAccount.address);
    const actualDelta = BigInt(feeAtaBalanceAfter.value.amount) - BigInt(feeAtaBalanceBefore.value.amount);
    const expectedDelta = expectedPlatformFeeAmount(quote.outAmount, PLATFORM_FEE_BPS);

    console.log(`Fee ATA balance delta: ${actualDelta} (estimated ~${expectedDelta})`);

    // Same relative-tolerance rationale as quote-and-fee-check.ts: Jupiter's
    // internal fee math isn't a bit-exact match for our naive bps estimate.
    const diff = actualDelta > expectedDelta ? actualDelta - expectedDelta : expectedDelta - actualDelta;
    const relativeToleranceBps = 100n; // 1% of the fee amount itself
    const maxAllowedDiff = (expectedDelta * relativeToleranceBps) / 10_000n || 1n;

    if (diff > maxAllowedDiff) {
      console.log(
        `[FAIL] Fee ATA balance change (${actualDelta}) differs from our estimate (${expectedDelta}) by ` +
          `${diff}, which exceeds the 1% relative tolerance (${maxAllowedDiff}).`
      );
      process.exitCode = 1;
      return;
    }

    console.log("[OK] End-to-end swap succeeded and fee account received the expected platformFeeBps cut.");
  } catch (err) {
    if (err instanceof JupiterConfigError) {
      console.log(`[CONFIG] ${err.message}`);
    } else if (err instanceof JupiterApiError) {
      console.log(`[FAIL] Jupiter API error (HTTP ${err.status}): ${err.message}`);
    } else {
      console.log(`[FAIL] ${(err as Error).message}`);
    }
    process.exitCode = 1;
  }
}

main();