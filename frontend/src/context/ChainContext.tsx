'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ChainTab = 'bsc' | 'ethereum' | 'arbitrum';

interface ChainContextType {
  activeTab: ChainTab;
  setActiveTab: (tab: ChainTab) => void;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

export function ChainProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<ChainTab>('bsc');
  const [mounted, setMounted] = useState(false);

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

