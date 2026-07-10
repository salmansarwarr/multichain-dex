'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function SolanaWalletButton() {
  return (
    <WalletMultiButton 
      className="!bg-primary hover:!bg-primary-hover !transition-colors !rounded-xl !h-10" 
    />
  );
}
