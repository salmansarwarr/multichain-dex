// Shared retry helper for RPC calls made via publicClient (getLogs,
// readContract, etc). The viem http transport's own retryCount is disabled
// app-wide (see config/wagmi.ts) to avoid stacking retries on top of this —
// this is meant to be the single retry layer.
export function isRetryableRpcError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err ?? "");
    const lower = message.toLowerCase();
    return (
        lower.includes("compute units per second") ||
        lower.includes("capacity") ||
        lower.includes("rate limit") ||
        lower.includes("429") ||
        lower.includes("failed to fetch") ||
        lower.includes("network") ||
        lower.includes("timeout") ||
        lower.includes("econnreset")
    );
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRpcRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    baseDelayMs: number,
): Promise<T> {
    let attempt = 0;

    for (;;) {
        try {
            // eslint-disable-next-line no-await-in-loop -- retry must stay sequential
            return await fn();
        } catch (err) {
            attempt += 1;
            if (attempt > maxRetries || !isRetryableRpcError(err)) {
                throw err;
            }
            const delay =
                baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250;
            // eslint-disable-next-line no-await-in-loop -- intentional backoff pause
            await sleep(delay);
        }
    }
}
