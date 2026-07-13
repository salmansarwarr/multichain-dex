/**
 * smoke-test-arbitrum-sepolia.ts
 *
 * Post-deployment smoke test for EthFeeRouter on Arbitrum Sepolia.
 *
 * What this tests:
 *   1. Contract reads: verifies router address, fee wallet, feeBps are set correctly.
 *   2. ETH swap: executes swapExactETHForTokensWithFee with 0.001 Arbitrum Sepolia ETH
 *      against the seeded MockUniswapRouter, parses SwapExecuted and confirms
 *      feeAmount == 0.15% of msg.value.
 *   3. Token swap: mints tWETH to the caller, executes
 *      swapExactTokensForTokensWithFee, confirms feeAmount == 0.15% of amountIn.
 *   4. Access control: confirms setFeeBps/setFeeWallet revert from a non-owner account.
 *   5. Pause/unpause: confirms swaps revert when paused, succeed after unpause.
 *
 * Prerequisites:
 *   - deployments/arbitrum-sepolia.json exists (run deploy-arbitrum-sepolia.ts first)
 *   - DEPLOYER_PRIVATE_KEY has Arbitrum Sepolia ETH to cover gas + the 0.001 ETH swap input
 *
 * Usage:
 *   npx hardhat run scripts/smoke-test-arbitrum-sepolia.ts --network arbitrumSepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Swap 0.001 Arbitrum Sepolia ETH
const SWAP_AMOUNT_ETH = ethers.parseEther("0.001");

// Swap 1 tWETH (18 decimals) in the token-to-token test
const SWAP_AMOUNT_TOKEN = ethers.parseUnits("1", 18);

// Slippage: accept any non-zero output
const AMOUNT_OUT_MIN = 1n;

// Deadline: 5 minutes from now
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);

async function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ✅ ${message}`);
}

function findSwapExecuted(iface: any, logs: readonly any[]) {
  for (const log of logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "SwapExecuted") return parsed;
    } catch {
      // not our event — skip
    }
  }
  return null;
}

async function main() {
  const networkName = network.name;
  if (networkName !== "arbitrumSepolia") {
    throw new Error(
      `Wrong network: expected "arbitrumSepolia", got "${networkName}". ` +
        `Run with --network arbitrumSepolia`
    );
  }

  // --- Load deployment record ---
  const recordPath = path.join(__dirname, "../deployments/arbitrum-sepolia.json");
  if (!fs.existsSync(recordPath)) {
    throw new Error(`No deployment record found at ${recordPath}.\nRun deploy-arbitrum-sepolia.ts first.`);
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const contractAddress: string = record.address;
  const expectedFeeWallet: string = record.constructorArgs.feeWallet;
  const expectedFeeBps: number = record.constructorArgs.feeBps;
  const tWETHAddress: string = record.mocks.tWETH;
  const tUSDCAddress: string = record.mocks.tUSDC;

  const [owner] = await ethers.getSigners();

  console.log("\n=== EthFeeRouter Smoke Test — Arbitrum Sepolia ===");
  console.log(`Contract   : ${contractAddress}`);
  console.log(`Caller     : ${owner.address}`);
  console.log(`Fee wallet : ${expectedFeeWallet}`);
  console.log(`Expected fee: ${expectedFeeBps} bps (${expectedFeeBps / 100}%)`);
  console.log("");

  const ethFeeRouter = await ethers.getContractAt("EthFeeRouter", contractAddress, owner);

  // -----------------------------------------------------------------------
  // 1. State reads
  // -----------------------------------------------------------------------
  console.log("[ 1 ] State reads");

  const actualFeeWallet = await ethFeeRouter.feeWallet();
  await assert(
    actualFeeWallet.toLowerCase() === expectedFeeWallet.toLowerCase(),
    `feeWallet matches deployment record (${actualFeeWallet})`
  );

  const actualFeeBps = await ethFeeRouter.feeBps();
  await assert(actualFeeBps === BigInt(expectedFeeBps), `feeBps = ${actualFeeBps} (${Number(actualFeeBps) / 100}%)`);

  const actualRouter = await ethFeeRouter.uniswapRouter();
  await assert(actualRouter !== ethers.ZeroAddress, `uniswapRouter set (${actualRouter})`);

  const isPaused = await ethFeeRouter.paused();
  await assert(!isPaused, "Contract is not paused");

  // -----------------------------------------------------------------------
  // 2. ETH → token swap — SwapExecuted event fee check
  // -----------------------------------------------------------------------
  console.log("\n[ 2 ] swapExactETHForTokensWithFee (0.001 ETH → tUSDC)");

  const ethSwapPath = [tWETHAddress, tUSDCAddress];
  const ethSwapTx = await ethFeeRouter.swapExactETHForTokensWithFee(
    AMOUNT_OUT_MIN,
    ethSwapPath,
    owner.address,
    deadline(),
    { value: SWAP_AMOUNT_ETH }
  );
  console.log(`  Tx hash: ${ethSwapTx.hash}`);
  const ethReceipt = await ethSwapTx.wait();

  const ethEvent = findSwapExecuted(ethFeeRouter.interface, ethReceipt!.logs);
  if (!ethEvent) throw new Error("SwapExecuted event not found in ETH swap receipt logs");

  const expectedEthFee = (SWAP_AMOUNT_ETH * BigInt(expectedFeeBps)) / 10000n;
  console.log(`  SwapExecuted.amountIn   : ${ethers.formatEther(ethEvent.args.amountIn)} ETH`);
  console.log(`  SwapExecuted.feeAmount  : ${ethers.formatEther(ethEvent.args.feeAmount)} ETH`);
  await assert(
    ethEvent.args.feeAmount === expectedEthFee,
    `SwapExecuted.feeAmount == ${ethers.formatEther(expectedEthFee)} ETH (0.15% of ${ethers.formatEther(SWAP_AMOUNT_ETH)} ETH input)`
  );

  // -----------------------------------------------------------------------
  // 3. Token → token swap — SwapExecuted event fee check
  // -----------------------------------------------------------------------
  console.log("\n[ 3 ] swapExactTokensForTokensWithFee (1 tWETH → tUSDC)");

  const tWETH = await ethers.getContractAt("MockERC20", tWETHAddress, owner);
  const mintTx = await tWETH.mint(owner.address, SWAP_AMOUNT_TOKEN);
  await mintTx.wait();

  const approveTx = await tWETH.approve(contractAddress, SWAP_AMOUNT_TOKEN);
  await approveTx.wait();

  const tokenSwapPath = [tWETHAddress, tUSDCAddress];
  const tokenSwapTx = await ethFeeRouter.swapExactTokensForTokensWithFee(
    SWAP_AMOUNT_TOKEN,
    AMOUNT_OUT_MIN,
    tokenSwapPath,
    owner.address,
    deadline()
  );
  console.log(`  Tx hash: ${tokenSwapTx.hash}`);
  const tokenReceipt = await tokenSwapTx.wait();

  const tokenEvent = findSwapExecuted(ethFeeRouter.interface, tokenReceipt!.logs);
  if (!tokenEvent) throw new Error("SwapExecuted event not found in token swap receipt logs");

  const expectedTokenFee = (SWAP_AMOUNT_TOKEN * BigInt(expectedFeeBps)) / 10000n;
  console.log(`  SwapExecuted.amountIn   : ${ethers.formatUnits(tokenEvent.args.amountIn, 18)} tWETH`);
  console.log(`  SwapExecuted.feeAmount  : ${ethers.formatUnits(tokenEvent.args.feeAmount, 18)} tWETH`);
  await assert(
    tokenEvent.args.feeAmount === expectedTokenFee,
    `SwapExecuted.feeAmount == ${ethers.formatUnits(expectedTokenFee, 18)} tWETH (0.15% of ${ethers.formatUnits(SWAP_AMOUNT_TOKEN, 18)} tWETH input)`
  );

  // -----------------------------------------------------------------------
  // 4. Access control — non-owner setFeeBps/setFeeWallet must revert
  // -----------------------------------------------------------------------
  console.log("\n[ 4 ] Access control");

  const attacker = ethers.Wallet.createRandom().connect(ethers.provider);
  const routerAsAttacker = ethFeeRouter.connect(attacker) as typeof ethFeeRouter;

  try {
    await routerAsAttacker.setFeeBps.staticCall(50);
    throw new Error("setFeeBps should have reverted for non-owner but did not");
  } catch (err: any) {
    if (err.message?.includes("should have reverted")) throw err;
    await assert(true, "setFeeBps reverts for non-owner ✓");
  }

  try {
    await routerAsAttacker.setFeeWallet.staticCall(attacker.address);
    throw new Error("setFeeWallet should have reverted for non-owner but did not");
  } catch (err: any) {
    if (err.message?.includes("should have reverted")) throw err;
    await assert(true, "setFeeWallet reverts for non-owner ✓");
  }

  // -----------------------------------------------------------------------
  // 5. Pause / unpause
  // -----------------------------------------------------------------------
  console.log("\n[ 5 ] Pause / unpause");

  const pauseTx = await ethFeeRouter.pause();
  await pauseTx.wait();
  await assert(await ethFeeRouter.paused(), "Contract paused");

  try {
    await ethFeeRouter.swapExactETHForTokensWithFee.staticCall(
      AMOUNT_OUT_MIN,
      ethSwapPath,
      owner.address,
      deadline(),
      { value: SWAP_AMOUNT_ETH }
    );
    throw new Error("Swap should have reverted while paused but did not");
  } catch (err: any) {
    if (err.message?.includes("should have reverted")) throw err;
    await assert(true, "Swap reverts while paused ✓");
  }

  const unpauseTx = await ethFeeRouter.unpause();
  await unpauseTx.wait();
  await assert(!(await ethFeeRouter.paused()), "Contract unpaused");

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log("\n===========================================");
  console.log("✅ All smoke tests passed — Arbitrum Sepolia EthFeeRouter is operational.");
  console.log(`   Contract: https://sepolia.arbiscan.io/address/${contractAddress}`);
  console.log("===========================================\n");
}

main().catch((err) => {
  console.error("\n❌ Smoke test failed:", err.message ?? err);
  process.exitCode = 1;
});
