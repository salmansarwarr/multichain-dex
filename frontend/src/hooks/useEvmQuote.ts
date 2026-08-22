import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { Address } from 'viem';
import { V2RouterABI } from '../abis/V2Router';
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
  amountIn: bigint | undefined
) {
  const [quote, setQuote] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicClient = usePublicClient({ chainId });

  useEffect(() => {
    let active = true;

    async function fetchQuote() {
      if (!chainId || !tokenIn || !tokenOut || !amountIn || amountIn === 0n || !publicClient) {
        setQuote(null);
        setLoading(false);
        setError(null);
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

        const path = [
          tokenIn === NATIVE_TOKEN_ADDRESS ? wethAddress : tokenIn as Address,
          tokenOut === NATIVE_TOKEN_ADDRESS ? wethAddress : tokenOut as Address
        ];

        if (path[0].toLowerCase() === path[1].toLowerCase()) {
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

        const amountsOut = await withRpcRetry(
          () => publicClient.readContract({
            address: routerAddress,
            abi: V2RouterABI,
            functionName: 'getAmountsOut',
            args: [amountInAfterFee, path],
          }),
          MAX_RETRIES,
          BASE_DELAY_MS,
        ) as bigint[];

        if (active) {
          setQuote(amountsOut[amountsOut.length - 1]);
        }
      } catch (err: any) {
        if (active) {
          console.error("Quote error:", err);
          setError(err.message || "Failed to fetch quote");
          setQuote(null);
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
  }, [chainId, tokenIn, tokenOut, amountIn, publicClient]);

  return { quote, loading, error };
}
