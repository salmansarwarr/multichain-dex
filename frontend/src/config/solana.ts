import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Default to devnet for testnets
export const solanaEndpoint = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || clusterApiUrl('devnet');
export const solanaMainnetEndpoint = process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || clusterApiUrl('mainnet-beta');

export const solanaWallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
];
