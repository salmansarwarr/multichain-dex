'use client';

import { useState, useEffect } from 'react';
import { useConnect, type Connector } from 'wagmi';
import {
  trustWallet,
  coinbaseWallet,
  binanceWallet,
  okxWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { metaMaskWalletConnectOnly } from '@/config/metaMaskWalletConnectOnly';
import { useWalletModal } from '@/context/WalletModalContext';

type Mode = 'select' | 'computer' | 'phone';

// Which wallets show up in each mode, by connector id (see config/wagmi.ts
// for what's actually registered with wagmi). walletConnect only makes
// sense on the "computer" side — it's a QR code to scan *with* a phone,
// not something a phone itself would tap.
const COMPUTER_WALLET_IDS = ['metaMask', 'coinbase', 'okx', 'binance', 'walletConnect'];
const PHONE_WALLET_IDS = ['metaMask', 'trust', 'coinbase', 'okx'];

// Same wallet-creator functions used in config/wagmi.ts, called again here
// purely to read their bundled iconUrl — connectorsForWallets doesn't carry
// that through onto the plain wagmi Connector object it returns, so this is
// the one supported way to get RainbowKit's own wallet icons without
// re-sourcing logo assets from a third party.
type IconSourceArgs = { projectId: string; appName: string };
const ICON_SOURCES: Record<string, (args: IconSourceArgs) => { iconUrl: string | (() => Promise<string>) }> = {
  metaMask: metaMaskWalletConnectOnly,
  trust: trustWallet,
  coinbase: coinbaseWallet,
  binance: binanceWallet,
  okx: okxWallet,
  walletConnect: walletConnectWallet,
};

// RainbowKit's `connectorsForWallets` only carries a wallet's real identity
// (name, icon, id) through as this `rkDetails` property — the underlying
// wagmi `Connector.id`/`.name` collapse to the generic "walletConnect" /
// "WalletConnect" for every wallet that falls back to WalletConnect (i.e.
// all of them here except an actually-installed extension), since RainbowKit
// reuses wagmi's own `walletConnect()` connector factory unmodified. So
// matching/display must go through `rkDetails`, never `connector.id/.name`.
type RainbowKitConnector = Connector & {
  rkDetails?: {
    id?: string;
    name?: string;
    mobile?: { getUri?: (uri: string) => string };
  };
};

// wagmi's `connect()` only starts the WalletConnect pairing handshake — it
// never opens the wallet app itself. The app-store-provided RainbowKit modal
// does that separately: it listens for the connector's one-off
// `display_uri` event (fired by wagmi's walletConnect connector once a
// pairing URI exists), turns it into that wallet's own deep link via
// `rkDetails.mobile.getUri`, and navigates there. Skipping this step is why
// tapping a wallet here used to just hang on "Connecting…" on a real
// phone — the pairing URI existed, but nothing ever launched the wallet app
// to approve it. Wallets with no `mobile.getUri` (already-injected
// providers, or Coinbase Wallet, which redirects via its own SDK) don't
// need this and are left alone.
async function redirectToWalletApp(connector: RainbowKitConnector) {
  const getUri = connector.rkDetails?.mobile?.getUri;
  if (!getUri) return;

  const provider = (await connector.getProvider()) as {
    once?: (event: 'display_uri', callback: (uri: string) => void) => void;
  };
  provider.once?.('display_uri', (uri) => {
    const deepLink = getUri(uri);
    if (deepLink.startsWith('http')) {
      const link = document.createElement('a');
      link.href = deepLink;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.click();
    } else {
      window.location.href = deepLink;
    }
  });
}

function useWalletIcons(ids: string[]) {
  const [icons, setIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

    ids.forEach(async (id) => {
      if (icons[id] || !ICON_SOURCES[id]) return;
      const { iconUrl } = ICON_SOURCES[id]({ projectId, appName: 'AlphaterraSwapX' });
      const resolved = typeof iconUrl === 'function' ? await iconUrl() : iconUrl;
      if (!cancelled) setIcons((prev) => ({ ...prev, [id]: resolved }));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  return icons;
}

// Only ever opened on mobile viewports — see WalletModalContext, which
// routes desktop straight to RainbowKit's own connect modal instead. Still
// offers both "Computer" and "Phone" picks here (not just Phone) because a
// mobile visitor may still want the WalletConnect QR/computer-wallet path,
// e.g. to pair with a wallet running on a nearby desktop.
export function WalletConnectModal() {
  const { isOpen, close } = useWalletModal();
  const { connectors, connect, status, variables } = useConnect();
  const [mode, setMode] = useState<Mode>('select');
  const icons = useWalletIcons([...COMPUTER_WALLET_IDS, ...PHONE_WALLET_IDS]);

  const handleClose = () => {
    close();
    // Reset back to the mode picker for next time, after the close
    // animation would have finished.
    setTimeout(() => setMode('select'), 200);
  };

  // Close automatically once a connection succeeds, instead of leaving the
  // picker sitting open over the now-connected app.
  useEffect(() => {
    if (status === 'success' && isOpen) handleClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isOpen]);

  if (!isOpen) return null;

  const walletIds = mode === 'computer' ? COMPUTER_WALLET_IDS : PHONE_WALLET_IDS;
  const wallets = walletIds
    .map((id) => (connectors as RainbowKitConnector[]).find((c) => c.rkDetails?.id === id))
    .filter((c): c is RainbowKitConnector => Boolean(c));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h3 className="font-bold text-lg">
            {mode === 'select' ? 'Connect Wallet' : mode === 'computer' ? 'Computer wallets' : 'Phone wallets'}
          </h3>
          <button onClick={handleClose} className="p-2 text-text-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {mode === 'select' ? (
          <div className="p-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode('computer')}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border bg-surface-light hover:border-primary/50 hover:bg-white/5 transition-all"
            >
              <svg className="w-9 h-9 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-semibold text-sm">Computer</span>
              <span className="text-xs text-text-muted text-center">Browser extension or scan with your phone</span>
            </button>

            <button
              onClick={() => setMode('phone')}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border bg-surface-light hover:border-primary/50 hover:bg-white/5 transition-all"
            >
              <svg className="w-9 h-9 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="font-semibold text-sm">Phone</span>
              <span className="text-xs text-text-muted text-center">Android or iPhone — opens your wallet app</span>
            </button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-2">
            <button
              onClick={() => setMode('select')}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition-colors mb-1 self-start"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {wallets.map((connector) => {
              const isPending = status === 'pending' && variables?.connector === connector;
              const displayName = connector.rkDetails?.name ?? connector.name;
              const iconSrc = icons[connector.rkDetails?.id ?? connector.id];
              return (
                <button
                  key={connector.uid}
                  onClick={() => {
                    redirectToWalletApp(connector);
                    connect({ connector });
                  }}
                  disabled={status === 'pending'}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left border border-border disabled:opacity-50"
                >
                  {iconSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element -- wallet icons resolve to dynamically-bundled/data-URI sources from RainbowKit, not a configured next/image host
                    <img src={iconSrc} alt={displayName} className="w-8 h-8 rounded-lg shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-surface-light shrink-0 animate-pulse" />
                  )}
                  <span className="font-medium text-sm flex-1">{displayName}</span>
                  {isPending && (
                    <span className="text-xs text-text-muted">Connecting…</span>
                  )}
                </button>
              );
            })}

            {wallets.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No wallets configured for this mode.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
