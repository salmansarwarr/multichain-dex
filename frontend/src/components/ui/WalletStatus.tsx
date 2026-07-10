'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { useChainContext } from '@/context/ChainContext';

export function WalletStatus() {
  const [mounted, setMounted] = useState(false);
  const { activeTab } = useChainContext();
  const { address: evmAddress, isConnected: isEvmConnected, chain } = useAccount();
  const { publicKey, connected: isSolanaConnected } = useWallet();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const showEvm = activeTab !== 'solana' && isEvmConnected;
  const showSolana = activeTab === 'solana' && isSolanaConnected;

  if (!showEvm && !showSolana) return null;

  return (
    <div className="mt-6 text-xs text-text-muted text-center font-mono space-y-1">
      {showEvm && (
        <>
          <p className="text-white/40">EVM Wallet</p>
          <p>{evmAddress}</p>
          <p className="text-green-400/70">on {chain?.name}</p>
        </>
      )}
      {showSolana && (
        <>
          <p className="text-white/40">Solana Wallet</p>
          <p>{publicKey?.toBase58()}</p>
        </>
      )}
    </div>
  );
}
