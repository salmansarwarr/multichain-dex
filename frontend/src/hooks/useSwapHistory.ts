import { useState, useEffect } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { getAbiItem } from "viem";
import { FeeRouterABI } from "../abis/FeeRouter";
import { getFeeRouterAddress } from "../config/contracts";
import { Address, PublicClient } from "viem";
import { withRpcRetry, sleep } from "./rpcRetry";

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
// Kept low deliberately: at the 10-block/call free-tier cap below, each
// 1,000 blocks costs 100 eth_getLogs calls. 5,000 (500 calls) was blowing
// through the Alchemy free-tier quota and causing sustained 429s.
const LOOKBACK_BLOCKS = 1_000n;

// Alchemy free-tier eth_getLogs range cap. This is NOT a soft default —
// exceeding it is a hard 400 (InvalidRequestRpcError), not a throttle.
// Confirmed cap: 10 blocks per call on BNB testnet free tier. If you upgrade
// to PAYG, this can go up — check the RPC error message's suggested range
// before raising it again.
const CHUNK_SIZE = 10n;

// How many chunk requests to run in parallel. Keeps 500 sequential requests
// (5,000 / 10) from taking forever, while staying under Alchemy's CU/s
// ceiling. Lowered from 8 -> 3: 8 concurrent connections to the same host
// was triggering dropped connections ("Failed to fetch") on the free tier.
// Tune down further if you still see failures.
const CONCURRENCY = 3;

// Retry/backoff for CU/s throttling (Alchemy returns a JSON-RPC error, not an
// HTTP 429, when you exceed compute units per second) AND for transient
// network failures (dropped connections show up as a generic browser
// "Failed to fetch", not a JSON-RPC error, so they need their own check).
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

async function getLogsWithRetry(
    publicClient: PublicClient,
    params: Record<string, unknown>,
): Promise<Awaited<ReturnType<PublicClient["getLogs"]>>> {
    return withRpcRetry(
        () => publicClient.getLogs(params as any),
        MAX_RETRIES,
        BASE_DELAY_MS,
    );
}

// Builds the list of [fromBlock, toBlock] windows, each no larger than
// chunkSize, covering [fromBlock, toBlock] inclusive.
function buildBlockRanges(
    fromBlock: bigint,
    toBlock: bigint,
    chunkSize: bigint,
): Array<{ fromBlock: bigint; toBlock: bigint }> {
    const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
        const end =
            start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
        ranges.push({ fromBlock: start, toBlock: end });
    }
    return ranges;
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
    concurrency: number = CONCURRENCY,
) {
    const ranges = buildBlockRanges(fromBlock, toBlock, chunkSize);
    const allLogs: Awaited<ReturnType<PublicClient["getLogs"]>> = [];

    for (let i = 0; i < ranges.length; i += concurrency) {
        const batch = ranges.slice(i, i + concurrency);

        // eslint-disable-next-line no-await-in-loop -- batches must stay sequential; requests within a batch run in parallel
        const results = await Promise.all(
            batch.map((range) =>
                getLogsWithRetry(publicClient, {
                    ...baseParams,
                    fromBlock: range.fromBlock,
                    toBlock: range.toBlock,
                }),
            ),
        );

        for (const logs of results) {
            allLogs.push(...logs);
        }

        // Small pacing gap between batches even on success — keeps us under
        // CU/s ceilings proactively instead of only reacting after a throttle.
        if (i + concurrency < ranges.length) {
            // eslint-disable-next-line no-await-in-loop -- intentional pacing pause
            await sleep(100);
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