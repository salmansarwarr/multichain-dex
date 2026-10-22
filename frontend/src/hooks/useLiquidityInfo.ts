import { useEffect, useState } from 'react';
import { Address, formatUnits, parseUnits } from 'viem';
import { Token, NATIVE_TOKEN_ADDRESS } from '@/data/tokens';
import { contracts } from '@/config/contracts';
import { fetchKyberRoute, getAggregatorChain, KYBERSWAP_NATIVE } from '@/config/aggregator';

export type LiquidityInfo = {
  /// Liquidity of the less-liquid token of the pair, in pools against the
  /// chain's major tokens (native, stablecoins). Null when both are majors.
  pool: { symbol: string; usd: number; tokenAmount: number } | null;
  /// Market rate (tokenOut per tokenIn) from CoinGecko's USD prices, or
  /// GeckoTerminal's when CoinGecko has none. Swaps are compared against it.
  market: { rate: number } | null;
  /// Largest tokenIn amount whose quote stays within DEPTH_TARGET of the
  /// market rate, and the tokenOut it buys. maxIn is 0 when even a tiny
  /// swap is further than that from the market (spotDeviation says how far).
  depth: { maxIn: number; maxOut: number; aboveRange: boolean; spotDeviation: number } | null;
};

/// A swap is flagged when it receives more than this below the market rate.
export const MAX_IMPACT = 0.01;
// The suggested amount aims a little lower, so entering it clears the flag
// even after rounding and small market moves.
const DEPTH_TARGET = 0.009;
// KyberSwap allows ~30 requests per 10s per user, shared with the quotes:
// this check uses 1 + 4 + REFINE_STEPS of them per pair, starts after
// START_DELAY_MS so the quote goes first, and is skipped for pairs of major
// tokens (deep liquidity; also the default pair on every page load).
const PROBE_USD = [50, 250, 1_000, 5_000];
const START_DELAY_MS = 1_500;
const REFINE_STEPS = 2;
const REF_USD = 2;
const TTL_MS = 120_000;
// A lookup that came back incomplete (usually an API rate limit) is retried
// once after a pause, and cached only briefly so it is tried again soon.
const RETRY_DELAY_MS = 4_000;
const FAILED_TTL_MS = 20_000;

const GT_NETWORK: Record<number, string> = {
  [contracts.bscMainnet.chainId]: 'bsc',
  [contracts.mainnet.chainId]: 'eth',
  [contracts.arbitrumOne.chainId]: 'arbitrum',
};
const WRAPPED_NATIVE: Record<number, string> = {
  [contracts.bscMainnet.chainId]: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
  [contracts.mainnet.chainId]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  [contracts.arbitrumOne.chainId]: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
};
const CG_PLATFORM: Record<number, string> = {
  [contracts.bscMainnet.chainId]: 'binance-smart-chain',
  [contracts.mainnet.chainId]: 'ethereum',
  [contracts.arbitrumOne.chainId]: 'arbitrum-one',
};
const CG_NATIVE_ID: Record<number, string> = {
  [contracts.bscMainnet.chainId]: 'binancecoin',
  [contracts.mainnet.chainId]: 'ethereum',
  [contracts.arbitrumOne.chainId]: 'ethereum',
};
const MAJOR_SYMBOLS = new Set(['BNB', 'WBNB', 'ETH', 'WETH', 'USDT', 'USDC', 'USDC.e', 'BUSD', 'DAI']);

const cache = new Map<string, { at: number; ttl: number; value: LiquidityInfo }>();

function isMajor(t: Token) {
  return t.address === NATIVE_TOKEN_ADDRESS || MAJOR_SYMBOLS.has(t.symbol);
}

function toUnits(amount: number, decimals: number): bigint {
  if (!(amount > 0)) return 0n;
  return parseUnits(amount.toFixed(Math.min(decimals, 18)), decimals);
}

