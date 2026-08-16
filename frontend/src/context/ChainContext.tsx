'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAccount } from 'wagmi';

export type ChainTab = 'bsc' | 'ethereum' | 'arbitrum';

interface ChainContextType {
  activeTab: ChainTab;
  setActiveTab: (tab: ChainTab) => void;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

// Wagmi chain IDs -> which tab that maps to (testnet and mainnet both count
// as "that chain" for tab purposes — SwapCard picks the right testnet/mainnet
// contract address separately based on which network is actually connected).
const CHAIN_ID_TO_TAB: Record<number, ChainTab> = {
  97: 'bsc',            // BSC Testnet
  56: 'bsc',            // BSC Mainnet
  11155111: 'ethereum', // Ethereum Sepolia
  1: 'ethereum',        // Ethereum Mainnet
  421614: 'arbitrum',   // Arbitrum Sepolia
  42161: 'arbitrum',    // Arbitrum One
};

export function ChainProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<ChainTab>('bsc');
  const [mounted, setMounted] = useState(false);
  const { chain, isConnected } = useAccount();

  useEffect(() => {
    setMounted(true);
    const saved = sessionStorage.getItem('activeChainTab') as ChainTab;
    if (saved && ['bsc', 'ethereum', 'arbitrum'].includes(saved)) {
      setActiveTabState(saved);
    }
  }, []);

  const setActiveTab = (tab: ChainTab) => {
    setActiveTabState(tab);
    sessionStorage.setItem('activeChainTab', tab);
  };

  // Follow the wallet's actual network when it changes — e.g. the user
  // switches network directly in MetaMask rather than via this app's own
  // chain tabs/switch-network button. Without this, the app's idea of
  // "which chain is active" only ever changed when a tab was clicked here,
  // so an external switch left the mismatch banner stuck even after
  // MetaMask confirmed the switch succeeded.
  useEffect(() => {
    if (!isConnected || !chain?.id) return;
    const tab = CHAIN_ID_TO_TAB[chain.id];
    if (tab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain?.id, isConnected]);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <ChainContext.Provider value={{ activeTab: 'bsc', setActiveTab }}>
        {children}
      </ChainContext.Provider>
    );
  }

  return (
    <ChainContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChainContext() {
  const context = useContext(ChainContext);
  if (context === undefined) {
    throw new Error('useChainContext must be used within a ChainProvider');
  }
  return context;
}

