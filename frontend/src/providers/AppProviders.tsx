'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';

import { wagmiConfig } from '../config/wagmi';
import { ChainProvider } from '../context/ChainContext';

import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

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
            {children}
          </ChainProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

