/**
 * Phase 0 validation gate script — UPDATED in Phase 3.
 *
 * IMPORTANT: this originally targeted `quote-api.jup.ag/v6/quote`, which
 * Jupiter deprecated on 1 Oct 2025 (confirmed via Jupiter DevRel). It now
 * uses the current `api.jup.ag/swap/v1/quote` endpoint via the shared
 * jupiterService module built in Phase 3, and requires a free API key
 * from https://portal.jup.ag (see solana/.env.example) — the old
 * endpoint was key-free, the current one is not.
 *
 * Confirms the Jupiter Swap API is reachable and returns a sane response,
 * using a well-known mainnet pair (SOL -> USDC) as a smoke test. This
 * only tests API reachability — it does NOT execute a swap.
 *
 * Note: Jupiter's quote/swap API only has real liquidity on mainnet, even
 * when your later swap-signing/testing happens on devnet with a test
 * wallet — this script just confirms the API itself responds.
 *
 * Usage:
 *   npm run check:jupiter --workspace=solana
 */
import { getQuote, JupiterApiError, JupiterConfigError } from "../src/jupiterService.js";

// Well-known mainnet mints, used only for the reachability smoke test.
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function main() {
  console.log("=== Jupiter API reachability check (Phase 0/3) ===\n");
  console.log("Target: api.jup.ag/swap/v1/quote (or JUPITER_QUOTE_API_URL override)\n");

  try {
    const quote = await getQuote({
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: 1_000_000, // 0.001 SOL, in lamports
      slippageBps: 50,
    });

    if (quote.outAmount) {
      console.log(`[OK] Quote received. outAmount=${quote.outAmount} (USDC base units)`);
    } else {
      console.log("[WARN] Response OK but missing expected 'outAmount' field.");
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof JupiterConfigError) {
      console.log(`[CONFIG] ${err.message}`);
      process.exitCode = 1;
      return;
    }
    if (err instanceof JupiterApiError) {
      console.log(`[FAIL] Jupiter API rejected the request (HTTP ${err.status}): ${err.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[FAIL] ${(err as Error).message}`);
    console.log(
      "Note: this environment's egress allowlist may not include api.jup.ag — " +
        "run this check from your normal dev machine/CI if it fails only here."
    );
    process.exitCode = 1;
  }
}

main();