async function poolLiquidity(chainId: number, focus: Token, tokens: Token[], signal: AbortSignal) {
  const net = GT_NETWORK[chainId];
  const listed = new Set(tokens.map((t) => t.address.toLowerCase()));
  listed.add(WRAPPED_NATIVE[chainId]);
  listed.add('0x0000000000000000000000000000000000000000'); // native ETH/BNB in Uniswap V4 / Infinity pools
  const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${focus.address.toLowerCase()}/pools`, { signal });
  if (!res.ok) return null;
  const { data } = await res.json();
  const me = focus.address.toLowerCase();
  const pools: { reserve: number; price: number; volume: number }[] = [];
  for (const p of data ?? []) {
    const base = String(p.relationships?.base_token?.data?.id ?? '').split('_').pop()!.toLowerCase();
    const quote = String(p.relationships?.quote_token?.data?.id ?? '').split('_').pop()!.toLowerCase();
    const other = base === me ? quote : quote === me ? base : null;
    // Only pools against tokens in our list (e.g. MNT/USDe, T/WETH): junk
    // pairs often carry self-reported reserves worth nothing.
    if (!other || !listed.has(other)) continue;
    pools.push({
      reserve: Number(p.attributes?.reserve_in_usd ?? 0),
      price: Number(base === me ? p.attributes?.base_token_price_usd : p.attributes?.quote_token_price_usd),
      volume: Number(p.attributes?.volume_usd?.h24 ?? 0),
    });
  }
  if (!pools.length) return null;
  // Reference price from the most-traded pool; drop pools priced far from
  // it (stale or lopsided positions report reserves that can't be bought).
  const ref = pools.reduce((a, b) => (b.volume > a.volume || (b.volume === a.volume && b.reserve > a.reserve) ? b : a));
  const price = ref.price;
  const usd = pools.filter((p) => Math.abs(p.price / price - 1) <= 0.1).reduce((sum, p) => sum + p.reserve, 0);
  if (!usd || !(price > 0)) return null;
  // Roughly half of a pool's value is the token itself.
  return { symbol: focus.symbol, usd, tokenAmount: usd / 2 / price };
}

const priceCache = new Map<string, { at: number; price: number }>();

async function coingeckoPrice(chainId: number, addr: string, id: string | null, signal: AbortSignal): Promise<number> {
  const url = id
    ? `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    : `https://api.coingecko.com/api/v3/simple/token_price/${CG_PLATFORM[chainId]}?contract_addresses=${addr}&vs_currencies=usd`;
  const res = await fetch(url, { signal });
  if (!res.ok) return 0;
  const body = await res.json();
  return Number((id ? body?.[id]?.usd : body?.[addr]?.usd) ?? 0);
}

async function geckoterminalPrice(chainId: number, addr: string, signal: AbortSignal): Promise<number> {
  const res = await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/${GT_NETWORK[chainId]}/token_price/${addr}`, { signal });
  if (!res.ok) return 0;
  const body = await res.json();
  return Number(body?.data?.attributes?.token_prices?.[addr] ?? 0);
}

/// Market USD price: CoinGecko (aggregated across exchanges), falling back
/// to GeckoTerminal (DEX pools) for tokens CoinGecko doesn't list or when
/// its free API is rate-limiting this browser.
async function usdPrice(chainId: number, token: Token, signal: AbortSignal): Promise<number> {
  const native = token.address === NATIVE_TOKEN_ADDRESS || token.address.toLowerCase() === WRAPPED_NATIVE[chainId];
  const addr = native ? WRAPPED_NATIVE[chainId] : token.address.toLowerCase();
  const id = native ? CG_NATIVE_ID[chainId] : token.coingeckoId ?? null;
  const key = `${chainId}:${addr}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.price;
  let price = await coingeckoPrice(chainId, addr, id, signal).catch(() => 0);
  if (!(price > 0)) price = await geckoterminalPrice(chainId, addr, signal).catch(() => 0);
  if (price > 0) priceCache.set(key, { at: Date.now(), price });
  return price;
}

async function depth(chain: string, tokenIn: Token, tokenOut: Token, priceUsd: number, marketRate: number, signal: AbortSignal) {
  const kIn = (tokenIn.address === NATIVE_TOKEN_ADDRESS ? KYBERSWAP_NATIVE : tokenIn.address) as Address;
  const kOut = (tokenOut.address === NATIVE_TOKEN_ADDRESS ? KYBERSWAP_NATIVE : tokenOut.address) as Address;
  const quote = async (amt: number) => {
    const units = toUnits(amt, tokenIn.decimals);
    if (units === 0n) return null;
    const r = await fetchKyberRoute(chain, kIn, kOut, units, signal).catch(() => null);
    return r ? { inAmt: Number(formatUnits(units, tokenIn.decimals)), out: Number(formatUnits(BigInt(r.amountOut), tokenOut.decimals)) } : null;
  };

  const results = await Promise.all([REF_USD, ...PROBE_USD].map((usd) => quote(usd / priceUsd)));
  const ref = results[0];
  if (!ref || !(ref.out > 0)) return null;
  // Deviation is measured against the market rate, or without one, the
  // spot rate of a tiny trade.
  const refRate = marketRate > 0 ? marketRate : ref.out / ref.inAmt;
  const impactOf = (q: { inAmt: number; out: number }) => ({ amt: q.inAmt, impact: 1 - q.out / q.inAmt / refRate });
  const spot = impactOf(ref);
  if (spot.impact > DEPTH_TARGET) return { maxIn: 0, maxOut: 0, aboveRange: false, spotDeviation: spot.impact };

  const points = results.slice(1).filter((q): q is { inAmt: number; out: number } => q !== null).map(impactOf);
  if (!points.length) return null;

  const firstOver = points.findIndex((p) => p.impact > DEPTH_TARGET);
  if (firstOver === -1) {
    const top = points[points.length - 1].amt;
    return { maxIn: top, maxOut: top * refRate * (1 - DEPTH_TARGET), aboveRange: true, spotDeviation: spot.impact };
  }

  // Narrow the bracket around the target crossing, then interpolate
  // linearly inside it (impact is close to linear in size over a narrow range).
  let lo = firstOver === 0 ? spot : points[firstOver - 1];
  let hi = points[firstOver];
  for (let i = 0; i < REFINE_STEPS; i++) {
    const q = await quote(Math.sqrt(lo.amt * hi.amt));
    if (!q) break;
    const mid = impactOf(q);
    if (mid.impact > DEPTH_TARGET) hi = mid; else lo = mid;
  }
  const f = Math.min(1, Math.max(0, (DEPTH_TARGET - lo.impact) / (hi.impact - lo.impact || 1)));
  const maxIn = lo.amt + f * (hi.amt - lo.amt);
  return { maxIn, maxOut: maxIn * refRate * (1 - DEPTH_TARGET), aboveRange: false, spotDeviation: spot.impact };
}

