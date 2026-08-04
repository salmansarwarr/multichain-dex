/**
 * deploy-arbitrum-sepolia-tusdt.ts
 *
 * Adds a third mock token (tUSDT) to the existing Arbitrum Sepolia test
 * fixture set (see deploy-arbitrum-sepolia.ts) so the frontend can offer a
 * USDT-denominated swap on this network. Does NOT redeploy the router or
 * EthFeeRouter — only deploys one more MockERC20 and mints it into the
 * already-deployed MockUniswapRouter so a real pool exists for it.
 *
 * Prerequisites:
 *   - contracts/deployments/arbitrum-sepolia.json already exists (from
 *     deploy-arbitrum-sepolia.ts)
 *   - DEPLOYER_PRIVATE_KEY funded with Arbitrum Sepolia ETH for gas
 *
 * Usage:
 *   npx hardhat run scripts/deploy-arbitrum-sepolia-tusdt.ts --network arbitrumSepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Seed liquidity: 10,000,000,000 tUSDT (6 decimals), same order of
// magnitude as the existing tUSDC seed in deploy-arbitrum-sepolia.ts.
const SEED_TUSDT = 10_000_000_000n * 10n ** 6n;

async function main() {
  const networkName = network.name;
  if (networkName !== "arbitrumSepolia") {
    throw new Error(
      `Wrong network: expected "arbitrumSepolia", got "${networkName}". ` +
        `Run with --network arbitrumSepolia`
    );
  }

  const recordPath = path.join(__dirname, "../deployments/arbitrum-sepolia.json");
  if (!fs.existsSync(recordPath)) {
    throw new Error(`No deployment record found at ${recordPath}.\nRun deploy-arbitrum-sepolia.ts first.`);
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const mockRouterAddress: string = record.mocks.mockRouter;

  const [deployer] = await ethers.getSigners();
  console.log("\n=== tUSDT — Arbitrum Sepolia ===");
  console.log(`Deployer   : ${deployer.address}`);
  console.log(`Mock router: ${mockRouterAddress}`);

  console.log("\nDeploying MockERC20 tUSDT (6 decimals)...");
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const tUSDT = await MockERC20Factory.deploy("Test Tether USD", "tUSDT", 6);
  await tUSDT.waitForDeployment();
  const tUSDTAddress = await tUSDT.getAddress();
  console.log(`  tUSDT    : ${tUSDTAddress}`);

  console.log(`Seeding router with ${ethers.formatUnits(SEED_TUSDT, 6)} tUSDT...`);
  const seedTx = await tUSDT.mint(mockRouterAddress, SEED_TUSDT);
  await seedTx.wait();

  record.mocks.tUSDT = tUSDTAddress;
  record.mocks.tUSDTAddedAt = new Date().toISOString();
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record updated: ${recordPath}`);
  console.log(`Explorer: https://sepolia.arbiscan.io/address/${tUSDTAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
