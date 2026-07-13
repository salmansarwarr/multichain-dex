'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

export function WalletStatus() {
  const [mounted, setMounted] = useState(false);
  const { address: evmAddress, isConnected, chain } = useAccount();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isConnected) return null;

  return (
    <div className="mt-6 text-xs text-text-muted text-center font-mono space-y-1">
      <p className="text-white/40">EVM Wallet</p>
      <p>{evmAddress}</p>
      <p className="text-green-400/70">on {chain?.name}</p>
    </div>
  );
}

