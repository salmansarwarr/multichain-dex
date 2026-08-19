'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWalletModal } from '@/context/WalletModalContext';

export function EvmWalletButton() {
  const { open } = useWalletModal();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={open}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-all"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openChainModal}
                    className="p-2 rounded-xl bg-surface-light border border-border hover:border-primary/40 transition-all"
                    aria-label={chain.name}
                    title={chain.name}
                  >
                    {chain.hasIcon && chain.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- chain icon URLs come from RainbowKit's own chain metadata, not a configured next/image host
                      <img
                        alt={chain.name ?? 'Chain icon'}
                        src={chain.iconUrl}
                        className="w-5 h-5"
                      />
                    ) : (
                      <span className="text-xs px-1">{chain.name}</span>
                    )}
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="px-3 py-2 rounded-xl bg-surface-light border border-border hover:border-primary/40 text-sm font-medium transition-all"
                  >
                    {account.displayName}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
