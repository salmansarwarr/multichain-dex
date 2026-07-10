/**
 * Jupiter Swap API ("Metis") integration.
 *
 * IMPORTANT — this replaces the old `quote-api.jup.ag/v6` endpoint used in
 * Phase 0's reachability check. That endpoint was deprecated by Jupiter on
 * 1 Oct 2025. The current endpoints (as of this Phase 3 build) are:
 *
 *   GET  https://api.jup.ag/swap/v1/quote
 *   POST https://api.jup.ag/swap/v1/swap
 *
 * Both now require an `x-api-key` header — get a free key at
 * https://portal.jup.ag (the "Jupiter Developer Platform", dev.jup.ag).
 * Jupiter's own docs recommend `api.jup.ag` with a key over the older
 * free `lite-api.jup.ag` host, which is slated for eventual deprecation
 * (currently paused, no firm date) — see .env.example for both options.
 *
 * Reference: https://dev.jup.ag/docs/swap/get-quote
 *            https://dev.jup.ag/docs/swap/build-swap-transaction
 *            https://dev.jup.ag/docs/swap/add-fees-to-swap
 */
import * as dotenv from "dotenv";
import type {
  JupiterErrorBody,
  JupiterQuoteParams,
  JupiterQuoteResponse,
  JupiterSwapParams,
  JupiterSwapResponse,
} from "./types.js";

dotenv.config();

const DEFAULT_QUOTE_API_URL = "https://api.jup.ag/swap/v1/quote";
const DEFAULT_SWAP_API_URL = "https://api.jup.ag/swap/v1/swap";

/**
 * Typed, catchable error for anything Jupiter's API itself rejects
 * (no route found, invalid mint, rate limited, etc.) — as opposed to a
 * network-level failure. Callers can distinguish "the pair is illiquid /
 * request was invalid" (this error) from "the network is down" (a plain
 * fetch/TypeError) and handle each gracefully instead of crashing.
 */
export class JupiterApiError extends Error {
  readonly status: number;
  readonly body: JupiterErrorBody | undefined;

  constructor(status: number, body: JupiterErrorBody | undefined, fallbackMessage: string) {
    super(body?.error || body?.message || fallbackMessage);
    this.name = "JupiterApiError";
    this.status = status;
    this.body = body;
  }
}

/** Thrown when required config (API key) is missing — fails fast before any network call. */
export class JupiterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JupiterConfigError";
  }
}

function getApiKey(): string {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    throw new JupiterConfigError(
      "JUPITER_API_KEY is not set. Get a free key at https://portal.jup.ag and set it in .env " +
        "(see .env.example) — api.jup.ag now requires a key even on the free tier."
    );
  }
  return apiKey;
}

async function parseErrorBody(response: Response): Promise<JupiterErrorBody | undefined> {
  try {
    return (await response.json()) as JupiterErrorBody;
  } catch {
    return undefined;
  }
}

/**
 * Fetch a swap quote. If `platformFeeBps` is set, the corresponding
 * `feeAccount` MUST be passed to `getSwapTransaction()` later, or
 * Jupiter's `/swap` call will reject the request.
 *
 * Throws `JupiterApiError` (not a crash) for API-level rejections —
 * including the "no route found" case for an illiquid/disconnected pair,
 * which is exactly the Phase 3 gate's "graceful error" requirement.
 */
