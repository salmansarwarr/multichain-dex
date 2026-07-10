/**
 * verify-sepolia.ts
 *
 * Submits EthFeeRouter source code to Etherscan Sepolia for verification.
 * Reads the deployed address and constructor args from deployments/sepolia.json
 * (written by deploy-sepolia.ts).
 *
 * Prerequisites:
 *   - ETHERSCAN_API_KEY set in contracts/.env
 *   - deployments/sepolia.json exists (run deploy-sepolia.ts first)
 *
 * Usage:
 *   npx hardhat run scripts/verify-sepolia.ts --network sepolia
 *
 * Note: Etherscan can take 30–90 seconds to index a new contract. If you get
 * a "contract not found" error immediately after deployment, wait a minute
 * and re-run this script.
 */

import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const recordPath = path.join(__dirname, "../deployments/sepolia.json");

  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `Deployment record not found at ${recordPath}.\n` +
        `Run deploy-sepolia.ts first: npx hardhat run scripts/deploy-sepolia.ts --network sepolia`
    );
  }

  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const { address, constructorArgs } = record;

  console.log("\n=== EthFeeRouter — Etherscan Sepolia Verification ===");
  console.log(`Contract : ${address}`);
  console.log(`Explorer : https://sepolia.etherscan.io/address/${address}`);
  console.log("");
  console.log("Constructor args:");
  console.log(JSON.stringify(constructorArgs, null, 2));
  console.log("");
  console.log("Submitting verification request...");

  await run("verify:verify", {
    address,
    constructorArguments: [
      constructorArgs.uniswapRouter,
      constructorArgs.feeWallet,
      constructorArgs.feeBps,
      constructorArgs.initialOwner,
    ],
    contract: "contracts/EthFeeRouter.sol:EthFeeRouter",
  });

  console.log("\n✅ Verification submitted!");
  console.log(`Check: https://sepolia.etherscan.io/address/${address}#code`);
}

main().catch((err) => {
  // "Already Verified" is not a fatal error — surface it as a warning.
  if (err.message?.includes("Already Verified")) {
    console.warn("\n⚠️  Contract is already verified on Etherscan Sepolia — no action needed.");
  } else {
    console.error(err);
    process.exitCode = 1;
  }
});
