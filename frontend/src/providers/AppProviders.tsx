'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

import { wagmiConfig } from '../config/wagmi';
import { solanaEndpoint, solanaWallets } from '../config/solana';
import { ChainProvider } from '../context/ChainContext';

import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ChainProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={darkTheme({
            accentColor: 'hsl(255, 80%, 60%)',
            accentColorForeground: 'white',
            borderRadius: 'large',
          })}>
            <ConnectionProvider endpoint={solanaEndpoint}>
              <WalletProvider wallets={solanaWallets} autoConnect>
                <WalletModalProvider>
                  {children}
                </WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ChainProvider>
  );
}
