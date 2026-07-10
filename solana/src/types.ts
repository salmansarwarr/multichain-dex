/**
 * Types for Jupiter's current Swap API ("Metis"), as of the Phase 3 build
 * date. Jupiter deprecated the old `quote-api.jup.ag/v6` endpoint on
 * 1 Oct 2025 — these types match the CURRENT `api.jup.ag/swap/v1/*`
 * endpoints, not the old v6 shape you'll find in a lot of older
 * tutorials/blog posts still floating around.
 *
 * Reference: https://dev.jup.ag/docs/swap/get-quote
 *            https://dev.jup.ag/docs/swap/add-fees-to-swap
 */

export type SwapMode = "ExactIn" | "ExactOut";

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  /** Raw amount in the input token's smallest unit (respect decimals). */
  amount: string | number | bigint;
  slippageBps?: number;
  swapMode?: SwapMode;
  /**
   * Basis points fee to charge the user, e.g. 15 = 0.15%. If set, the
   * `/swap` request MUST also include a `feeAccount` (see JupiterSwapParams).
   */
  platformFeeBps?: number;
  restrictIntermediateTokens?: boolean;
  onlyDirectRoutes?: boolean;
  maxAccounts?: number;
}

export interface JupiterRouteSwapInfo {
  ammKey: string;
  label?: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface JupiterRoutePlanStep {
  swapInfo: JupiterRouteSwapInfo;
  percent: number;
}

export interface JupiterPlatformFee {
  amount: string;
  feeBps: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: SwapMode;
  slippageBps: number;
  priceImpactPct: string;
  platformFee: JupiterPlatformFee | null;
  routePlan: JupiterRoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapParams {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  /**
   * Token account that receives the platform fee. REQUIRED if
   * `platformFeeBps` was set on the /quote request. Its mint must be the
   * OUTPUT mint for ExactIn swaps (our case) or the INPUT mint for
   * ExactOut swaps — see docs/testing-phase3.md.
   */
  feeAccount?: string;
  dynamicComputeUnitLimit?: boolean;
  dynamicSlippage?: boolean;
  prioritizationFeeLamports?:
    | number
    | {
        priorityLevelWithMaxLamports: {
          maxLamports: number;
          priorityLevel: "medium" | "high" | "veryHigh";
        };
      };
}

export interface JupiterSwapResponse {
  /** Base64-encoded serialized VersionedTransaction, ready to deserialize + sign. */
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

/**
 * Jupiter's error responses are plain JSON bodies (not always a clean
 * HTTP status alone tells the story), typically shaped like
 * `{ "error": "...", "errorCode": "..." }`. This type documents the shape
 * our error handling expects — see JupiterApiError in jupiterService.ts
 * for how we turn this into a typed, catchable error rather than a raw
 * fetch/parse crash.
 */
export interface JupiterErrorBody {
  error?: string;
  errorCode?: string;
  message?: string;
}