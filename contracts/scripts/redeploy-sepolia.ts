/**
 * redeploy-sepolia.ts
 *
 * Redeploys EthFeeRouter to Ethereum Sepolia after the 2026-08-04 contract
 * update. Merges into the existing deployments/sepolia.json record instead
 * of overwriting it — preserves the `mocks` block (tUSDT pool info) and
 * archives the prior deployment under `previousDeployments`.
 *
 * Usage:
 *   npx hardhat run scripts/redeploy-sepolia.ts --network sepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const UNISWAP_ROUTER_SEPOLIA = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "sepolia") {
    throw new Error(`Wrong network: expected "sepolia", got "${networkName}".`);
  }

  const feeWallet = process.env.ETH_FEE_WALLET_ADDRESS;
  if (!feeWallet) throw new Error("ETH_FEE_WALLET_ADDRESS is not set in .env.");

  const [deployer] = await ethers.getSigners();
  console.log("\n=== EthFeeRouter — Sepolia Redeploy ===");
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Fee wallet: ${feeWallet}`);

  const EthFeeRouterFactory = await ethers.getContractFactory("EthFeeRouter");
  const ethFeeRouter = await EthFeeRouterFactory.deploy(
    UNISWAP_ROUTER_SEPOLIA,
    ethers.ZeroAddress, // v3Router: V3 not wired on this chain yet
    ethers.ZeroAddress, // wrappedNative
    feeWallet,
    FEE_BPS,
    deployer.address
  );
  console.log(`Tx hash   : ${ethFeeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  await ethFeeRouter.deploymentTransaction()?.wait(5);

  const contractAddress = await ethFeeRouter.getAddress();
  const deployTxHash = ethFeeRouter.deploymentTransaction()?.hash ?? "";
  console.log(`\n✅ EthFeeRouter redeployed: ${contractAddress}`);

  const recordPath = path.join(__dirname, "../deployments/sepolia.json");
  const existing = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, "utf8")) : null;

  const previousDeployments = existing?.previousDeployments ?? [];
  const mocks = existing?.mocks;
  if (existing) {
    const { previousDeployments: _drop, mocks: _mocksDrop, ...archived } = existing;
    previousDeployments.push({ ...archived, replacedAt: new Date().toISOString(), replacedReason: "2026-08-04 security-review fixes (feeWallet DoS, rescue functions, to!=0 check)" });
  }

  const record: Record<string, unknown> = {
    network: "sepolia",
    chainId: 11155111,
    contract: "EthFeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      uniswapRouter: UNISWAP_ROUTER_SEPOLIA,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: deployer.address,
    },
    previousDeployments,
  };
  if (mocks) record.mocks = mocks;

  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  console.log(`Deployment record updated: ${recordPath}`);
  console.log(`Explorer: https://sepolia.etherscan.io/address/${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
