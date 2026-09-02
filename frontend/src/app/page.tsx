'use client';

import Image from 'next/image';
import { Header } from '@/components/layout/Header';
import { SwapCard } from '@/components/ui/SwapCard';
import { WalletStatus } from '@/components/ui/WalletStatus';
import { SwapHistory } from '@/components/swap/SwapHistory';
import { useAccount } from 'wagmi';

const WEBSITE_URL = 'https://alphaterracoin.com/';
const NFT_MINT_URL = 'https://nft-mint.alphaterracoin.com/';
const NFT_OPENSEA_URL =
  'https://opensea.io/fr/0x937cd31d806fc4ebd9a5a70c34809482e3166b6b?sortBy=listed_date';
const BINANCE_URL = 'https://www.binance.com/en';

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

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm text-center transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
          >
            Website Alphaterracoin
          </a>
          <a
            href={NFT_MINT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm text-center transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
          >
            Website NFT Art Collection of Alfat
          </a>
          <a
            href={NFT_OPENSEA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm text-center transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
          >
            NFT Art Collection in Opensea of Alfat
          </a>
          <a
            href={BINANCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm text-center transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
          >
            Trade on Binance
          </a>
        </div>

        <div className="w-full flex items-start justify-center gap-6 mt-6">
          <div className="hidden lg:flex flex-col items-center gap-4 flex-1 max-w-xs">
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Alphaterracoin website"
              className="flex items-center gap-2 text-primary hover:text-primary-hover transition-colors"
            >
              <HexagonIcon className="w-8 h-8 flex-shrink-0" />
              <span className="text-sm font-semibold">Website: Alphaterracoin.com</span>
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
              <div
                className="absolute top-0 left-0 w-[46%] h-[38%] pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse at top left, #000 45%, rgba(0,0,0,0) 75%)',
                }}
              />
            </div>

            <p className="text-center text-sm text-text-muted">
              Buy and sales in secure Top Crypto Worldwide and Alfat Token with{' '}
              <span className="text-primary font-semibold">Princess Alphaterra</span>
            </p>
          </div>

          <SwapCard />

          <div className="hidden lg:flex flex-col items-center gap-4 flex-1 max-w-xs">
            <div className="flex items-center gap-3">
              <a
                href={NFT_OPENSEA_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Alphaterra NFT art collection on OpenSea"
                className="text-primary hover:text-primary-hover transition-colors"
                title="NFT Art Collection on OpenSea"
              >
                <HexagonIcon className="w-8 h-8" />
              </a>
              <a
                href={NFT_MINT_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Alphaterra NFT website"
                className="text-primary hover:text-primary-hover transition-colors"
                title="NFT Website of Alfat"
              >
                <HexagonIcon className="w-8 h-8" />
              </a>
            </div>

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

        {/* Same two videos as the desktop side rails above, shown here
            instead on small screens — the side rails are `hidden` below the
            lg breakpoint since there's no room for them next to the swap
            card, so without this they never render on a phone at all. */}
        <div className="lg:hidden w-full max-w-[480px] mx-auto mt-6 grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-full aspect-square rounded-xl border-2 border-primary/30 overflow-hidden shadow-lg shadow-primary/10">
              <video
                src="/princess-alphaterra-video.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
                aria-label="Princess Alphaterra"
              />
            </div>
            <p className="text-center text-xs text-text-muted">
              <span className="text-primary font-semibold">Princess Alphaterra</span>
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative w-full aspect-square rounded-xl border-2 border-primary/30 overflow-hidden shadow-lg shadow-primary/10">
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
            <p className="text-center text-xs text-text-muted">
              <span className="text-primary font-semibold">Alfat Man</span>
            </p>
          </div>
        </div>

        {isConnected && (
          <SwapHistory chainId={chain?.id} />
        )}
        
        <WalletStatus />

        <div className="mt-10 mb-4 flex flex-wrap items-start justify-center gap-4">
          <Image
            src="/auditsecurity.png"
            alt="Security code audit — static and dynamic analysis"
            width={531}
            height={354}
            className="w-full max-w-[280px] h-auto rounded-xl border border-primary/20 shadow-lg shadow-primary/10"
          />
          <Image
            src="/auditAI.jpg"
            alt="AI in internal audit — opportunities and risks explained"
            width={686}
            height={386}
            className="w-full max-w-[280px] h-auto rounded-xl border border-primary/20 shadow-lg shadow-primary/10"
          />
        </div>
      </div>

      {/* Decorative background blobs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
    </main>
  );
}

