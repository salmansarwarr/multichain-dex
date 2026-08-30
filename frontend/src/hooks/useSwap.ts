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
    feeOnTransfer: boolean = false
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

      if (isNativeIn) {
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
