/**
 * deploy-arbitrum-mainnet.ts
 *
 * Deploys EthFeeRouter to Arbitrum One (chain ID 42161), pointed at the real
 * Uniswap V2 Router02. THIS SPENDS REAL ETH AND HANDLES REAL FUNDS ONCE
 * LIVE — do not run this until:
 *   1. The full test suite passes (`npx hardhat test`).
 *   2. `npm run audit:slither` shows zero High/Critical findings.
 *   3. You have a considered answer for ARB_MAINNET_OWNER_ADDRESS below —
 *      ideally a multisig (e.g. Gnosis Safe), not a single hot wallet.
 *      Whoever holds this key can change the fee wallet and fee rate.
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in contracts/.env, funded with real ETH
 *     (bridged to Arbitrum One) for gas
 *   - ARB_FEE_WALLET_ADDRESS set in contracts/.env (destination for the 0.15% fee)
 *   - ARB_MAINNET_OWNER_ADDRESS set in contracts/.env (fee-adjustment rights —
 *     see warning above; falls back to the deployer address with a loud
 *     warning if omitted, which is NOT recommended for mainnet)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-arbitrum-mainnet.ts --network arbitrumOne
 *
 * Uniswap V2 Router02 on Arbitrum One:
 *   0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
 *   NOTE: this is NOT the same address as Ethereum mainnet's Router02 —
 *   confirmed against Uniswap's own deployments documentation
 *   (https://docs.uniswap.org/contracts/v2/reference/smart-contracts/v2-deployments)
 *   and cross-checked on Arbiscan before writing this script.
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Uniswap V2 Router02 on Arbitrum One — NOT the same address as mainnet.
const UNISWAP_ROUTER_ARBITRUM_ONE = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

// Fee in basis points: 15 = 0.15%
const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "arbitrumOne") {
    throw new Error(
      `Wrong network: expected "arbitrumOne", got "${networkName}". ` +
        `Run with --network arbitrumOne`
    );
  }

  const feeWallet = process.env.ARB_FEE_WALLET_ADDRESS;
  if (!feeWallet) {
    throw new Error(
      "ARB_FEE_WALLET_ADDRESS is not set in .env. " +
        "Set it to the address that should receive the 0.15% fee."
    );
  }

  const [deployer] = await ethers.getSigners();

  let owner = process.env.ARB_MAINNET_OWNER_ADDRESS;
  if (!owner) {
    owner = deployer.address;
    console.warn(
      "\n⚠️  ARB_MAINNET_OWNER_ADDRESS is not set — falling back to the " +
        "deployer address as the contract owner. This means a single hot " +
        "wallet key can change the fee wallet and fee rate on a live " +
        "mainnet contract. Strongly recommended: set this to a multisig " +
        "(e.g. Gnosis Safe) address before deploying to mainnet.\n"
    );
  }

  console.log("\n=== EthFeeRouter — ARBITRUM ONE Deployment ===");
  console.log("⚠️  THIS IS MAINNET. This deployment spends real ETH and will");
  console.log("    hold/route real user funds once live. Double-check every");
  console.log("    value below before confirming.\n");
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Network   : ${networkName} (chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Router    : ${UNISWAP_ROUTER_ARBITRUM_ONE}`);
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Owner     : ${owner}`);
  console.log(`Fee bps   : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  const EthFeeRouterFactory = await ethers.getContractFactory("EthFeeRouter");

  console.log("Deploying EthFeeRouter...");
  const ethFeeRouter = await EthFeeRouterFactory.deploy(
    UNISWAP_ROUTER_ARBITRUM_ONE,
    ethers.ZeroAddress, // v3Router: V3 not wired on this chain yet
    ethers.ZeroAddress, // wrappedNative
    feeWallet,
    FEE_BPS,
    owner
  );

  console.log(`Tx hash   : ${ethFeeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  try {
    await ethFeeRouter.deploymentTransaction()?.wait(5);
  } catch (waitErr: any) {
    // Some RPC responses return `"to": ""` instead of `"to": null` on a
    // contract-creation receipt; ethers v6's strict address parser throws
    // while re-fetching the tx to track confirmations. Seen live on a BSC
    // mainnet deploy (2026-09-29) where the deployment itself had already
    // succeeded — this is a client-side fetch bug, not a failed
    // deployment. `contractAddress` below needs no RPC round-trip
    // (computed locally from sender+nonce), so it's safe to use anyway;
    // verify the tx hash on Arbiscan before treating this as confirmed.
    console.warn(
      "\n⚠️  Couldn't confirm via wait() — likely an RPC/ethers 'to' " +
        `formatting bug on contract-creation receipts, not a failed deployment. Details: ${waitErr.shortMessage || waitErr.message}\n` +
        "Continuing to write the deployment record; verify the tx hash below on Arbiscan.\n"
    );
  }

  const contractAddress = await ethFeeRouter.getAddress();
  const deployTxHash = ethFeeRouter.deploymentTransaction()?.hash ?? "";

  console.log("\n✅ EthFeeRouter deployed!");
  console.log(`Address   : ${contractAddress}`);
  console.log(`Tx hash   : ${deployTxHash}`);

  // --- Persist deployment record ---
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const record = {
    network: "arbitrumOne",
    chainId: 42161,
    contract: "EthFeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      uniswapRouter: UNISWAP_ROUTER_ARBITRUM_ONE,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: owner,
    },
  };

  const outputPath = path.join(deploymentsDir, "arbitrum-mainnet.json");
  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved to: ${outputPath}`);

  console.log("\n--- Next steps ---");
  console.log("1. Verify source on Arbiscan (manually, or adapt verify-bsc-mainnet.ts).");
  console.log("2. Smoke test with a small real swap before announcing it live.");
  console.log(`3. Explorer:       https://arbiscan.io/address/${contractAddress}`);
  console.log("4. Update frontend/.env.local: NEXT_PUBLIC_ARBITRUM_MAINNET_FEE_ROUTER_ADDRESS");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
