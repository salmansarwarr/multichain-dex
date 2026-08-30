import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { Address } from 'viem';
import { V2RouterABI } from '../abis/V2Router';
import { V2FactoryABI, V2PairABI } from '../abis/V2FactoryPair';
import { FeeRouterABI } from '../abis/FeeRouter';
import { EthFeeRouterABI } from '../abis/EthFeeRouter';
import { NATIVE_TOKEN_ADDRESS } from '../data/tokens';
import { getFeeRouterAddress, contracts } from '../config/contracts';
import { withRpcRetry } from './rpcRetry';

// Quote reads are single quick calls, not a chunked scan, so a couple of
// retries is enough to absorb a transient CU/s throttle without piling on.
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;

export function useEvmQuote(
  chainId: number | undefined,
  tokenIn: string | undefined,
  tokenOut: string | undefined,
  amountIn: bigint | undefined,
  // A known-liquid stable token (e.g. BSC mainnet USDT) to also try routing
  // through as a 2-hop intermediate, alongside the direct path. Some tokens
  // (USDe, WLFI, MemeCore on BSC mainnet) have a nearly-empty direct WBNB
  // pool but real liquidity against this stable, so this candidate path
  // often quotes a far better rate than the direct one.
  intermediateToken: string | undefined
) {
  const [quote, setQuote] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The path (2 or 3 addresses) that produced `quote` — whichever of the
  // direct/intermediate candidates gave the higher output. The caller
  // should execute the swap against this exact path, not recompute one.
  const [path, setPath] = useState<Address[] | null>(null);
  // Basis points of value lost to price impact vs. the pool's current spot
  // price, computed straight from on-chain reserves — not the token's
  // broader "market" price. A thin direct WBNB/token pool (or WETH on
  // ETH/Arbitrum) can quote successfully while still giving a terrible
  // effective rate; this catches that case even when getAmountsOut doesn't
  // revert. null while unknown/not applicable (e.g. quote failed).
  const [priceImpactBps, setPriceImpactBps] = useState<number | null>(null);
  const publicClient = usePublicClient({ chainId });

  useEffect(() => {
    let active = true;

    async function fetchQuote() {
      if (!chainId || !tokenIn || !tokenOut || !amountIn || amountIn === 0n || !publicClient) {
        setQuote(null);
        setLoading(false);
        setError(null);
        setPriceImpactBps(null);
        setPath(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const feeRouterAddress = getFeeRouterAddress(chainId);
        if (!feeRouterAddress) throw new Error("Unsupported chain");

        let routerAddress: Address;
        let wethAddress: Address;

        // BSC's FeeRouter and the Ethereum/Arbitrum EthFeeRouter have
        // different ABIs (pancakeRouter() vs uniswapRouter()) — branch on
        // the chain family, not a single hardcoded chain, same as useSwap.ts.
        const isBscFamily =
          chainId === contracts.bscTestnet.chainId || chainId === contracts.bscMainnet.chainId;

        if (chainId === contracts.bscTestnet.chainId) {
          // PancakeSwap router is hardcoded in FeeRouter, but we know it for testnet
          routerAddress = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1';
          wethAddress = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd'; // WBNB
        } else if (isBscFamily) {
          // BSC mainnet FeeRouter exposes pancakeRouter(), not uniswapRouter()
          routerAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: feeRouterAddress,
              abi: FeeRouterABI,
              functionName: 'pancakeRouter',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
          wethAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: routerAddress,
              abi: V2RouterABI,
              functionName: 'WETH',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
        } else {
          // Sepolia/Ethereum Mainnet/Arbitrum EthFeeRouter exposes uniswapRouter()
          routerAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: feeRouterAddress,
              abi: EthFeeRouterABI,
              functionName: 'uniswapRouter',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
          wethAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: routerAddress,
              abi: V2RouterABI,
              functionName: 'WETH',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
        }

        const directPath = [
          tokenIn === NATIVE_TOKEN_ADDRESS ? wethAddress : tokenIn as Address,
          tokenOut === NATIVE_TOKEN_ADDRESS ? wethAddress : tokenOut as Address
        ];

        if (directPath[0].toLowerCase() === directPath[1].toLowerCase()) {
          setQuote(null);
          setLoading(false);
          setError("Cannot swap identical tokens");
          return;
        }

        // Deduct 0.15% fee
        const fee = (amountIn * 15n) / 10000n;
        const amountInAfterFee = amountIn - fee;

        if (amountInAfterFee <= 0n) {
          throw new Error("Amount too small after fee");
        }

        // Route-shop between the direct path and a 2-hop path through a
        // known-liquid stable (when one is given and isn't already an
        // endpoint) — some tokens have a nearly-empty direct WBNB/WETH pool
        // but real liquidity against the stable, so this can quote a far
        // better rate. Each candidate is allowed to revert (e.g.
        // INSUFFICIENT_LIQUIDITY) independently; whichever succeeding
        // candidate yields the higher final output wins.
        const candidatePaths: Address[][] = [directPath];
        if (
          intermediateToken &&
          intermediateToken.toLowerCase() !== directPath[0].toLowerCase() &&
          intermediateToken.toLowerCase() !== directPath[1].toLowerCase()
        ) {
          candidatePaths.push([directPath[0], intermediateToken as Address, directPath[1]]);
        }

        const attempts = await Promise.all(
          candidatePaths.map(async (candidatePath) => {
            try {
              const amountsOut = await withRpcRetry(
                () => publicClient.readContract({
                  address: routerAddress,
                  abi: V2RouterABI,
                  functionName: 'getAmountsOut',
                  args: [amountInAfterFee, candidatePath],
                }),
                MAX_RETRIES,
                BASE_DELAY_MS,
              ) as bigint[];
              return { path: candidatePath, out: amountsOut[amountsOut.length - 1], err: null as unknown };
            } catch (err) {
              return { path: candidatePath, out: null as bigint | null, err };
            }
          })
        );

        const successes = attempts.filter(
          (a): a is { path: Address[]; out: bigint; err: null } => a.out !== null
        );

        if (successes.length === 0) {
          throw attempts[0].err ?? new Error("No route found for this pair");
        }

        const best = successes.reduce((a, b) => (b.out > a.out ? b : a));
        const actualOut = best.out;
        const path = best.path;

        if (active) {
          setQuote(actualOut);
          setPath(path);
        }

        // Price impact vs. the winning path's current spot price — a real
        // trade on real pools, but those pools can be nearly empty even
        // when they have *some* liquidity (a few dollars, not a bug — just
        // too thin for this trade size). Walk every hop of the winning
        // path, compounding a no-slippage reference amount hop by hop, so a
        // 2-hop route through an intermediate is judged the same way as a
        // direct one. Compute best-effort; never let a failure here block
        // the quote itself.
        try {
          const factoryAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: routerAddress,
              abi: V2RouterABI,
              functionName: 'factory',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;

          let idealAmount = amountInAfterFee;
          let impactKnown = true;

          for (let i = 0; i < path.length - 1 && impactKnown; i++) {
            const hopIn = path[i];
            const hopOut = path[i + 1];

            const pairAddress = await withRpcRetry(
              () => publicClient.readContract({
                address: factoryAddress,
                abi: V2FactoryABI,
                functionName: 'getPair',
                args: [hopIn, hopOut],
              }),
              MAX_RETRIES,
              BASE_DELAY_MS,
            ) as Address;

            if (pairAddress === '0x0000000000000000000000000000000000000000') {
              impactKnown = false;
              break;
            }

            const [reserves, token0] = await Promise.all([
              withRpcRetry(
                () => publicClient.readContract({ address: pairAddress, abi: V2PairABI, functionName: 'getReserves' }),
                MAX_RETRIES,
                BASE_DELAY_MS,
              ) as Promise<readonly [bigint, bigint, number]>,
              withRpcRetry(
                () => publicClient.readContract({ address: pairAddress, abi: V2PairABI, functionName: 'token0' }),
                MAX_RETRIES,
                BASE_DELAY_MS,
              ) as Promise<Address>,
            ]);

            const [reserve0, reserve1] = reserves;
            const hopInIsToken0 = token0.toLowerCase() === hopIn.toLowerCase();
            const reserveIn = hopInIsToken0 ? reserve0 : reserve1;
            const reserveOut = hopInIsToken0 ? reserve1 : reserve0;

            if (reserveIn <= 0n || reserveOut <= 0n) {
              impactKnown = false;
              break;
            }

            // No-slippage reference price from reserves *before* this
            // trade, compounded across hops so both sides are on equal
            // footing with the real (slippage-affected) quote.
            idealAmount = (idealAmount * reserveOut) / reserveIn;
          }

          if (impactKnown && idealAmount > 0n && active) {
            const impact = idealAmount > actualOut
              ? Number(((idealAmount - actualOut) * 10000n) / idealAmount)
              : 0;
            setPriceImpactBps(impact);
          } else if (active) {
            setPriceImpactBps(null);
          }
        } catch {
          // Best-effort only — an RPC hiccup here shouldn't hide a
          // perfectly good quote.
          if (active) setPriceImpactBps(null);
        }
      } catch (err: any) {
        if (active) {
          console.error("Quote error:", err);
          setError(err.message || "Failed to fetch quote");
          setQuote(null);
          setPath(null);
          setPriceImpactBps(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(fetchQuote, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [chainId, tokenIn, tokenOut, amountIn, intermediateToken, publicClient]);

  return { quote, loading, error, priceImpactBps, path };
}
