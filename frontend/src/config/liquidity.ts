import { contracts } from './contracts';

/// Minimum acceptable reserve of the wrapped-native token (WBNB/WETH) on
/// either side of a pool hop, below which useEvmQuote treats the pool as
/// having no real price discovery and blocks the swap outright — separate
/// from, and in addition to, the per-trade price-impact check.
///
/// Why a separate check: price impact alone isn't enough. It's computed
/// relative to THIS trade's size against the pool's reserves, so a small
/// enough trade against an almost-empty (or badly/thinly seeded) pool can
/// come back with a low impact percentage even though the pool has too
/// little real capital behind it for its price ratio to mean anything.
/// Seen live on BSC mainnet (client report, 2026-09-28): WLFI, DEXE, PENGU
/// and PENDLE all had direct WBNB pools holding well under 0.0004 WBNB
/// (under ~$1 total) — real PancakeSwap V2 pools, not a routing bug, just
/// dead markets with no meaningful price to quote.
///
/// Values are a rough floor, not a precise one — enough to catch pools
/// that are unambiguously dead. Marginal-but-real pools (e.g. observed
/// ~$85-100 pools that are thin but not empty) are left to the per-trade
/// price-impact check, which judges them relative to what's actually being
/// swapped rather than an arbitrary line.
///
/// Mainnet-only. Testnet pools are dev-seeded with small amounts on
/// purpose, so applying this there would block legitimate test swaps.
export const MIN_NATIVE_RESERVE_WEI: Record<number, bigint> = {
  [contracts.bscMainnet.chainId]: 10n ** 16n, // 0.01 WBNB (~$7-8 at time of writing)
  [contracts.mainnet.chainId]: 5n * 10n ** 15n, // 0.005 WETH (~$15-20 at time of writing)
  [contracts.arbitrumOne.chainId]: 5n * 10n ** 15n, // 0.005 WETH, same rationale as mainnet
};

export function getMinNativeReserveWei(chainId: number | undefined): bigint | null {
  if (!chainId) return null;
  return MIN_NATIVE_RESERVE_WEI[chainId] ?? null;
}
