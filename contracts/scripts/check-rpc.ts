/**
 * Phase 0 validation gate script.
 *
 * Pings BSC Testnet + Ethereum Sepolia RPC endpoints and reports chain ID,
 * latest block number, and latency. Does NOT require a private key —
 * this is a read-only connectivity check, safe to run before any real
 * funds or deployer keys exist.
 *
 * Usage:
 *   npm run check:rpc --workspace=contracts
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

interface RpcTarget {
  label: string;
  url: string;
  expectedChainId: number;
}

const TARGETS: RpcTarget[] = [
  {
    label: "BSC Testnet (chapel)",
    url: process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.publicnode.com",
    expectedChainId: 97,
  },
  {
    label: "Ethereum Sepolia",
    url: process.env.SEPOLIA_RPC_URL || "",
    expectedChainId: 11155111,
  },
];

async function checkTarget(target: RpcTarget): Promise<boolean> {
  if (!target.url) {
    console.log(`[SKIP] ${target.label}: no RPC URL set (see .env.example)`);
    return false;
  }

  const provider = new ethers.JsonRpcProvider(target.url);
  const start = Date.now();

  try {
    const [network, blockNumber] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber(),
    ]);
    const latencyMs = Date.now() - start;

    const chainIdOk = Number(network.chainId) === target.expectedChainId;
    const status = chainIdOk ? "OK" : "CHAIN ID MISMATCH";

    console.log(
      `[${status}] ${target.label} -> chainId=${network.chainId} ` +
        `(expected ${target.expectedChainId}), block=${blockNumber}, ${latencyMs}ms`
    );

    return chainIdOk;
  } catch (err) {
    console.log(`[FAIL] ${target.label} -> ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  console.log("=== EVM RPC connectivity check (Phase 0) ===\n");

  const results = await Promise.all(TARGETS.map(checkTarget));
  const anyFailed = results.some((ok, i) => !ok && !!TARGETS[i].url);

  console.log("");
  if (anyFailed) {
    console.log("One or more configured RPCs failed. See logs above.");
    process.exitCode = 1;
  } else {
    console.log("All configured RPCs reachable.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
