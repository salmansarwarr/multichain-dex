import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { Address } from 'viem';
import { FeeRouterABI } from '../abis/FeeRouter';
import { EthFeeRouterABI } from '../abis/EthFeeRouter';
import { contracts, getFeeRouterAddress } from '../config/contracts';
import { NATIVE_TOKEN_ADDRESS } from '../data/tokens';

export type SwapState = 'IDLE' | 'SWAPPING' | 'SUCCESS' | 'ERROR';

export function useSwap() {
  const [state, setState] = useState<SwapState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const publicClient = usePublicClient();

  const { writeContractAsync, data: hash, error: writeError } = useWriteContract();

  const { isLoading: isTxPending, isSuccess, error: txError } = useWaitForTransactionReceipt({
    hash,
  });

  // Sync state with wagmi tx lifecycle
  if (isTxPending && state !== 'SWAPPING') setState('SWAPPING');
  if (isSuccess && state !== 'SUCCESS') setState('SUCCESS');
  if ((writeError || txError) && state !== 'ERROR') {
    setError(writeError?.message || txError?.message || 'Unknown error');
    setState('ERROR');
  }

  const execute = async (
    chainId: number,
    tokenIn: string,
    amountIn: bigint,
    amountOutMin: bigint,
    recipient: Address,
    // The exact path (2+ addresses, WBNB/WETH-substituted for native
    // endpoints) that produced the quote being executed — e.g. from
    // useEvmQuote's `path`. Executing against this exact path (rather than
    // recomputing a direct-only one here) guarantees the trade matches what
    // the user was quoted, including any multi-hop route through a
    // deeper-liquidity intermediate.
    path: Address[],
    feeOnTransfer: boolean = false,
    // Which router version produced this quote (useEvmQuote's
    // `quoteVersion`) — 'v2' by default. useEvmQuote only returns a V3
    // version on BSC mainnet and Ethereum mainnet, and only once the
    // configured fee-router contract reports a non-zero v3Router(). When
    // 'v3', `v3Fee` (useEvmQuote's `v3Fee`) must be the winning pool's fee
    // tier — required by the V3 functions' `fee` param, meaningless for V2.
    quoteVersion: 'v2' | 'v3' | 'v3-multihop' = 'v2',
    v3Fee: number | null = null,
    v3Path: `0x${string}` | null = null
  ) => {
    setState('SWAPPING');
    setError(null);
    try {
      const isNativeIn = tokenIn === NATIVE_TOKEN_ADDRESS;

      const feeRouterAddress = getFeeRouterAddress(chainId);
      if (!feeRouterAddress) throw new Error("Unsupported chain");
      if (!publicClient) throw new Error("Public client not found");

      // BSC's FeeRouter and the Ethereum/Arbitrum EthFeeRouter have
      // different ABIs (pancakeRouter() vs uniswapRouter()) despite sharing
      // the same swap function signatures — branch on the actual chain
      // family, not on a single hardcoded chain, so this works for every
      // BSC-style chain (testnet or mainnet) and every EthFeeRouter-style
      // chain (Sepolia, Arbitrum, or future additions) alike.
      const isBscFamily =
        chainId === contracts.bscTestnet.chainId || chainId === contracts.bscMainnet.chainId;
      const abi = isBscFamily ? FeeRouterABI : EthFeeRouterABI;

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 mins

      // V3 multi-hop execution (BSC and Ethereum mainnet — see
      // useEvmQuote.ts), a 2-hop route
      // through a known-liquid intermediate (e.g. PENGU, which has no
      // meaningful direct WBNB pool on PancakeSwap V3, only a deep one
      // against USDT). `v3Path` already carries tokenIn/tokenOut implicitly
      // — the *V3MultiHopWithFee functions decode them from the path
      // itself on-chain (see FeeRouter.sol) — so only `path[path.length-1]`
      // is needed here, purely to know whether tokenOut is native BNB (this
      // app has no BNB-out V3 wiring yet, same gap noted below for
      // single-hop, so that case falls through to the *ForTokens variant
      // same as before).
      if (quoteVersion === 'v3-multihop' && v3Path !== null) {
        if (isNativeIn) {
          await writeContractAsync({
            address: feeRouterAddress,
            abi,
            functionName: 'swapExactETHForTokensV3MultiHopWithFee',
            args: [amountOutMin, v3Path, recipient, deadline],
            value: amountIn,
          });
        } else {
          await writeContractAsync({
            address: feeRouterAddress,
            abi,
            functionName: 'swapExactTokensForTokensV3MultiHopWithFee',
            args: [amountIn, amountOutMin, v3Path, recipient, deadline],
          });
        }
      } else if (quoteVersion === 'v3' && v3Fee !== null) {
        // Direct/single-hop only, matching what's actually quoted. tokenIn/
        // tokenOut come from `path`'s two ends (already WBNB-substituted
        // for a native endpoint by useEvmQuote).
        //
        // NOTE (pre-existing, not introduced here): neither this branch nor
        // the multi-hop one above, nor the V2 branch below, has a "deliver
        // native BNB out" path — FeeRouter.sol has no plain
        // swapExactTokensForETHWithFee at all, only the ETH-in direction.
        // If tokenOut is native BNB, path's last entry is WBNB, and the
        // *ForTokens call below delivers wrapped WBNB to `recipient`, not
        // native BNB — same gap the pre-2026-09-29 V2-only contract already
        // had. FeeRouter.sol's swapExactTokensForETHV3WithFee /
        // swapExactTokensForETHV3MultiHopWithFee (added alongside V3
        // support) can close this once the frontend is intentionally wired
        // for a native BNB *output*, a separate change from this one.
        if (isNativeIn) {
          await writeContractAsync({
            address: feeRouterAddress,
            abi,
            functionName: 'swapExactETHForTokensV3WithFee',
            args: [amountOutMin, path[path.length - 1], v3Fee, recipient, deadline],
            value: amountIn,
          });
        } else {
          await writeContractAsync({
            address: feeRouterAddress,
            abi,
            functionName: 'swapExactTokensForTokensV3WithFee',
            args: [amountIn, amountOutMin, path[0], path[path.length - 1], v3Fee, recipient, deadline],
          });
        }
      } else if (isNativeIn) {
        await writeContractAsync({
          address: feeRouterAddress,
          abi,
          functionName: feeOnTransfer
            ? 'swapExactETHForTokensWithFeeSupportingFeeOnTransferTokens'
            : 'swapExactETHForTokensWithFee',
          args: [amountOutMin, path, recipient, deadline],
          value: amountIn,
        });
      } else {
        await writeContractAsync({
          address: feeRouterAddress,
          abi,
          functionName: feeOnTransfer
            ? 'swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens'
            : 'swapExactTokensForTokensWithFee',
          args: [amountIn, amountOutMin, path, recipient, deadline],
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Swap execution failed');
      setState('ERROR');
    }
  };

  const reset = () => {
    setState('IDLE');
    setError(null);
  };

  return { state, execute, txHash: hash, error, reset };
}
