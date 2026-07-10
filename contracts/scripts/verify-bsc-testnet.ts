/**
 * verify-bsc-testnet.ts
 *
 * Submits FeeRouter source code to BscScan Testnet for verification.
 * Reads the deployed address and constructor args from deployments/bsc-testnet.json
 * (written by deploy-bsc-testnet.ts).
 *
 * Prerequisites:
 *   - ETHERSCAN_API_KEY set in contracts/.env
 *   - deployments/bsc-testnet.json exists (run deploy-bsc-testnet.ts first)
 *
 * Usage:
 *   npx hardhat run scripts/verify-bsc-testnet.ts --network bscTestnet
 *
 * Note: BscScan can take 30–90 seconds to index a new contract. If you get
 * a "contract not found" error immediately after deployment, wait a minute
 * and re-run this script.
 */

import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const recordPath = path.join(__dirname, "../deployments/bsc-testnet.json");

    if (!fs.existsSync(recordPath)) {
        throw new Error(
            `Deployment record not found at ${recordPath}.\n` +
                `Run deploy-bsc-testnet.ts first: npx hardhat run scripts/deploy-bsc-testnet.ts --network bscTestnet`,
        );
    }

    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    const { address, constructorArgs } = record;

    console.log("\n=== FeeRouter — BscScan Testnet Verification ===");
    console.log(`Contract : ${address}`);
    console.log(`Explorer : https://testnet.bscscan.com/address/${address}`);
    console.log("");
    console.log("Constructor args:");
    console.log(JSON.stringify(constructorArgs, null, 2));
    console.log("");
    console.log("Submitting verification request...");

    await run("verify:verify", {
        address,
        constructorArguments: [
            constructorArgs.pancakeRouter,
            constructorArgs.feeWallet,
            constructorArgs.feeBps,
            constructorArgs.initialOwner,
        ],
        contract: "contracts/FeeRouter.sol:FeeRouter",
    });

    console.log("\n✅ Verification submitted!");
    console.log(`Check: https://testnet.bscscan.com/address/${address}#code`);
}

main().catch((err) => {
    // "Already Verified" is not a fatal error — surface it as a warning.
    if (err.message?.includes("Already Verified")) {
        console.warn(
            "\n⚠️  Contract is already verified on BscScan Testnet — no action needed.",
        );
    } else {
        console.error(err);
        process.exitCode = 1;
    }
});
