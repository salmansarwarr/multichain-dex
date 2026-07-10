'use client';

import { useChainContext } from '@/context/ChainContext';

export function ChainSwitcher() {
  const { activeTab, setActiveTab } = useChainContext();

  const tabs = [
    { id: 'bsc', label: 'BSC' },
    { id: 'ethereum', label: 'Ethereum' },
    { id: 'solana', label: 'Solana' },
  ] as const;

  return (
    <div className="flex bg-surface-light p-1 rounded-full border border-border">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
              isActive 
                ? 'bg-primary text-white shadow-md' 
                : 'text-text-muted hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
