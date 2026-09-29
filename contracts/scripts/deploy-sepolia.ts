/**
 * deploy-sepolia.ts
 *
 * Deploys EthFeeRouter to Ethereum Sepolia (chain ID 11155111).
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in contracts/.env (throwaway dev wallet)
 *   - Deployer address funded with Sepolia ETH (faucet: https://sepoliafaucet.com)
 *   - SEPOLIA_RPC_URL set in contracts/.env (Alchemy/Infura key)
 *   - ETH_FEE_WALLET_ADDRESS set in contracts/.env
 *
 * Usage:
 *   npx hardhat run scripts/deploy-sepolia.ts --network sepolia
 *
 * Uniswap V2 Router02 on Sepolia:
 *   0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Uniswap V2 Router02 on Sepolia (maintained by Uniswap Labs)
const UNISWAP_ROUTER_SEPOLIA = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";

// Fee in basis points: 15 = 0.15%
const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "sepolia") {
    throw new Error(
      `Wrong network: expected "sepolia", got "${networkName}". ` +
        `Run with --network sepolia`
    );
  }

  const feeWallet = process.env.ETH_FEE_WALLET_ADDRESS;
  if (!feeWallet) {
    throw new Error(
      "ETH_FEE_WALLET_ADDRESS is not set in .env. " +
        "Set it to the address that should receive the 0.15% fee on Ethereum."
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("\n=== EthFeeRouter — Sepolia Deployment ===");
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} Sepolia ETH`);
  console.log(`Network  : ${networkName} (chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Router   : ${UNISWAP_ROUTER_SEPOLIA}`);
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Fee bps  : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  const EthFeeRouterFactory = await ethers.getContractFactory("EthFeeRouter");

  console.log("Deploying EthFeeRouter...");
  const ethFeeRouter = await EthFeeRouterFactory.deploy(
    UNISWAP_ROUTER_SEPOLIA,
    feeWallet,
    FEE_BPS,
    deployer.address // initialOwner
  );

  console.log(`Tx hash  : ${ethFeeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  try {
    await ethFeeRouter.deploymentTransaction()?.wait(5);
  } catch (waitErr: any) {
    // See deploy-bsc-mainnet.ts's matching catch block for the full
    // explanation — some RPC responses return `"to": ""` instead of
    // `"to": null` on a contract-creation receipt, which ethers v6's
    // strict parser rejects while polling for confirmations. Not a failed
    // deployment; `contractAddress` below needs no RPC round-trip.
    console.warn(
      `\n⚠️  Couldn't confirm via wait() — likely an RPC/ethers formatting bug, not a failed deployment. Details: ${waitErr.shortMessage || waitErr.message}\n` +
        "Continuing to write the deployment record; verify the tx hash below on Etherscan.\n"
    );
  }

  const contractAddress = await ethFeeRouter.getAddress();
  const deployTxHash = ethFeeRouter.deploymentTransaction()?.hash ?? "";

  console.log("\n✅ EthFeeRouter deployed!");
  console.log(`Address  : ${contractAddress}`);
  console.log(`Tx hash  : ${deployTxHash}`);

  // --- Persist deployment record ---
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const record = {
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
  };

  const outputPath = path.join(deploymentsDir, "sepolia.json");
  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved to: ${outputPath}`);

  console.log("\n--- Next steps ---");
  console.log("1. Verify source:  npx hardhat run scripts/verify-sepolia.ts --network sepolia");
  console.log("2. Smoke test:     npx hardhat run scripts/smoke-test-sepolia.ts --network sepolia");
  console.log(`3. Explorer:       https://sepolia.etherscan.io/address/${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
