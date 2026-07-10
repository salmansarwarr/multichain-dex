'use client';

import { Header } from '@/components/layout/Header';
import { SwapCard } from '@/components/ui/SwapCard';
import { WalletStatus } from '@/components/ui/WalletStatus';
import { SwapHistory } from '@/components/swap/SwapHistory';
import { useAccount } from 'wagmi';
import { useChainContext } from '@/context/ChainContext';

export default function Home() {
  const { activeTab } = useChainContext();
  const { chain, isConnected } = useAccount();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <Header />

      <div className="flex-1 w-full px-4 relative z-10 flex flex-col items-center">
        <SwapCard />
        
        {activeTab !== 'solana' && isConnected && (
          <SwapHistory chainId={chain?.id} />
        )}
        
        <WalletStatus />
      </div>

      {/* Decorative background blobs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
    </main>
  );
}
