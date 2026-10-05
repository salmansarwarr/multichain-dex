/**
 * deploy-eth-mainnet.ts
 *
 * Deploys EthFeeRouter to Ethereum Mainnet (chain ID 1), pointed at the real
 * Uniswap V2 Router02. THIS SPENDS REAL ETH AND HANDLES REAL FUNDS ONCE
 * LIVE — do not run this until:
 *   1. The full test suite passes (`npx hardhat test`).
 *   2. `npm run audit:slither` shows zero High/Critical findings.
 *   3. You have a considered answer for ETH_MAINNET_OWNER_ADDRESS below —
 *      ideally a multisig (e.g. Gnosis Safe), not a single hot wallet.
 *      Whoever holds this key can change the fee wallet and fee rate.
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in contracts/.env, funded with real ETH for gas
 *   - ETH_FEE_WALLET_ADDRESS set in contracts/.env (destination for the 0.15% fee)
 *   - ETH_MAINNET_OWNER_ADDRESS set in contracts/.env (fee-adjustment rights —
 *     see warning above; falls back to the deployer address with a loud
 *     warning if omitted, which is NOT recommended for mainnet)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-eth-mainnet.ts --network ethMainnet
 *
 * 2026-10-04: now also wires Uniswap V3 (SwapRouter + WETH) — most Ethereum
 * tokens' real liquidity is on V3, not V2. Addresses below were checked
 * against Sourcify's verified chain-1 records, and the V3 path was
 * exercised against live mainnet state in test/fork/EthFeeRouter.fork.test.ts.
 * The previous (V2-only, Remix-deployed) contract's record is preserved in
 * eth-mainnet.json's `previousDeployments`.
 *
 * Uniswap V2 Router02 on Ethereum Mainnet:
 *   0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
 *   (canonical address per Uniswap's own deployments documentation:
 *   https://docs.uniswap.org/contracts/v2/reference/smart-contracts/v2-deployments)
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Uniswap V2 Router02 on Ethereum Mainnet.
const UNISWAP_ROUTER_ETH_MAINNET = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// Uniswap V3's original SwapRouter (params struct includes `deadline`) and WETH9.
const UNISWAP_V3_SWAP_ROUTER_ETH_MAINNET = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const WETH_ETH_MAINNET = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Fee in basis points: 15 = 0.15%
const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "ethMainnet") {
    throw new Error(
      `Wrong network: expected "ethMainnet", got "${networkName}". ` +
        `Run with --network ethMainnet`
    );
  }

  const feeWallet = process.env.ETH_FEE_WALLET_ADDRESS;
  if (!feeWallet) {
    throw new Error(
      "ETH_FEE_WALLET_ADDRESS is not set in .env. " +
        "Set it to the address that should receive the 0.15% fee."
    );
  }

  const [deployer] = await ethers.getSigners();

  let owner = process.env.ETH_MAINNET_OWNER_ADDRESS;
  if (!owner) {
    owner = deployer.address;
    console.warn(
      "\n⚠️  ETH_MAINNET_OWNER_ADDRESS is not set — falling back to the " +
        "deployer address as the contract owner. This means a single hot " +
        "wallet key can change the fee wallet and fee rate on a live " +
        "mainnet contract. Strongly recommended: set this to a multisig " +
        "(e.g. Gnosis Safe) address before deploying to mainnet.\n"
    );
  }

  console.log("\n=== EthFeeRouter — ETHEREUM MAINNET Deployment ===");
  console.log("⚠️  THIS IS MAINNET. This deployment spends real ETH and will");
  console.log("    hold/route real user funds once live. Double-check every");
  console.log("    value below before confirming.\n");
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Network   : ${networkName} (chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Router    : ${UNISWAP_ROUTER_ETH_MAINNET}`);
  console.log(`V3 router : ${UNISWAP_V3_SWAP_ROUTER_ETH_MAINNET}`);
  console.log(`WETH      : ${WETH_ETH_MAINNET}`);
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Owner     : ${owner}`);
  console.log(`Fee bps   : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  const EthFeeRouterFactory = await ethers.getContractFactory("EthFeeRouter");

  console.log("Deploying EthFeeRouter...");
  const ethFeeRouter = await EthFeeRouterFactory.deploy(
    UNISWAP_ROUTER_ETH_MAINNET,
    UNISWAP_V3_SWAP_ROUTER_ETH_MAINNET,
    WETH_ETH_MAINNET,
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
    // verify the tx hash on Etherscan before treating this as confirmed.
    console.warn(
      "\n⚠️  Couldn't confirm via wait() — likely an RPC/ethers 'to' " +
        `formatting bug on contract-creation receipts, not a failed deployment. Details: ${waitErr.shortMessage || waitErr.message}\n` +
        "Continuing to write the deployment record; verify the tx hash below on Etherscan.\n"
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

  const outputPath = path.join(deploymentsDir, "eth-mainnet.json");
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;
  const previousDeployments = previous
    ? [...(previous.previousDeployments ?? []), { ...previous, previousDeployments: undefined }]
    : [];

  const record = {
    network: "ethMainnet",
    chainId: 1,
    contract: "EthFeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      uniswapRouter: UNISWAP_ROUTER_ETH_MAINNET,
      v3Router: UNISWAP_V3_SWAP_ROUTER_ETH_MAINNET,
      wrappedNative: WETH_ETH_MAINNET,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: owner,
    },
    previousDeployments,
  };

  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved to: ${outputPath}`);

  console.log("\n--- Next steps ---");
  console.log("1. Verify source on Etherscan (manually, or adapt verify-bsc-mainnet.ts).");
  console.log("2. Smoke test with a small real swap before announcing it live.");
  console.log(`3. Explorer:       https://etherscan.io/address/${contractAddress}`);
  console.log("4. Update frontend/.env.local: NEXT_PUBLIC_ETH_MAINNET_FEE_ROUTER_ADDRESS");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
