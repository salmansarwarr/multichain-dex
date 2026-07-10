import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { Address } from 'viem';
import { V2RouterABI } from '../abis/V2Router';
import { EthFeeRouterABI } from '../abis/EthFeeRouter';
import { NATIVE_TOKEN_ADDRESS } from '../data/tokens';
import { getFeeRouterAddress, contracts } from '../config/contracts';

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

        if (chainId === contracts.bscTestnet.chainId) {
          // PancakeSwap router is hardcoded in FeeRouter, but we know it for testnet
          routerAddress = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1';
          wethAddress = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd'; // WBNB
        } else {
          // Sepolia EthFeeRouter exposes uniswapRouter()
          routerAddress = await publicClient.readContract({
            address: feeRouterAddress,
            abi: EthFeeRouterABI,
            functionName: 'uniswapRouter',
          }) as Address;
          wethAddress = await publicClient.readContract({
            address: routerAddress,
            abi: V2RouterABI,
            functionName: 'WETH',
          }) as Address;
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

        const amountsOut = await publicClient.readContract({
          address: routerAddress,
          abi: V2RouterABI,
          functionName: 'getAmountsOut',
          args: [amountInAfterFee, path],
        }) as bigint[];

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
