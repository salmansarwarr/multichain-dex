'use client';

import Image from 'next/image';
import { useChainContext } from '@/context/ChainContext';
import { ChainSwitcher } from './ChainSwitcher';
import { EvmWalletButton } from '../wallet/EvmWalletButton';

export function Header() {
  const { activeTab: _activeTab } = useChainContext();

  return (
    <header className="w-full flex items-center justify-between px-6 py-4 glass-card rounded-none border-t-0 border-x-0 border-b border-border/50 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <Image
          src="/alfat-terra-logo.png"
          alt="AlphaterraSwapX"
          width={32}
          height={32}
          className="w-8 h-8 rounded-full shadow-lg shadow-primary/20"
          priority
        />
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
          AlphaterraSwapX
        </span>
      </div>

      <div className="hidden md:block">
        <ChainSwitcher />
      </div>

      <div className="flex items-center">
        <EvmWalletButton />
      </div>
    </header>
  );
}

