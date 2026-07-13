'use client';

import { Header } from '@/components/layout/Header';
import { SwapCard } from '@/components/ui/SwapCard';
import { WalletStatus } from '@/components/ui/WalletStatus';
import { SwapHistory } from '@/components/swap/SwapHistory';
import { useAccount } from 'wagmi';

export default function Home() {
  const { chain, isConnected } = useAccount();

  return (
    <main className="flex min-h-screen flex-col items-center">
      <Header />

      <div className="flex-1 w-full px-4 relative z-10 flex flex-col items-center">
        <h1 className="mt-10 text-3xl md:text-4xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
          AlphaterraSwapX
        </h1>
        <p className="mt-3 max-w-xl text-center text-sm md:text-base text-text-muted">
          Connect the best DeFi and Web3 tokens in the crypto world within the Alphaterracoin Ecosystem.
        </p>

        <SwapCard />
        
        {isConnected && (
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

