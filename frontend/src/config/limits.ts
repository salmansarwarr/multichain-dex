/// Per-transaction min/max swap amount guardrails, keyed by the "you pay"
/// token's symbol. Frontend-only validation (client request, item 7) — not
/// enforced on-chain, so a user calling the contract directly can bypass
/// this. True enforcement would mean adding the check inside
/// FeeRouter.sol/EthFeeRouter.sol itself, which was explicitly deferred.
///
/// Values are in the token's own display units (not raw/wei).
export const TOKEN_SWAP_LIMITS: Record<string, { min: number; max: number }> = {
  BNB: { min: 0.0005, max: 10 },
  tBNB: { min: 0.0005, max: 10 },
  WBNB: { min: 0.0005, max: 10 },
  ETH: { min: 0.0005, max: 5 },
  WETH: { min: 0.0005, max: 5 },
  BUSD: { min: 1, max: 20_000 },
  UNI: { min: 1, max: 5_000 },
  USDC: { min: 1, max: 20_000 },
  Alfat: { min: 100, max: 5_000_000 },
};

// Applied when a token (e.g. one added via paste-address search) has no
// specific entry above — deliberately generous since we don't know the
// token's typical value.
export const DEFAULT_SWAP_LIMITS = { min: 0, max: Number.MAX_SAFE_INTEGER };

export function getSwapLimits(symbol: string | undefined) {
  if (!symbol) return DEFAULT_SWAP_LIMITS;
  return TOKEN_SWAP_LIMITS[symbol] ?? DEFAULT_SWAP_LIMITS;
}
