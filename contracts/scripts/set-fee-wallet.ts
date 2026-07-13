/**
 * set-fee-wallet.ts
 *
 * Updates the on-chain `feeWallet` of an already-deployed FeeRouter /
 * EthFeeRouter via the owner-only `setFeeWallet()` function — no redeploy
 * needed. Use this when the fee-collection address changes after go-live
 * (e.g. the deployed contract was pointed at a dev/test wallet and needs to
 * be repointed at the real production fee wallet).
 *
 * Reads the target address from deployments/<network>.json and the new fee
 * wallet from the same *_FEE_WALLET_ADDRESS env var the deploy scripts use,
 * so the deployment record and .env stay the single source of truth.
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY in contracts/.env must be the contract's current
 *     owner (the account that deployed it, unless ownership was transferred)
 *   - deployments/<network>.json exists
 *   - The corresponding *_FEE_WALLET_ADDRESS env var is set to the NEW address
 *
 * Usage:
 *   npx hardhat run scripts/set-fee-wallet.ts --network bscTestnet
 *   npx hardhat run scripts/set-fee-wallet.ts --network sepolia
 *   npx hardhat run scripts/set-fee-wallet.ts --network arbitrumSepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const NETWORK_CONFIG: Record<string, { recordFile: string; contractName: string; envVar: string }> = {
  bscTestnet: { recordFile: "bsc-testnet.json", contractName: "FeeRouter", envVar: "BSC_FEE_WALLET_ADDRESS" },
  sepolia: { recordFile: "sepolia.json", contractName: "EthFeeRouter", envVar: "ETH_FEE_WALLET_ADDRESS" },
  arbitrumSepolia: { recordFile: "arbitrum-sepolia.json", contractName: "EthFeeRouter", envVar: "ARB_FEE_WALLET_ADDRESS" },
};

async function main() {
  const networkName = network.name;
  const cfg = NETWORK_CONFIG[networkName];
  if (!cfg) {
    throw new Error(
      `Unsupported network "${networkName}". Supported: ${Object.keys(NETWORK_CONFIG).join(", ")}`
    );
  }

  const newFeeWallet = process.env[cfg.envVar];
  if (!newFeeWallet) {
    throw new Error(`${cfg.envVar} is not set in .env. Set it to the new fee wallet address.`);
  }

  const recordPath = path.join(__dirname, "../deployments", cfg.recordFile);
  if (!fs.existsSync(recordPath)) {
    throw new Error(`Deployment record not found at ${recordPath}. Deploy the contract first.`);
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const contractAddress: string = record.address;

  const [signer] = await ethers.getSigners();
  const router = await ethers.getContractAt(cfg.contractName, contractAddress, signer);

  const currentOwner: string = await router.owner();
  const currentFeeWallet: string = await router.feeWallet();

  console.log(`\n=== setFeeWallet — ${networkName} ===`);
  console.log(`Contract        : ${contractAddress}`);
  console.log(`Signer          : ${signer.address}`);
  console.log(`Contract owner  : ${currentOwner}`);
  console.log(`Current feeWallet: ${currentFeeWallet}`);
  console.log(`New feeWallet    : ${newFeeWallet}`);

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer (${signer.address}) is not the contract owner (${currentOwner}). ` +
        `DEPLOYER_PRIVATE_KEY must correspond to the owner account to call setFeeWallet().`
    );
  }

  if (currentFeeWallet.toLowerCase() === newFeeWallet.toLowerCase()) {
    console.log("\n✅ feeWallet already matches the target address — nothing to do.");
    return;
  }

  const tx = await router.setFeeWallet(newFeeWallet);
  console.log(`\nTx submitted: ${tx.hash}`);
  await tx.wait();

  const updatedFeeWallet: string = await router.feeWallet();
  if (updatedFeeWallet.toLowerCase() !== newFeeWallet.toLowerCase()) {
    throw new Error(`Post-tx feeWallet (${updatedFeeWallet}) does not match requested (${newFeeWallet})`);
  }

  record.constructorArgs.feeWallet = newFeeWallet;
  record.feeWalletUpdatedAt = new Date().toISOString();
  record.feeWalletUpdateTxHash = tx.hash;
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));

  console.log(`\n✅ feeWallet updated on-chain and in ${recordPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
