/**
 * deploy-bsc-testnet.ts
 *
 * Deploys FeeRouter to BSC Testnet (Chapel, chain ID 97).
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in contracts/.env (throwaway dev wallet, NOT mainnet)
 *   - Deployer address funded with tBNB (faucet: https://testnet.bnbchain.org/faucet-smart)
 *   - BSC_FEE_WALLET_ADDRESS set in contracts/.env
 *
 * Usage:
 *   npx hardhat run scripts/deploy-bsc-testnet.ts --network bscTestnet
 *
 * PancakeSwap Router02 on BSC Testnet (Chapel):
 *   0xD99D1c33F9fC3444f8101754aBC46c52416550D1
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// PancakeSwap Router02 on BSC Testnet (Chapel)
const PANCAKE_ROUTER_BSC_TESTNET = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";

// Fee in basis points: 15 = 0.15%
const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "bscTestnet") {
    throw new Error(
      `Wrong network: expected "bscTestnet", got "${networkName}". ` +
        `Run with --network bscTestnet`
    );
  }

  const feeWallet = process.env.BSC_FEE_WALLET_ADDRESS;
  if (!feeWallet) {
    throw new Error(
      "BSC_FEE_WALLET_ADDRESS is not set in .env. " +
        "Set it to the address that should receive the 0.15% fee."
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("\n=== FeeRouter — BSC Testnet Deployment ===");
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} tBNB`);
  console.log(`Network  : ${networkName} (chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Router   : ${PANCAKE_ROUTER_BSC_TESTNET}`);
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Fee bps  : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  const FeeRouterFactory = await ethers.getContractFactory("FeeRouter");

  console.log("Deploying FeeRouter...");
  const feeRouter = await FeeRouterFactory.deploy(
    PANCAKE_ROUTER_BSC_TESTNET,
    feeWallet,
    FEE_BPS,
    deployer.address // initialOwner
  );

  console.log(`Tx hash  : ${feeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  await feeRouter.deploymentTransaction()?.wait(5);

  const contractAddress = await feeRouter.getAddress();
  const deployTxHash = feeRouter.deploymentTransaction()?.hash ?? "";

  console.log("\n✅ FeeRouter deployed!");
  console.log(`Address  : ${contractAddress}`);
  console.log(`Tx hash  : ${deployTxHash}`);

  // --- Persist deployment record ---
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
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
  };

  const outputPath = path.join(deploymentsDir, "bsc-testnet.json");
  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved to: ${outputPath}`);

  console.log("\n--- Next steps ---");
  console.log("1. Verify source:  npx hardhat run scripts/verify-bsc-testnet.ts --network bscTestnet");
  console.log("2. Smoke test:     npx hardhat run scripts/smoke-test-bsc-testnet.ts --network bscTestnet");
  console.log(`3. Explorer:       https://testnet.bscscan.com/address/${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
