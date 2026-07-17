/**
 * deploy-bsc-mainnet.ts
 *
 * Deploys FeeRouter to BSC Mainnet (chain ID 56), pointed at the real
 * PancakeSwap Router V2. THIS SPENDS REAL BNB AND HANDLES REAL FUNDS ONCE
 * LIVE — do not run this until:
 *   1. The full test suite passes (`npx hardhat test`), including the
 *      fee-on-transfer cases needed for tax tokens like Alfat.
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
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// PancakeSwap Router V2 on BSC Mainnet — confirmed live on-chain.
const PANCAKE_ROUTER_BSC_MAINNET = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

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
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Owner     : ${owner}`);
  console.log(`Fee bps   : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  const FeeRouterFactory = await ethers.getContractFactory("FeeRouter");

  console.log("Deploying FeeRouter...");
  const feeRouter = await FeeRouterFactory.deploy(
    PANCAKE_ROUTER_BSC_MAINNET,
    feeWallet,
    FEE_BPS,
    owner
  );

  console.log(`Tx hash   : ${feeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  await feeRouter.deploymentTransaction()?.wait(5);

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

  const record = {
    network: "bscMainnet",
    chainId: 56,
    contract: "FeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      pancakeRouter: PANCAKE_ROUTER_BSC_MAINNET,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: owner,
    },
  };

  const outputPath = path.join(deploymentsDir, "bsc-mainnet.json");
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
