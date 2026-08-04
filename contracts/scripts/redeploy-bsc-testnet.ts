/**
 * redeploy-bsc-testnet.ts
 *
 * Redeploys FeeRouter to BSC Testnet after the 2026-08-04 contract update
 * (feeWallet-DoS fix, rescue functions, to!=0 check, etc — see
 * docs/ security review). Unlike deploy-bsc-testnet.ts, this MERGES into
 * the existing deployments/bsc-testnet.json record instead of overwriting
 * it, preserving deployment history under `previousDeployments`.
 *
 * Usage:
 *   npx hardhat run scripts/redeploy-bsc-testnet.ts --network bscTestnet
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const PANCAKE_ROUTER_BSC_TESTNET = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "bscTestnet") {
    throw new Error(`Wrong network: expected "bscTestnet", got "${networkName}".`);
  }

  const feeWallet = process.env.BSC_FEE_WALLET_ADDRESS;
  if (!feeWallet) throw new Error("BSC_FEE_WALLET_ADDRESS is not set in .env.");

  const [deployer] = await ethers.getSigners();
  console.log("\n=== FeeRouter — BSC Testnet Redeploy ===");
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Fee wallet: ${feeWallet}`);

  const FeeRouterFactory = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouterFactory.deploy(
    PANCAKE_ROUTER_BSC_TESTNET,
    feeWallet,
    FEE_BPS,
    deployer.address
  );
  console.log(`Tx hash   : ${feeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  await feeRouter.deploymentTransaction()?.wait(5);

  const contractAddress = await feeRouter.getAddress();
  const deployTxHash = feeRouter.deploymentTransaction()?.hash ?? "";
  console.log(`\n✅ FeeRouter redeployed: ${contractAddress}`);

  const recordPath = path.join(__dirname, "../deployments/bsc-testnet.json");
  const existing = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, "utf8")) : null;

  const previousDeployments = existing?.previousDeployments ?? [];
  if (existing) {
    const { previousDeployments: _drop, ...archived } = existing;
    previousDeployments.push({ ...archived, replacedAt: new Date().toISOString(), replacedReason: "2026-08-04 security-review fixes (feeWallet DoS, rescue functions, to!=0 check)" });
  }

  const record = {
    network: "bscTestnet",
    chainId: 97,
    contract: "FeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      pancakeRouter: PANCAKE_ROUTER_BSC_TESTNET,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: deployer.address,
    },
    previousDeployments,
  };

  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  console.log(`Deployment record updated: ${recordPath}`);
  console.log(`Explorer: https://testnet.bscscan.com/address/${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
