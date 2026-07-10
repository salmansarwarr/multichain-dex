'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function EvmWalletButton() {
  return <ConnectButton showBalance={false} chainStatus="icon" />;
}
