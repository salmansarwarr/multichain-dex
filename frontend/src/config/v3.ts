/// PancakeSwap V3's QuoterV2, on BSC mainnet — read-only, unrelated to
/// FeeRouter's own address. Cross-checked against the verified ABI served
/// by Sourcify for chain 56 at this address (2026-09-29), not assumed from
/// a search result alone.
export const PANCAKE_V3_QUOTER_BSC_MAINNET = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';

/// PancakeSwap V3's four standard fee tiers, in hundredths of a basis
/// point (500 = 0.05%, 10000 = 1%). A token's real pool can sit at any one
/// of these — useEvmQuote tries all four and keeps whichever responds
/// with the best output, the same "try every candidate, keep the best"
/// approach already used for V2's direct-vs-intermediate route-shopping.
export const PANCAKE_V3_FEE_TIERS = [100, 500, 2500, 10000] as const;
