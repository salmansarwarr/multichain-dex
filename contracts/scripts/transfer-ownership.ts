/**
 * transfer-ownership.ts
 *
 * Transfers on-chain ownership (Ownable) of an already-deployed FeeRouter /
 * EthFeeRouter to a new address via the owner-only `transferOwnership()`
 * function. This is irreversible from the current signer's side — once run,
 * DEPLOYER_PRIVATE_KEY can no longer call setFeeBps/setFeeWallet/pause/
 * unpause on that contract; only the new owner can.
 *
 * Reads the target contract from deployments/<network>.json and the new
 * owner from NEW_OWNER_ADDRESS in .env.
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY in contracts/.env must be the contract's current
 *     owner (the account that deployed it, unless already transferred)
 *   - deployments/<network>.json exists
 *   - NEW_OWNER_ADDRESS is set to the target owner address
 *
 * Usage:
 *   npx hardhat run scripts/transfer-ownership.ts --network bscTestnet
 *   npx hardhat run scripts/transfer-ownership.ts --network sepolia
 *   npx hardhat run scripts/transfer-ownership.ts --network arbitrumSepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const NETWORK_CONFIG: Record<string, { recordFile: string; contractName: string }> = {
  bscTestnet: { recordFile: "bsc-testnet.json", contractName: "FeeRouter" },
  sepolia: { recordFile: "sepolia.json", contractName: "EthFeeRouter" },
  arbitrumSepolia: { recordFile: "arbitrum-sepolia.json", contractName: "EthFeeRouter" },
};

async function main() {
  const networkName = network.name;
  const cfg = NETWORK_CONFIG[networkName];
  if (!cfg) {
    throw new Error(
      `Unsupported network "${networkName}". Supported: ${Object.keys(NETWORK_CONFIG).join(", ")}`
    );
  }

  const newOwner = process.env.NEW_OWNER_ADDRESS;
  if (!newOwner) {
    throw new Error("NEW_OWNER_ADDRESS is not set in .env. Set it to the target owner address.");
  }
  if (!ethers.isAddress(newOwner)) {
    throw new Error(`NEW_OWNER_ADDRESS ("${newOwner}") is not a valid address.`);
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

  console.log(`\n=== transferOwnership — ${networkName} ===`);
  console.log(`Contract       : ${contractAddress}`);
  console.log(`Signer         : ${signer.address}`);
  console.log(`Current owner  : ${currentOwner}`);
  console.log(`New owner      : ${newOwner}`);

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer (${signer.address}) is not the contract owner (${currentOwner}). ` +
        `DEPLOYER_PRIVATE_KEY must correspond to the owner account to call transferOwnership().`
    );
  }

  if (currentOwner.toLowerCase() === newOwner.toLowerCase()) {
    console.log("\n✅ Owner already matches the target address — nothing to do.");
    return;
  }

  const tx = await router.transferOwnership(newOwner);
  console.log(`\nTx submitted: ${tx.hash}`);
  await tx.wait();

  const updatedOwner: string = await router.owner();
  if (updatedOwner.toLowerCase() !== newOwner.toLowerCase()) {
    throw new Error(`Post-tx owner (${updatedOwner}) does not match requested (${newOwner})`);
  }

  record.ownerTransferredAt = new Date().toISOString();
  record.ownerTransferTxHash = tx.hash;
  record.constructorArgs.initialOwner = newOwner;
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));

  console.log(`\n✅ Ownership transferred on-chain and recorded in ${recordPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
