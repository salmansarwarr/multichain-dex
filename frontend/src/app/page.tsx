'use client';

import Image from 'next/image';
import { Header } from '@/components/layout/Header';
import { SwapCard } from '@/components/ui/SwapCard';
import { WalletStatus } from '@/components/ui/WalletStatus';
import { SwapHistory } from '@/components/swap/SwapHistory';
import { useAccount } from 'wagmi';

const WEBSITE_URL = 'https://alphaterracoin.com/';
// TODO: replace with the real OpenSea collection URL.
const NFT_COLLECTION_URL = 'https://opensea.io/';

function HexagonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M9 3.5h6L21 12l-6 8.5H9L3 12z" strokeLinejoin="round" />
    </svg>
  );
}

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

        <div className="w-full flex items-start justify-center gap-6 mt-6">
          <div className="hidden lg:flex flex-col items-center gap-4 flex-1 max-w-xs">
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Alphaterracoin website"
              className="text-primary hover:text-primary-hover transition-colors"
            >
              <HexagonIcon className="w-8 h-8" />
            </a>

            <div className="relative w-full max-w-[320px] aspect-square rounded-2xl border-2 border-primary/30 overflow-hidden flex items-center justify-center shadow-xl shadow-primary/10">
              <video
                src="/princess-alphaterra-video.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
                aria-label="Princess Alphaterra"
              />
              <Image
                src="/alfat-terra-logo.png"
                alt="Alfat"
                width={64}
                height={64}
                className="absolute bottom-3 left-3 w-16 h-16 rounded-full border-2 border-white/20 shadow-lg shadow-primary/30"
              />
            </div>

            <p className="text-center text-sm text-text-muted">
              Buy and sales in secure Top Crypto Worldwide and Alfat Token with{' '}
              <span className="text-primary font-semibold">Princess Alphaterra</span>
            </p>
          </div>

          <SwapCard />

          <div className="hidden lg:flex flex-col items-center gap-4 flex-1 max-w-xs">
            <a
              href={NFT_COLLECTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Alphaterra NFT collection on OpenSea"
              className="text-primary hover:text-primary-hover transition-colors"
            >
              <HexagonIcon className="w-8 h-8" />
            </a>

            <div className="relative w-full max-w-[320px] aspect-square rounded-2xl border-2 border-primary/30 overflow-hidden flex items-center justify-center shadow-xl shadow-primary/10">
              <video
                src="/alfat-man-video.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
                aria-label="Alfat Man"
              />
            </div>

            <p className="text-center text-sm text-text-muted">
              Swap Best worldwide Tokens in Decentralized Mode with small Fees transactions with{' '}
              <span className="text-primary font-semibold">Alfat Man</span>
            </p>
          </div>
        </div>

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

