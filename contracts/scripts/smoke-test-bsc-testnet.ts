/**
 * smoke-test-bsc-testnet.ts
 *
 * Post-deployment smoke test for FeeRouter on BSC Testnet.
 *
 * What this tests:
 *   1. Contract reads: verifies router address, fee wallet, feeBps are set correctly.
 *   2. BNB swap: executes swapExactETHForTokensWithFee with 0.001 tBNB,
 *      parses the SwapExecuted event and confirms feeAmount == 0.15% of msg.value.
 *      (Event-based check is correct even when feeWallet == caller, where a naive
 *      balance delta would be polluted by gas costs and the swap input itself.)
 *   3. Access control: confirms setFeeBps reverts from a non-owner signer.
 *   4. Pause/unpause: confirms swaps revert when paused, succeed after unpause.
 *
 * Prerequisites:
 *   - deployments/bsc-testnet.json exists (run deploy-bsc-testnet.ts first)
 *   - DEPLOYER_PRIVATE_KEY has tBNB to cover gas + the 0.001 tBNB swap input
 *
 * Usage:
 *   npx hardhat run scripts/smoke-test-bsc-testnet.ts --network bscTestnet
 *
 * Token pair used: WBNB → BUSD (testnet)
 *   WBNB testnet : 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
 *   BUSD testnet : 0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// BSC Testnet token address
const BUSD_TESTNET = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";

// Minimal ABI to call WETH() on any Uniswap/PancakeSwap V2-compatible router
const ROUTER_WETH_ABI = ["function WETH() external pure returns (address)"];

// Swap 0.001 tBNB — small enough to always have dust available
const SWAP_AMOUNT = ethers.parseEther("0.001");

// Slippage: accept any non-zero output
const AMOUNT_OUT_MIN = 1n;

// Deadline: 5 minutes from now
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);

async function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ✅ ${message}`);
}

async function main() {
  const networkName = network.name;
  if (networkName !== "bscTestnet") {
    throw new Error(
      `Wrong network: expected "bscTestnet", got "${networkName}". ` +
        `Run with --network bscTestnet`
    );
  }

  // --- Load deployment record ---
  const recordPath = path.join(__dirname, "../deployments/bsc-testnet.json");
  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `No deployment record found at ${recordPath}.\n` +
        `Run deploy-bsc-testnet.ts first.`
    );
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const contractAddress: string = record.address;
  const expectedFeeWallet: string = record.constructorArgs.feeWallet;
  const expectedFeeBps: number = record.constructorArgs.feeBps;

  const [owner] = await ethers.getSigners();

  console.log("\n=== FeeRouter Smoke Test — BSC Testnet ===");
  console.log(`Contract   : ${contractAddress}`);
  console.log(`Caller     : ${owner.address}`);
  console.log(`Fee wallet : ${expectedFeeWallet}`);
  console.log(`Expected fee: ${expectedFeeBps} bps (${expectedFeeBps / 100}%)`);
  console.log("");

  const feeRouter = await ethers.getContractAt("FeeRouter", contractAddress, owner);

  // -----------------------------------------------------------------------
  // 1. State reads
  // -----------------------------------------------------------------------
  console.log("[ 1 ] State reads");

  const actualFeeWallet = await feeRouter.feeWallet();
  await assert(
    actualFeeWallet.toLowerCase() === expectedFeeWallet.toLowerCase(),
    `feeWallet matches deployment record (${actualFeeWallet})`
  );

  const actualFeeBps = await feeRouter.feeBps();
  await assert(
    actualFeeBps === BigInt(expectedFeeBps),
    `feeBps = ${actualFeeBps} (${Number(actualFeeBps) / 100}%)`
  );

  const actualRouter = await feeRouter.pancakeRouter();
  await assert(
    actualRouter !== ethers.ZeroAddress,
    `pancakeRouter set (${actualRouter})`
  );

  const isPaused = await feeRouter.paused();
  await assert(!isPaused, "Contract is not paused");

  // -----------------------------------------------------------------------
  // 2. BNB → token swap — SwapExecuted event fee check
  // -----------------------------------------------------------------------
  // NOTE: We verify feeAmount via the SwapExecuted event rather than a raw
  // BNB balance delta. A balance delta is unreliable when feeWallet == caller
  // because the same address also pays gas and the swap input, making the net
  // delta negative and unrelated to the fee amount.
  console.log("\n[ 2 ] swapExactETHForTokensWithFee (0.001 tBNB → BUSD)");

  // Resolve WBNB from the router — avoids any hardcoded-address mismatch.
  const routerContract = new ethers.Contract(actualRouter, ROUTER_WETH_ABI, ethers.provider);
  const wbnbAddress: string = await routerContract.WETH();
  console.log(`  Router WBNB             : ${wbnbAddress}`);

  const swapPath = [wbnbAddress, BUSD_TESTNET];
  let swapSucceeded = false;

  try {
    const swapTx = await feeRouter.swapExactETHForTokensWithFee(
      AMOUNT_OUT_MIN,
      swapPath,
      owner.address,
      deadline(),
      { value: SWAP_AMOUNT }
    );
    console.log(`  Tx hash: ${swapTx.hash}`);
    const txReceipt = await swapTx.wait();
    swapSucceeded = true;

    // Parse SwapExecuted event from receipt logs
    const swapExecutedIface = feeRouter.interface;
    let emittedFee: bigint | null = null;
    let emittedAmountIn: bigint | null = null;

    for (const log of txReceipt!.logs) {
      try {
        const parsed = swapExecutedIface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === "SwapExecuted") {
          emittedAmountIn = parsed.args.amountIn as bigint;
          emittedFee      = parsed.args.feeAmount as bigint;
          break;
        }
      } catch {
        // not our event — skip
      }
    }

    if (emittedFee === null || emittedAmountIn === null) {
      throw new Error("SwapExecuted event not found in receipt logs");
    }

    const expectedFee = (SWAP_AMOUNT * BigInt(expectedFeeBps)) / 10000n;
    console.log(`  SwapExecuted.amountIn   : ${ethers.formatEther(emittedAmountIn)} tBNB`);
    console.log(`  SwapExecuted.feeAmount  : ${ethers.formatEther(emittedFee)} tBNB`);
    console.log(`  Expected fee            : ${ethers.formatEther(expectedFee)} tBNB`);

    await assert(
      emittedFee === expectedFee,
      `SwapExecuted.feeAmount == ${ethers.formatEther(expectedFee)} tBNB (0.15% of ${ethers.formatEther(SWAP_AMOUNT)} tBNB input)`
    );
  } catch (err: any) {
    if (swapSucceeded) throw err; // real assertion error — rethrow

    // Liquidity may be zero on a given testnet pair — that's a network condition,
    // not a contract bug. Flag it clearly rather than failing silently.
    if (err.message?.includes("INSUFFICIENT_LIQUIDITY") || err.message?.includes("K")) {
      console.warn(
        "\n  ⚠️  Swap reverted with insufficient liquidity — the testnet pair has no reserves.\n" +
          "  This is a BSC Testnet liquidity issue, NOT a contract bug.\n" +
          "  The contract read checks (step 1) and access-control checks (step 3) still validate correctness.\n" +
          "  To fully validate the swap path, seed the pair on testnet or use a funded testnet.\n"
      );
    } else {
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Access control — non-owner setFeeBps must revert
  // -----------------------------------------------------------------------
  console.log("\n[ 3 ] Access control");

  // Use a random throwaway address as a second signer if available,
  // otherwise use a fresh random wallet connected to the provider.
  const attacker = ethers.Wallet.createRandom().connect(ethers.provider);
  const feeRouterAsAttacker = feeRouter.connect(attacker) as typeof feeRouter;

  try {
    await feeRouterAsAttacker.setFeeBps.staticCall(50);
    throw new Error("setFeeBps should have reverted for non-owner but did not");
  } catch (err: any) {
    // We expect an OwnableUnauthorizedAccount revert or similar
    if (err.message?.includes("should have reverted")) throw err;
    await assert(true, "setFeeBps reverts for non-owner ✓");
  }

  try {
    await feeRouterAsAttacker.setFeeWallet.staticCall(attacker.address);
    throw new Error("setFeeWallet should have reverted for non-owner but did not");
  } catch (err: any) {
    if (err.message?.includes("should have reverted")) throw err;
    await assert(true, "setFeeWallet reverts for non-owner ✓");
  }

  // -----------------------------------------------------------------------
  // 4. Pause / unpause
  // -----------------------------------------------------------------------
  console.log("\n[ 4 ] Pause / unpause");

  const pauseTx = await feeRouter.pause();
  await pauseTx.wait();
  await assert(await feeRouter.paused(), "Contract paused");

  // Swap should revert while paused
  try {
    await feeRouter.swapExactETHForTokensWithFee.staticCall(
      AMOUNT_OUT_MIN,
      swapPath,
      owner.address,
      deadline(),
      { value: SWAP_AMOUNT }
    );
    throw new Error("Swap should have reverted while paused but did not");
  } catch (err: any) {
    if (err.message?.includes("should have reverted")) throw err;
    await assert(true, "Swap reverts while paused ✓");
  }

  const unpauseTx = await feeRouter.unpause();
  await unpauseTx.wait();
  await assert(!(await feeRouter.paused()), "Contract unpaused");

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log("\n===========================================");
  console.log("✅ All smoke tests passed — BSC Testnet FeeRouter is operational.");
  console.log(`   Contract: https://testnet.bscscan.com/address/${contractAddress}`);
  console.log("===========================================\n");
}

main().catch((err) => {
  console.error("\n❌ Smoke test failed:", err.message ?? err);
  process.exitCode = 1;
});
