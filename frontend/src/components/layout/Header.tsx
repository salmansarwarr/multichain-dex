'use client';

import Image from 'next/image';
import { useChainContext } from '@/context/ChainContext';
import { ChainSwitcher } from './ChainSwitcher';
import { EvmWalletButton } from '../wallet/EvmWalletButton';

export function Header() {
  const { activeTab: _activeTab } = useChainContext();

  return (
    <header className="w-full glass-card rounded-none border-t-0 border-x-0 border-b border-border/50 sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Image
            src="/alfat-terra-logo.png"
            alt="AlphaterraSwapX"
            width={80}
            height={80}
            className="w-10 h-10 md:w-20 md:h-20 rounded-full shadow-lg shadow-primary/20 flex-shrink-0"
            priority
          />
          <span className="text-base md:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 truncate">
            AlphaterraSwapX
          </span>
        </div>

        <div className="hidden md:block">
          <ChainSwitcher />
        </div>

        <div className="flex items-center flex-shrink-0">
          <EvmWalletButton />
        </div>
      </div>

      {/* Chain tabs move here on mobile instead of disappearing — a visitor
          who hasn't connected a wallet yet still needs a way to pick a
          chain, and the row above is already tight on small screens. */}
      <div className="md:hidden flex justify-center px-4 pb-3">
        <ChainSwitcher />
      </div>
    </header>
  );
}

