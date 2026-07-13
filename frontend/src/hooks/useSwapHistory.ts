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

// Alchemy allows much larger eth_getLogs ranges than 10 blocks (up to several
// thousand depending on tier/network). 10 was causing 500 sequential requests
// for a single 5,000-block lookback, which blew through CU/s and got
// throttled. Bump this way up — tune down only if you get a "range too large"
// error from your specific RPC provider.
const CHUNK_SIZE = 2_000n;

// Retry/backoff for CU/s throttling (Alchemy returns a JSON-RPC error, not an
// HTTP 429, when you exceed compute units per second).
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

function isRateLimitError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err ?? "");
    return (
        message.includes("compute units per second") ||
        message.includes("capacity") ||
        message.toLowerCase().includes("rate limit") ||
        message.includes("429")
    );
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLogsWithRetry(
    publicClient: PublicClient,
    params: Record<string, unknown>,
): Promise<Awaited<ReturnType<PublicClient["getLogs"]>>> {
    let attempt = 0;

    for (;;) {
        try {
            // eslint-disable-next-line no-await-in-loop -- retry must stay sequential
            return await publicClient.getLogs(params as any);
        } catch (err) {
            attempt += 1;
            if (attempt > MAX_RETRIES || !isRateLimitError(err)) {
                throw err;
            }
            // Exponential backoff with jitter so retries don't sync up and
            // re-trigger the same CU/s ceiling.
            const delay =
                BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250;
            // eslint-disable-next-line no-await-in-loop -- intentional backoff pause
            await sleep(delay);
        }
    }
}

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
        const logs = await getLogsWithRetry(publicClient, {
            ...baseParams,
            fromBlock: start,
            toBlock: end,
        });

        allLogs.push(...logs);

        // Small pacing gap between chunks even on success — keeps us under
        // CU/s ceilings proactively instead of only reacting after a throttle.
        if (start + chunkSize <= toBlock) {
            // eslint-disable-next-line no-await-in-loop -- intentional pacing pause
            await sleep(50);
        }
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