export async function getQuote(
  params: JupiterQuoteParams,
  quoteApiUrl: string = process.env.JUPITER_QUOTE_API_URL || DEFAULT_QUOTE_API_URL
): Promise<JupiterQuoteResponse> {
  const apiKey = getApiKey();

  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
  });
  if (params.slippageBps !== undefined) query.set("slippageBps", String(params.slippageBps));
  if (params.swapMode !== undefined) query.set("swapMode", params.swapMode);
  if (params.platformFeeBps !== undefined) query.set("platformFeeBps", String(params.platformFeeBps));
  if (params.restrictIntermediateTokens !== undefined) {
    query.set("restrictIntermediateTokens", String(params.restrictIntermediateTokens));
  }
  if (params.onlyDirectRoutes !== undefined) query.set("onlyDirectRoutes", String(params.onlyDirectRoutes));
  if (params.maxAccounts !== undefined) query.set("maxAccounts", String(params.maxAccounts));

  const response = await fetch(`${quoteApiUrl}?${query.toString()}`, {
    headers: { "x-api-key": apiKey },
  });

  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new JupiterApiError(
      response.status,
      body,
      `Jupiter /quote request failed with HTTP ${response.status}`
    );
  }

  return (await response.json()) as JupiterQuoteResponse;
}

/**
 * Build a serialized (base64) swap transaction from a quote. The caller
 * is responsible for deserializing (as a VersionedTransaction), signing,
 * and submitting it — this function does not touch a wallet or RPC
 * connection at all, keeping it easily unit-testable in isolation.
 */
export async function getSwapTransaction(
  params: JupiterSwapParams,
  swapApiUrl: string = process.env.JUPITER_SWAP_API_URL || DEFAULT_SWAP_API_URL
): Promise<JupiterSwapResponse> {
  const apiKey = getApiKey();

  if (params.quoteResponse.platformFee && !params.feeAccount) {
    // Fail fast with a clear message rather than letting Jupiter's API
    // reject it with a less obvious error — this is a config mistake on
    // our side, not something the user did.
    throw new JupiterConfigError(
      "quoteResponse includes a platformFee but no feeAccount was provided. " +
        "If platformFeeBps was set on /quote, feeAccount is required on /swap."
    );
  }

  const response = await fetch(swapApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      feeAccount: params.feeAccount,
      dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
      dynamicSlippage: params.dynamicSlippage ?? true,
      prioritizationFeeLamports: params.prioritizationFeeLamports,
    }),
  });

  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new JupiterApiError(
      response.status,
      body,
      `Jupiter /swap request failed with HTTP ${response.status}`
    );
  }

  return (await response.json()) as JupiterSwapResponse;
}

/**
 * Convenience: expected fee amount off a quote, in the *output* token's
 * smallest unit, for a given platformFeeBps.
 *
 * Note on `outAmount` semantics (confirmed against Jupiter's own OpenAPI
 * spec, not assumed): the quote's top-level `outAmount` already INCLUDES
 * the platform fee cut — it's the routing engine's gross output. The
 * user actually receives `outAmount - platformFee.amount`, while
 * `feeAccount` receives `platformFee.amount`.
 *
 * IMPORTANT — this is an ESTIMATE, not a bit-exact reproduction of
 * Jupiter's internal math. In practice Jupiter applies the platform fee
 * at an earlier stage of route calculation (often per-hop, against an
 * intermediate amount before final slippage/price adjustments), so the
 * real `platformFee.amount` can differ from this naive
 * `outAmount * feeBps / 10000` calculation by a small amount — a few
 * basis points of the fee itself, not of the trade. Use this for
 * sanity-checking the fee is roughly the right *magnitude* (e.g. "is this
 * close to 0.15%, not accidentally 1.5%"), not for asserting exact
 * equality against `platformFee.amount`. See docs/testing-phase3.md.
 */
export function expectedPlatformFeeAmount(outAmount: string | bigint, platformFeeBps: number): bigint {
  const out = typeof outAmount === "bigint" ? outAmount : BigInt(outAmount);
  return (out * BigInt(platformFeeBps)) / 10_000n;
}

/** The amount the user actually nets after the platform fee is carved out of `outAmount`. */
export function expectedUserReceiveAmount(outAmount: string | bigint, platformFeeBps: number): bigint {
  const out = typeof outAmount === "bigint" ? outAmount : BigInt(outAmount);
  return out - expectedPlatformFeeAmount(out, platformFeeBps);
}