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
    // `quoteVersion`) — 'v2' by default for every caller that predates
    // this param (Ethereum/Arbitrum's EthFeeRouter has no V3 functions at
    // all yet, and BSC only ever returns 'v3' once the configured
    // FeeRouter contract actually has them — see useEvmQuote.ts). When
    // 'v3', `v3Fee` (useEvmQuote's `v3Fee`) must be the winning pool's fee
    // tier — required by the V3 functions' `fee` param, meaningless for V2.
    quoteVersion: 'v2' | 'v3' = 'v2',
    v3Fee: number | null = null
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

      // V3 execution — BSC only (see useEvmQuote.ts; quoteVersion can only
      // be 'v3' there), direct/single-hop only, matching what's actually
      // quoted right now. tokenIn/tokenOut come from `path`'s two ends
      // (already WBNB-substituted for a native endpoint by useEvmQuote),
      // not the raw `tokenIn` param, since the V3 token->token function
      // needs a real ERC20 address on both sides.
      //
      // NOTE (pre-existing, not introduced here): neither this V3 branch
      // nor the V2 branch below has a "deliver native BNB out" path —
      // FeeRouter.sol has no plain swapExactTokensForETHWithFee at all,
      // only the ETH-in direction. If tokenOut is native BNB, path's last
      // entry is WBNB, and the *ForTokens* call below delivers wrapped
      // WBNB to `recipient`, not native BNB — same gap the pre-2026-09-29
      // V2-only contract already had. FeeRouter.sol's new
      // swapExactTokensForETHV3WithFee (added alongside V3 support) can
      // close this once the frontend is intentionally wired for a native
      // BNB *output*, which is a separate change from this one.
      if (quoteVersion === 'v3' && v3Fee !== null) {
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
