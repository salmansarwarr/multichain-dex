import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { Address, isAddress } from 'viem';
import { ERC20ABI } from '../abis/ERC20';
import { Token } from '../data/tokens';

/// Resolves an arbitrary pasted contract address into a swappable Token by
/// reading name/symbol/decimals live on-chain. Lets users trade any token
/// on a chain, not just the curated default list — the same "paste any
/// address" capability PancakeSwap/Uniswap offer.
export function useCustomToken(search: string, chainId: number | undefined) {
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicClient = usePublicClient({ chainId });

  useEffect(() => {
    const address = search.trim();
    setToken(null);
    setError(null);

    if (!isAddress(address) || !publicClient) {
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      try {
        const [name, symbol, decimals] = await Promise.all([
          publicClient.readContract({
            address: address as Address,
            abi: ERC20ABI,
            functionName: 'name',
          }),
          publicClient.readContract({
            address: address as Address,
            abi: ERC20ABI,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: address as Address,
            abi: ERC20ABI,
            functionName: 'decimals',
          }),
        ]);

        if (!active) return;
        setToken({
          address,
          name: name as string,
          symbol: symbol as string,
          decimals: decimals as number,
        });
      } catch {
        if (!active) return;
        setError('Not a valid token contract on this network');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [search, chainId, publicClient]);

  return { customToken: token, loading, error };
}
