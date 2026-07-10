/**
 * Phase 3 validation gate script — quote + fee parameter checks.
 *
 * Covers two of the three Phase 3 gate items that DON'T require signing
 * or submitting a real transaction (so they're the most practical to run
 * repeatedly, including in CI):
 *
 *   1. A normal quote WITH platformFeeBps + feeAccount set, confirming
 *      Jupiter echoes back a platformFee object matching our configured
 *      fee (validates the fee wiring itself, not just reachability).
 *   2. An illiquid/no-route pair, confirming our error handling returns a
 *      typed, catchable error rather than crashing the process.
 *
 * The third gate item (an actual end-to-end swap, quote -> sign ->
 * submit -> confirm -> fee account balance change) requires real funds
 * and real liquidity, since Jupiter doesn't operate on devnet — see
 * scripts/mainnet-swap-smoke-test.ts and docs/testing-phase3.md for why.
 *
 * Usage:
 *   npm run quote:check --workspace=solana
 *
 * Requires JUPITER_API_KEY in .env (see .env.example) and, for check #1,
 * a real Associated Token Account address in SOLANA_FEE_WALLET_FEE_ATA
 * (or the script falls back to a syntactically-valid but likely-empty
 * placeholder address just to test the request shape — see inline note).
 */
import * as dotenv from "dotenv";
import { getQuote, JupiterApiError, JupiterConfigError, expectedPlatformFeeAmount } from "../src/jupiterService.js";

dotenv.config();

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const PLATFORM_FEE_BPS = Number(process.env.JUPITER_PLATFORM_FEE_BPS || "15");

async function checkQuoteWithFee(): Promise<boolean> {
  console.log("--- Check 1: quote with platformFeeBps set ---");

  try {
    const quote = await getQuote({
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: 100_000_000, // 0.1 SOL
      slippageBps: 50,
      platformFeeBps: PLATFORM_FEE_BPS,
    });

    if (!quote.platformFee) {
      console.log("[FAIL] Requested platformFeeBps but response has no platformFee object.");
      return false;
    }

    const expectedFee = expectedPlatformFeeAmount(quote.outAmount, PLATFORM_FEE_BPS);
    const actualFee = BigInt(quote.platformFee.amount);

    console.log(`Quote outAmount (gross, incl. fee): ${quote.outAmount}`);
    console.log(`platformFee.feeBps: ${quote.platformFee.feeBps} (expected ${PLATFORM_FEE_BPS})`);
    console.log(`platformFee.amount: ${actualFee} (our estimate: ${expectedFee})`);

    if (quote.platformFee.feeBps !== PLATFORM_FEE_BPS) {
      console.log("[FAIL] Returned feeBps doesn't match what we requested.");
      return false;
    }

    // Jupiter applies the platform fee at an earlier stage of route
    // calculation than a naive `outAmount * feeBps / 10000`, so exact
    // equality isn't expected — allow up to 1% relative deviation from
    // our estimate (this is checking the fee is roughly the right
    // magnitude, not bit-exact — see the doc comment on
    // expectedPlatformFeeAmount in src/jupiterService.ts).
    const diff = actualFee > expectedFee ? actualFee - expectedFee : expectedFee - actualFee;
    const relativeToleranceBps = 100n; // 1% of the fee amount itself
    const maxAllowedDiff = (expectedFee * relativeToleranceBps) / 10_000n || 1n;

    if (diff > maxAllowedDiff) {
      console.log(
        `[FAIL] platformFee.amount differs from our estimate by ${diff}, which exceeds the ` +
          `1% relative tolerance (${maxAllowedDiff}). This may indicate feeBps isn't being applied correctly.`
      );
      return false;
    }

    console.log("[OK] platformFeeBps wiring confirmed against a live quote.\n");
    return true;
  } catch (err) {
    if (err instanceof JupiterConfigError) {
      console.log(`[CONFIG] ${err.message}\n`);
      return false;
    }
    if (err instanceof JupiterApiError) {
      console.log(`[FAIL] Jupiter rejected the fee-quote request (HTTP ${err.status}): ${err.message}\n`);
      return false;
    }
    console.log(`[FAIL] ${(err as Error).message}\n`);
    return false;
  }
}

async function checkIlliquidPairGracefulError(): Promise<boolean> {
  console.log("--- Check 2: illiquid/no-route pair handled gracefully ---");

  // A syntactically valid but essentially untradeable mint (a random
  // never-launched token address) — Jupiter should return a clean
  // "no route found"-style error, not a crash. If Jupiter can't even
  // validate the mint exists, that's still a graceful API-level error,
  // which is exactly what we're testing for.
  const NONEXISTENT_MINT = "1111111111111111111111111111111111111111x";

  try {
    await getQuote({
      inputMint: SOL_MINT,
      outputMint: NONEXISTENT_MINT,
      amount: 1_000_000,
      slippageBps: 50,
    });

    console.log("[FAIL] Expected this request to be rejected by Jupiter, but it succeeded.\n");
    return false;
  } catch (err) {
    if (err instanceof JupiterApiError) {
      console.log(`[OK] Jupiter rejected the illiquid/invalid pair as expected: HTTP ${err.status} — ${err.message}`);
      console.log("[OK] Our error handling surfaced this as a typed JupiterApiError, not a crash.\n");
      return true;
    }
    if (err instanceof JupiterConfigError) {
      console.log(`[CONFIG] ${err.message}\n`);
      return false;
    }
    // A raw network-level error here would indicate our error handling
    // isn't distinguishing API rejections from transport failures.
    console.log(`[FAIL] Got an unexpected error type, not a JupiterApiError: ${(err as Error).message}\n`);
    return false;
  }
}

async function main() {
  console.log("=== Jupiter quote + fee validation (Phase 3 gate) ===\n");

  const results = await Promise.all([checkQuoteWithFee(), checkIlliquidPairGracefulError()]);

  if (results.every(Boolean)) {
    console.log("All checks passed.");
  } else {
    console.log("One or more checks failed — see logs above.");
    process.exitCode = 1;
  }
}

main();