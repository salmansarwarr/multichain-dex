import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// --- Env vars (see .env.example) ---
const BSC_TESTNET_RPC_URL =
    process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com";
const BSC_MAINNET_RPC_URL =
    process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const ETH_MAINNET_RPC_URL = process.env.ETH_MAINNET_RPC_URL || "";

// Deployer key is only required when actually deploying/broadcasting.
// Left empty locally so `hardhat compile` and RPC checks never require a real key.
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {
            // Phase 1/2 fork tests will override `forking` per-run via env or a
            // dedicated script; left unset here so default `hardhat test` runs
            // fast without requiring a fork RPC.
        },
        bscTestnet: {
            url: BSC_TESTNET_RPC_URL,
            chainId: 97,
            accounts,
        },
        bscMainnet: {
            url: BSC_MAINNET_RPC_URL,
            chainId: 56,
            accounts,
        },
        sepolia: {
            url: SEPOLIA_RPC_URL,
            chainId: 11155111,
            accounts,
        },
        ethMainnet: {
            url: ETH_MAINNET_RPC_URL,
            chainId: 1,
            accounts,
        },
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },
    gasReporter: {
        // Enable with: REPORT_GAS=true npx hardhat test
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
        outputFile: process.env.CI ? "gas-report.txt" : undefined,
        noColors: !!process.env.CI,
        L1: "binance",
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};

export default config;
