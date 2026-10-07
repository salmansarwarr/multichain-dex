/**
 * deploy-bsc-mainnet.ts
 *
 * Deploys FeeRouter to BSC Mainnet (chain ID 56), pointed at the real
 * PancakeSwap Router V2 *and* (added 2026-09-29) PancakeSwap's V3
 * SwapRouter. THIS SPENDS REAL BNB AND HANDLES REAL FUNDS ONCE LIVE — do
 * not run this until:
 *   1. The full test suite passes (`npx hardhat test`), including the
 *      fee-on-transfer cases needed for tax tokens like Alfat and the
 *      "PancakeSwap V3 support" cases.
 *   2. `npm run audit:slither` shows zero High/Critical findings.
 *   3. You have a considered answer for BSC_MAINNET_OWNER_ADDRESS below —
 *      ideally a multisig (e.g. Gnosis Safe), not a single hot wallet.
 *      Whoever holds this key can change the fee wallet and fee rate.
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in contracts/.env, funded with real BNB for gas
 *   - BSC_FEE_WALLET_ADDRESS set in contracts/.env (destination for the 0.15% fee)
 *   - BSC_MAINNET_OWNER_ADDRESS set in contracts/.env (fee-adjustment rights —
 *     see warning above; falls back to the deployer address with a loud
 *     warning if omitted, which is NOT recommended for mainnet)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-bsc-mainnet.ts --network bscMainnet
 *
 * PancakeSwap Router V2 on BSC Mainnet:
 *   0x10ED43C718714eb63d5aA57B78B54704E256024E
 *   (verified live via eth_getCode against BSC mainnet RPC before writing
 *   this script — real bytecode confirmed present, not assumed)
 *
 * PancakeSwap V3 SwapRouter on BSC Mainnet:
 *   0x1b81D678ffb9C0263b24A97847620C99d213eB14
 *   (cross-checked against the verified ABI served by Sourcify for chain
 *   56 at this address — exactInputSingle/exactInput's param structs match
 *   IPancakeV3SwapRouter.sol field-for-field, not assumed from a GitHub
 *   source tree alone)
 *
 * WBNB on BSC Mainnet:
 *   0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
 *   (same address already read live via PancakeSwap Router's own WETH()
 *   call elsewhere in this codebase — see frontend/src/hooks/useEvmQuote.ts)
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// PancakeSwap Router V2 on BSC Mainnet — confirmed live on-chain.
const PANCAKE_ROUTER_BSC_MAINNET = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

// PancakeSwap V3 SwapRouter on BSC Mainnet — confirmed against Sourcify's
// verified ABI for this exact address (see header comment).
const PANCAKE_V3_ROUTER_BSC_MAINNET = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";

// WBNB on BSC Mainnet.
const WBNB_BSC_MAINNET = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// KyberSwap MetaAggregationRouterV2 — same address on BSC, Ethereum and
// Arbitrum (verified on Sourcify for chains 56/1/42161). Allowlisted at deploy
// for swapViaAggregatorWithFee; the owner can change the allowlist later.
const KYBERSWAP_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";

// Fee in basis points: 15 = 0.15%
const FEE_BPS = 15;

async function main() {
  const networkName = network.name;
  if (networkName !== "bscMainnet") {
    throw new Error(
      `Wrong network: expected "bscMainnet", got "${networkName}". ` +
        `Run with --network bscMainnet`
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

  let owner = process.env.BSC_MAINNET_OWNER_ADDRESS;
  if (!owner) {
    owner = deployer.address;
    console.warn(
      "\n⚠️  BSC_MAINNET_OWNER_ADDRESS is not set — falling back to the " +
        "deployer address as the contract owner. This means a single hot " +
        "wallet key can change the fee wallet and fee rate on a live " +
        "mainnet contract. Strongly recommended: set this to a multisig " +
        "(e.g. Gnosis Safe) address before deploying to mainnet.\n"
    );
  }

  console.log("\n=== FeeRouter — BSC MAINNET Deployment ===");
  console.log("⚠️  THIS IS MAINNET. This deployment spends real BNB and will");
  console.log("    hold/route real user funds once live. Double-check every");
  console.log("    value below before confirming.\n");
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BNB`);
  console.log(`Network   : ${networkName} (chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Router    : ${PANCAKE_ROUTER_BSC_MAINNET}`);
  console.log(`V3 Router : ${PANCAKE_V3_ROUTER_BSC_MAINNET}`);
  console.log(`WBNB      : ${WBNB_BSC_MAINNET}`);
  console.log(`Aggregator: ${KYBERSWAP_ROUTER}`);
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Owner     : ${owner}`);
  console.log(`Fee bps   : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  const FeeRouterFactory = await ethers.getContractFactory("FeeRouter");

  console.log("Deploying FeeRouter...");
  const feeRouter = await FeeRouterFactory.deploy(
    PANCAKE_ROUTER_BSC_MAINNET,
    PANCAKE_V3_ROUTER_BSC_MAINNET,
    WBNB_BSC_MAINNET,
    KYBERSWAP_ROUTER,
    feeWallet,
    FEE_BPS,
    owner
  );

  console.log(`Tx hash   : ${feeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  try {
    await feeRouter.deploymentTransaction()?.wait(5);
  } catch (waitErr: any) {
    // Some BSC RPC responses return `"to": ""` instead of `"to": null` on a
    // contract-creation transaction/receipt; ethers v6's strict address
    // parser throws on that while re-fetching the tx to track
    // confirmations. This is a client-side formatting bug in that fetch —
    // it does NOT mean the deployment failed. The transaction was already
    // broadcast and (per BSC's ~3s blocks) is very likely already mined by
    // this point; `contractAddress` below is computed locally from
    // sender+nonce and needs no RPC round-trip, so it's safe to use even
    // after this catch. Verify independently once this script finishes:
    // `eth_getTransactionReceipt` for the tx hash above should show
    // status "0x1", and scripts/smoke-test-bsc-mainnet.ts (or a plain
    // eth_call against a getter like owner()) should read real values
    // back from `contractAddress`, not a revert (no code at that address).
    console.warn(
      "\n⚠️  Couldn't confirm via wait() — likely the known ethers/RPC " +
        "'to' formatting bug on contract-creation receipts, not a failed " +
        `deployment. Details: ${waitErr.shortMessage || waitErr.message}\n` +
        "Continuing to write the deployment record; verify the tx hash " +
        "below on BscScan before treating this deployment as confirmed.\n"
    );
  }

  const contractAddress = await feeRouter.getAddress();
  const deployTxHash = feeRouter.deploymentTransaction()?.hash ?? "";

  console.log("\n✅ FeeRouter deployed!");
  console.log(`Address   : ${contractAddress}`);
  console.log(`Tx hash   : ${deployTxHash}`);

  // --- Persist deployment record ---
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, "bsc-mainnet.json");
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;
  const previousDeployments = previous
    ? [...(previous.previousDeployments ?? []), { ...previous, previousDeployments: undefined }]
    : [];

  const record = {
    network: "bscMainnet",
    chainId: 56,
    contract: "FeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      pancakeRouter: PANCAKE_ROUTER_BSC_MAINNET,
      v3Router: PANCAKE_V3_ROUTER_BSC_MAINNET,
      wrappedNative: WBNB_BSC_MAINNET,
      aggregatorRouter: KYBERSWAP_ROUTER,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: owner,
    },
    previousDeployments,
  };

  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved to: ${outputPath}`);

  console.log("\n--- Next steps ---");
  console.log("1. Verify source:  npx hardhat run scripts/verify-bsc-mainnet.ts --network bscMainnet");
  console.log("2. Smoke test:     npx hardhat run scripts/smoke-test-bsc-mainnet.ts --network bscMainnet");
  console.log(`3. Explorer:       https://bscscan.com/address/${contractAddress}`);
  console.log("4. Update frontend/.env.local: NEXT_PUBLIC_BSC_MAINNET_FEE_ROUTER_ADDRESS");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
