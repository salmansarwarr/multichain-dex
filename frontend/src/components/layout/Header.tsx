'use client';

import { useChainContext } from '@/context/ChainContext';
import { ChainSwitcher } from './ChainSwitcher';
import { EvmWalletButton } from '../wallet/EvmWalletButton';
import { SolanaWalletButton } from '../wallet/SolanaWalletButton';

export function Header() {
  const { activeTab } = useChainContext();

  return (
    <header className="w-full flex items-center justify-between px-6 py-4 glass-card rounded-none border-t-0 border-x-0 border-b border-border/50 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center font-bold text-white shadow-lg shadow-primary/20">
          M
        </div>
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
          MultiChain
        </span>
      </div>

      <div className="hidden md:block">
        <ChainSwitcher />
      </div>

      <div className="flex items-center">
        {activeTab === 'solana' ? <SolanaWalletButton /> : <EvmWalletButton />}
      </div>
    </header>
  );
}