/// Pool liquidity and depth (amount tradeable under 1% price impact) for a
/// token pair. Fetched once per pair, not per keystroke, and cached.
export function useLiquidityInfo(chainId: number, tokenIn: Token | null, tokenOut: Token | null, tokens: Token[]) {
  const chain = getAggregatorChain(chainId);
  const key =
    chain && tokenIn && tokenOut && tokenIn.address !== tokenOut.address && !(isMajor(tokenIn) && isMajor(tokenOut))
      ? `${chainId}:${tokenIn.address}:${tokenOut.address}`.toLowerCase()
      : null;
  const [result, setResult] = useState<{ key: string; value: LiquidityInfo } | null>(null);

  useEffect(() => {
    if (!key || !chain || !tokenIn || !tokenOut) return;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return;

    const ctrl = new AbortController();
    const focus = !isMajor(tokenOut) ? tokenOut : !isMajor(tokenIn) ? tokenIn : null;
    const taxed = tokenIn.isFeeOnTransfer || tokenOut.isFeeOnTransfer;
    const marketOf = async (prev?: LiquidityInfo) => {
      if (prev?.market) return { market: prev.market, priceIn: 0 };
      const [priceIn, priceOut] = await Promise.all([usdPrice(chainId, tokenIn, ctrl.signal), usdPrice(chainId, tokenOut, ctrl.signal)]);
      return { market: priceIn > 0 && priceOut > 0 ? { rate: priceIn / priceOut } : null, priceIn };
    };
    const load = async (prev?: LiquidityInfo): Promise<LiquidityInfo> => {
      const [pool, { market, d }] = await Promise.all([
        focus && !prev?.pool ? poolLiquidity(chainId, focus, tokens, ctrl.signal).catch(() => null) : prev?.pool ?? null,
        (async () => {
          const { market, priceIn } = await marketOf(prev).catch(() => ({ market: null, priceIn: 0 }));
          const inPrice = priceIn || (await usdPrice(chainId, tokenIn, ctrl.signal).catch(() => 0));
          const d =
            !taxed && !prev?.depth && inPrice > 0
              ? await depth(chain, tokenIn, tokenOut, inPrice, market?.rate ?? 0, ctrl.signal).catch(() => null)
              : prev?.depth ?? null;
          return { market, d };
        })(),
      ]);
      return { pool, market, depth: d };
    };
    const complete = (v: LiquidityInfo) => (!focus || v.pool !== null) && v.market !== null && (taxed || v.depth !== null);
    (async () => {
      await new Promise((r) => setTimeout(r, START_DELAY_MS));
      if (ctrl.signal.aborted) return;
      let value = await load();
      if (!complete(value) && !ctrl.signal.aborted) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        if (!ctrl.signal.aborted) value = await load(value);
      }
      if (ctrl.signal.aborted) return;
      cache.set(key, { at: Date.now(), ttl: complete(value) ? TTL_MS : FAILED_TTL_MS, value });
      setResult({ key, value });
    })();
    return () => ctrl.abort();
  }, [key, chain, chainId, tokenIn, tokenOut, tokens]);

  if (!key) return { info: null, loading: false };
  // A cached value is shown even if past its TTL; the effect refreshes it.
  const info = result?.key === key ? result.value : cache.get(key)?.value ?? null;
  return { info, loading: info === null };
}
