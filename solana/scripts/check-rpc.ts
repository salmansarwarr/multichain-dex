/**
 * Phase 0 validation gate script.
 *
 * Pings the configured Solana devnet RPC and reports the current slot +
 * a version handshake. Read-only, no keypair required.
 *
 * Usage:
 *   npm run check:rpc --workspace=solana
 */
import { Connection, clusterApiUrl } from "@solana/web3.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const url = process.env.SOLANA_DEVNET_RPC_URL || clusterApiUrl("devnet");

  console.log("=== Solana RPC connectivity check (Phase 0) ===\n");
  console.log(`Target: ${url}`);

  const connection = new Connection(url, "confirmed");
  const start = Date.now();

  try {
    const [version, slot] = await Promise.all([
      connection.getVersion(),
      connection.getSlot(),
    ]);
    const latencyMs = Date.now() - start;

    console.log(
      `[OK] solana-core=${version["solana-core"]}, slot=${slot}, ${latencyMs}ms`
    );
  } catch (err) {
    console.log(`[FAIL] ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

main();
