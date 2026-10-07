/**
 * redeploy-arbitrum-sepolia.ts
 *
 * Redeploys EthFeeRouter to Arbitrum Sepolia after the 2026-08-04 contract
 * update, pointed at the EXISTING mock router/tokens (does NOT redeploy
 * the mock router, tWETH, tUSDC, or tUSDT — those are unaffected by the
 * contract fix and reusing them avoids re-seeding liquidity from scratch).
 * Merges into the existing deployments/arbitrum-sepolia.json record.
 *
 * Usage:
 *   npx hardhat run scripts/redeploy-arbitrum-sepolia.ts --network arbitrumSepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "arbitrumSepolia") {
    throw new Error(`Wrong network: expected "arbitrumSepolia", got "${networkName}".`);
  }

  const feeWallet = process.env.ARB_FEE_WALLET_ADDRESS;
  if (!feeWallet) throw new Error("ARB_FEE_WALLET_ADDRESS is not set in .env.");

  const recordPath = path.join(__dirname, "../deployments/arbitrum-sepolia.json");
  if (!fs.existsSync(recordPath)) {
    throw new Error(`No deployment record found at ${recordPath}. Run deploy-arbitrum-sepolia.ts first.`);
  }
  const existing = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const mockRouterAddress: string = existing.mocks.mockRouter;

  const [deployer] = await ethers.getSigners();
  console.log("\n=== EthFeeRouter — Arbitrum Sepolia Redeploy ===");
  console.log(`Deployer    : ${deployer.address}`);
  console.log(`Fee wallet  : ${feeWallet}`);
  console.log(`Mock router : ${mockRouterAddress} (reused, not redeployed)`);

  const EthFeeRouterFactory = await ethers.getContractFactory("EthFeeRouter");
  const ethFeeRouter = await EthFeeRouterFactory.deploy(
    mockRouterAddress,
    ethers.ZeroAddress, // v3Router: V3 not wired on this chain yet
    ethers.ZeroAddress, // wrappedNative
    ethers.ZeroAddress, // aggregatorRouter
    feeWallet,
    FEE_BPS,
    deployer.address
  );
  console.log(`Tx hash     : ${ethFeeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  await ethFeeRouter.deploymentTransaction()?.wait(5);

  const contractAddress = await ethFeeRouter.getAddress();
  const deployTxHash = ethFeeRouter.deploymentTransaction()?.hash ?? "";
  console.log(`\n✅ EthFeeRouter redeployed: ${contractAddress}`);

  const previousDeployments = existing.previousDeployments ?? [];
  const { previousDeployments: _drop, mocks, ...archived } = existing;
  previousDeployments.push({ ...archived, replacedAt: new Date().toISOString(), replacedReason: "2026-08-04 security-review fixes (feeWallet DoS, rescue functions, to!=0 check)" });

  const record = {
    network: "arbitrumSepolia",
    chainId: 421614,
    contract: "EthFeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      uniswapRouter: mockRouterAddress,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: deployer.address,
    },
    mocks,
    previousDeployments,
  };

  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  console.log(`Deployment record updated: ${recordPath}`);
  console.log(`Explorer: https://sepolia.arbiscan.io/address/${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
