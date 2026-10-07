import { Address } from 'viem';
import { contracts } from './contracts';

/// KyberSwap aggregator: finds routes across every major DEX on the chain
/// (Uniswap V4, PancakeSwap Infinity, Curve, Camelot, ...), which the fixed
/// V2/V3 paths in useEvmQuote can't reach. Swaps execute through the fee
/// router's swapViaAggregatorWithFee, which allowlists this router.
export const KYBERSWAP_ROUTER: Address = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
export const KYBERSWAP_NATIVE: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const KYBERSWAP_API = 'https://aggregator-api.kyberswap.com';
const CLIENT_ID = 'alphaterraswapx';

const CHAIN_SLUG: Record<number, string> = {
  [contracts.bscMainnet.chainId]: 'bsc',
  [contracts.mainnet.chainId]: 'ethereum',
  [contracts.arbitrumOne.chainId]: 'arbitrum',
};

export function getAggregatorChain(chainId: number): string | undefined {
  return CHAIN_SLUG[chainId];
}

/// Opaque route object from KyberSwap's /routes endpoint; passed back
/// unchanged to /route/build.
export type KyberRouteSummary = {
  amountOut: string;
  amountInUsd?: string;
  amountOutUsd?: string;
  routerAddress?: string;
  [key: string]: unknown;
};

export async function fetchKyberRoute(
  chain: string,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  signal?: AbortSignal,
): Promise<KyberRouteSummary | null> {
  const url = `${KYBERSWAP_API}/${chain}/api/v1/routes?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}`;
  const res = await fetch(url, { headers: { 'x-client-id': CLIENT_ID }, signal });
  if (!res.ok) return null;
  const body = await res.json();
  if (body?.code !== 0 || !body.data?.routeSummary) return null;
  if ((body.data.routerAddress as string)?.toLowerCase() !== KYBERSWAP_ROUTER.toLowerCase()) return null;
  return body.data.routeSummary as KyberRouteSummary;
}

/// Builds calldata for `routeSummary` with the fee router as both sender and
/// recipient (it holds the post-fee input, then forwards the output itself).
export async function buildKyberSwap(
  chain: string,
  routeSummary: KyberRouteSummary,
  feeRouter: Address,
  slippageBps: number,
): Promise<{ data: `0x${string}`; router: Address; amountOut: bigint }> {
  const res = await fetch(`${KYBERSWAP_API}/${chain}/api/v1/route/build`, {
    method: 'POST',
    headers: { 'x-client-id': CLIENT_ID, 'content-type': 'application/json' },
    body: JSON.stringify({ routeSummary, sender: feeRouter, recipient: feeRouter, slippageTolerance: slippageBps }),
  });
  const body = await res.json();
  if (body?.code !== 0 || !body.data?.data) throw new Error(body?.message || 'Aggregator route expired — please retry');
  if ((body.data.routerAddress as string).toLowerCase() !== KYBERSWAP_ROUTER.toLowerCase()) {
    throw new Error('Unexpected aggregator router');
  }
  return { data: body.data.data, router: KYBERSWAP_ROUTER, amountOut: BigInt(body.data.amountOut) };
}
