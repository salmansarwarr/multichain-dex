import { useState, useEffect } from 'react';
import { usePublicClient, useAccount } from 'wagmi';
import { FeeRouterABI } from '../abis/FeeRouter';
import { getFeeRouterAddress } from '../config/contracts';
import { Address } from 'viem';

export interface SwapHistoryEvent {
  transactionHash: string;
  blockNumber: bigint;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  feeAmount: bigint;
}

export function useSwapHistory(chainId: number | undefined) {
  const [history, setHistory] = useState<SwapHistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId });

  useEffect(() => {
    let active = true;

    async function fetchHistory() {
      if (!chainId || !address || !publicClient) {
        setHistory([]);
        return;
      }

      setLoading(true);
      try {
        const feeRouterAddress = getFeeRouterAddress(chainId);
        if (!feeRouterAddress) return;

        // Fetch logs for the last 10 blocks (to comply with publicnode free tier limits)
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - 10n > 0n ? currentBlock - 10n : 0n;

        const logs = await publicClient.getLogs({
          address: feeRouterAddress,
          event: FeeRouterABI.find(e => e.type === 'event' && e.name === 'SwapExecuted') as any,
          args: {
            user: address
          },
          fromBlock,
          toBlock: 'latest'
        });

        if (active) {
          const events = logs.map((log: any) => ({
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            tokenIn: log.args.tokenIn as Address,
            tokenOut: log.args.tokenOut as Address,
            amountIn: log.args.amountIn as bigint,
            feeAmount: log.args.feeAmount as bigint,
          })).reverse(); // Newest first

          setHistory(events);
        }
      } catch (err: any) {
        // Silently ignore RPC errors for history to avoid spamming the console 
        // with free-tier RPC limitations (e.g. archive node required)
        if (active) setHistory([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchHistory();

    return () => { active = false; };
  }, [chainId, address, publicClient]);

  return { history, loading };
}
