'use client';

import { ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useReconnect } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';

import { wagmiConfig } from '../config/wagmi';
import { ChainProvider } from '../context/ChainContext';
import { WalletModalProvider } from '../context/WalletModalContext';
import { WalletConnectModal } from '../components/wallet/WalletConnectModal';

import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

// wagmi's `chain`/`chainId` state (what ChainContext follows) is updated by
// the active connector's own event emitter, not by React Query — so it's
// not something a cache refresh can fix. On mobile, switching network by
// deep-linking out to the MetaMask app and back can leave that connector
// event un-delivered (the tab was backgrounded the whole time), so wagmi
// never hears about the switch even though MetaMask confirms it succeeded.
// `reconnect()` re-runs the connector's handshake and pulls its current
// live chainId/accounts directly, which is the correct fix for "the
// connection might be stale" rather than a data-cache concern.
function WalletVisibilitySync() {
  const { isConnected, connector } = useAccount();
  const { reconnect } = useReconnect();

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return;
      if (!isConnected || !connector) return;
      reconnect({ connectors: [connector] });
    }
    document.addEventListener('visibilitychange', handleVisibility);
    // Covers browsers/OSes that fire pageshow (back-forward cache resume)
    // instead of, or in addition to, visibilitychange.
    window.addEventListener('pageshow', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handleVisibility);
    };
  }, [isConnected, connector, reconnect]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: 'hsl(255, 80%, 60%)',
          accentColorForeground: 'white',
          borderRadius: 'large',
        })}>
          {/* ChainProvider needs to read the wallet's connected chain (to
              follow a network switch made directly in the wallet, not just
              via this app's own tab buttons), so it has to sit inside
              WagmiProvider, not outside it. */}
          <ChainProvider>
            <WalletModalProvider>
              <WalletVisibilitySync />
              {children}
              <WalletConnectModal />
            </WalletModalProvider>
          </ChainProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

