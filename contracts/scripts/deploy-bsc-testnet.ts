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

// PancakeSwap V3 support (added 2026-09-29) — no confirmed V3 SwapRouter
// address found for Chapel testnet at time of writing, and testnet V3
// liquidity wouldn't help anyway (our test tokens have no real pools
// there). Deployed with V3 disabled (zero address); the V3 swap functions
// then revert with V3RouterNotSet, same as the pre-V3 contract shape. The
// V3 logic itself is covered by test/FeeRouter.test.ts's mocked unit
// tests, not this deployment. wrappedNative is still set to real testnet
// WBNB so it's ready if a testnet V3 SwapRouter address turns up later.
const PANCAKE_V3_ROUTER_BSC_TESTNET = ethers.ZeroAddress;
const WBNB_BSC_TESTNET = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

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
  console.log(`V3 Router: ${PANCAKE_V3_ROUTER_BSC_TESTNET} ${PANCAKE_V3_ROUTER_BSC_TESTNET === ethers.ZeroAddress ? "(disabled)" : ""}`);
  console.log(`WBNB     : ${WBNB_BSC_TESTNET}`);
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Fee bps  : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  const FeeRouterFactory = await ethers.getContractFactory("FeeRouter");

  console.log("Deploying FeeRouter...");
  const feeRouter = await FeeRouterFactory.deploy(
    PANCAKE_ROUTER_BSC_TESTNET,
    PANCAKE_V3_ROUTER_BSC_TESTNET,
    WBNB_BSC_TESTNET,
    feeWallet,
    FEE_BPS,
    deployer.address // initialOwner
  );

  console.log(`Tx hash  : ${feeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  try {
    await feeRouter.deploymentTransaction()?.wait(5);
  } catch (waitErr: any) {
    // See deploy-bsc-mainnet.ts's matching catch block for the full
    // explanation — some RPC responses return `"to": ""` instead of
    // `"to": null` on a contract-creation receipt, which ethers v6's
    // strict parser rejects while polling for confirmations. Not a failed
    // deployment; `contractAddress` below needs no RPC round-trip.
    console.warn(
      `\n⚠️  Couldn't confirm via wait() — likely an RPC/ethers formatting bug, not a failed deployment. Details: ${waitErr.shortMessage || waitErr.message}\n` +
        "Continuing to write the deployment record; verify the tx hash below on testnet.bscscan.com.\n"
    );
  }

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
      v3Router: PANCAKE_V3_ROUTER_BSC_TESTNET,
      wrappedNative: WBNB_BSC_TESTNET,
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
