import { useState, useEffect } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { getAbiItem } from "viem";
import { FeeRouterABI } from "../abis/FeeRouter";
import { getFeeRouterAddress } from "../config/contracts";
import { Address, PublicClient } from "viem";

export interface SwapHistoryEvent {
    transactionHash: string;
    blockNumber: bigint;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    feeAmount: bigint;
}

// How far back to scan, in blocks. Tune per chain (block time varies a lot
// between e.g. BSC and Ethereum mainnet) — consider making this per-chainId.
const LOOKBACK_BLOCKS = 5_000n;

// Free-tier RPC providers (publicnode, Alchemy free, etc.) commonly cap
// eth_getLogs to a 10-block range. Adjust up if your RPC allows more.
const CHUNK_SIZE = 10n;

async function getLogsChunked(
    publicClient: PublicClient,
    baseParams: {
        address: Address;
        event: ReturnType<typeof getAbiItem>;
        args: Record<string, unknown>;
    },
    fromBlock: bigint,
    toBlock: bigint,
    chunkSize: bigint = CHUNK_SIZE,
) {
    const allLogs: Awaited<ReturnType<PublicClient["getLogs"]>> = [];

    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
        const end =
            start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;

        // eslint-disable-next-line no-await-in-loop -- must stay sequential to respect rate limits
        const logs = await publicClient.getLogs({
            ...baseParams,
            fromBlock: start,
            toBlock: end,
        } as any);

        allLogs.push(...logs);
    }

    return allLogs;
}

export function useSwapHistory(chainId: number | undefined) {
    const [history, setHistory] = useState<SwapHistoryEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
            setError(null);

            try {
                const feeRouterAddress = getFeeRouterAddress(chainId);
                if (!feeRouterAddress) {
                    setHistory([]);
                    return;
                }

                const swapExecutedEvent = getAbiItem({
                    abi: FeeRouterABI,
                    name: "SwapExecuted",
                });

                if (!swapExecutedEvent) {
                    throw new Error(
                        "SwapExecuted event not found in FeeRouterABI",
                    );
                }

                const currentBlock = await publicClient.getBlockNumber();
                const fromBlock =
                    currentBlock > LOOKBACK_BLOCKS
                        ? currentBlock - LOOKBACK_BLOCKS
                        : 0n;

                const logs = await getLogsChunked(
                    publicClient,
                    {
                        address: feeRouterAddress,
                        event: swapExecutedEvent,
                        args: { user: address },
                    },
                    fromBlock,
                    currentBlock,
                );

                if (!active) return;

                const events = logs
                    .map((log: any) => ({
                        transactionHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        tokenIn: log.args.tokenIn as Address,
                        tokenOut: log.args.tokenOut as Address,
                        amountIn: log.args.amountIn as bigint,
                        feeAmount: log.args.feeAmount as bigint,
                    }))
                    .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1)); // newest first

                setHistory(events);
            } catch (err) {
                console.error(
                    "[useSwapHistory] failed to fetch swap history",
                    err,
                );
                if (active) {
                    setHistory([]);
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to fetch swap history",
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        fetchHistory();

        return () => {
            active = false;
        };
    }, [chainId, address, publicClient]);

    return { history, loading, error };
}
