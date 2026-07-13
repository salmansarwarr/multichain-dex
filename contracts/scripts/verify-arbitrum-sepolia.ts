/**
 * verify-arbitrum-sepolia.ts
 *
 * Submits EthFeeRouter (and its supporting mock test contracts) to Arbiscan
 * Sepolia for verification. Reads addresses and constructor args from
 * deployments/arbitrum-sepolia.json (written by deploy-arbitrum-sepolia.ts).
 *
 * Prerequisites:
 *   - deployments/arbitrum-sepolia.json exists (run deploy-arbitrum-sepolia.ts first)
 *
 * Usage:
 *   npx hardhat run scripts/verify-arbitrum-sepolia.ts --network arbitrumSepolia
 *
 * Note: Arbiscan can take 30–90 seconds to index a new contract. If you get
 * a "contract not found" error immediately after deployment, wait a minute
 * and re-run this script.
 */

import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function verifyOne(label: string, address: string, constructorArguments: unknown[], contract?: string) {
  console.log(`\nVerifying ${label} (${address})...`);
  try {
    await run("verify:verify", { address, constructorArguments, contract });
    console.log(`✅ ${label} verified.`);
  } catch (err: any) {
    if (err.message?.includes("Already Verified")) {
      console.warn(`⚠️  ${label} is already verified — no action needed.`);
    } else {
      console.error(`❌ ${label} verification failed:`, err.message ?? err);
    }
  }
}

async function main() {
  const recordPath = path.join(__dirname, "../deployments/arbitrum-sepolia.json");

  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `Deployment record not found at ${recordPath}.\n` +
        `Run deploy-arbitrum-sepolia.ts first: npx hardhat run scripts/deploy-arbitrum-sepolia.ts --network arbitrumSepolia`
    );
  }

  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const { address, constructorArgs, mocks } = record;

  console.log("\n=== EthFeeRouter — Arbiscan Sepolia Verification ===");
  console.log(`Contract : ${address}`);
  console.log(`Explorer : https://sepolia.arbiscan.io/address/${address}`);

  await verifyOne(
    "EthFeeRouter",
    address,
    [constructorArgs.uniswapRouter, constructorArgs.feeWallet, constructorArgs.feeBps, constructorArgs.initialOwner],
    "contracts/EthFeeRouter.sol:EthFeeRouter"
  );

  if (mocks) {
    await verifyOne("MockUniswapRouter", mocks.mockRouter, [], "contracts/mocks/MockUniswapRouter.sol:MockUniswapRouter");
    await verifyOne("MockERC20 (tWETH)", mocks.tWETH, ["Test Wrapped ETH", "tWETH", 18], "contracts/mocks/MockErc20.sol:MockERC20");
    await verifyOne("MockERC20 (tUSDC)", mocks.tUSDC, ["Test USD Coin", "tUSDC", 6], "contracts/mocks/MockErc20.sol:MockERC20");
  }

  console.log(`\nCheck: https://sepolia.arbiscan.io/address/${address}#code`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
