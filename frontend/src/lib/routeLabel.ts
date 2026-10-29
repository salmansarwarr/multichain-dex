import { Token } from '@/data/tokens';
import type { AggregatorRoute } from '@/hooks/useEvmQuote';

export type RouteLabel = { path: string[]; venues: string[]; splits: number };

const VENUE_NAMES: [RegExp, string][] = [
  [/^pancake-infinity/, 'PancakeSwap Infinity'],
  [/^pancake-v3/, 'PancakeSwap V3'],
  [/^pancake-stable/, 'PancakeSwap Stable'],
  [/^pancake/, 'PancakeSwap V2'],
  [/^uniswap-v4/, 'Uniswap V4'],
  [/^uniswap-?v3/, 'Uniswap V3'],
  [/^uniswap/, 'Uniswap V2'],
  [/^sushiswap/, 'SushiSwap'],
  [/^camelot/, 'Camelot'],
  [/^curve/, 'Curve'],
  [/^balancer/, 'Balancer'],
  [/^fluid/, 'Fluid'],
  [/^maverick/, 'Maverick'],
  [/^ramses/, 'Ramses'],
  [/^traderjoe/, 'Trader Joe'],
  [/^apeswap/, 'ApeSwap'],
  [/^biswap/, 'Biswap'],
  [/^dodo/, 'DODO'],
  [/^(pmm|kyberswap-limit-order|native|flux|metric)/, 'Market makers'],
];

function venueName(slug: string): string {
  slug = slug.split('/').pop() ?? slug; // e.g. "woofi-v3/camelot-v3": the pool's own venue is last
  for (const [re, name] of VENUE_NAMES) if (re.test(slug)) return name;
  return slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Wrapped native tokens aren't in every chain's token list but often sit
// in the middle of a route.
const WRAPPED_NATIVE: Record<string, string> = {
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': 'WBNB',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'WETH',
};

type Hop = { tokenIn?: string; tokenOut?: string; exchange?: string; swapAmount?: string };

/// Human-readable route for the winning quote, e.g.
/// { path: ['BNB', 'USDT', 'APE'], venues: ['PancakeSwap V3'], splits: 1 }.
export function describeRoute(opts: {
  isBsc: boolean;
  tokens: Token[];
  tokenIn: Token;
  tokenOut: Token;
  quoteVersion: 'v2' | 'v3' | 'v3-multihop' | 'aggregator';
  path: string[] | null;
  v3Fee: number | null;
  aggregatorRoute: AggregatorRoute | null;
}): RouteLabel | null {
  const { isBsc, tokens, tokenIn, tokenOut, quoteVersion, path, v3Fee, aggregatorRoute } = opts;
  const symbolOf = (addr: string) =>
    tokens.find((t) => t.address.toLowerCase() === addr.toLowerCase())?.symbol ??
    WRAPPED_NATIVE[addr.toLowerCase()] ??
    `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  const dex = isBsc ? 'PancakeSwap' : 'Uniswap';

  if (quoteVersion === 'aggregator') {
    const splits = (aggregatorRoute?.routeSummary.route as Hop[][] | undefined) ?? [];
    if (!splits.length) return null;
    // Show the hops of the split carrying the most input.
    const main = [...splits].sort((a, b) => Number(BigInt(b[0]?.swapAmount ?? '0') - BigInt(a[0]?.swapAmount ?? '0')))[0];
    const mids = main.slice(0, -1).map((h) => symbolOf(h.tokenOut ?? ''));
    const venues = [...new Set(splits.flat().map((h) => venueName(h.exchange ?? '')))];
    return { path: [tokenIn.symbol, ...mids, tokenOut.symbol], venues, splits: splits.length };
  }

  if (!path || path.length < 2) return null;
  const mids = path.slice(1, -1).map(symbolOf);
  const version = quoteVersion === 'v2' ? 'V2' : 'V3';
  const fee = quoteVersion === 'v3' && v3Fee ? ` (${v3Fee / 10000}% pool)` : '';
  return { path: [tokenIn.symbol, ...mids, tokenOut.symbol], venues: [`${dex} ${version}${fee}`], splits: 1 };
}
