'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useWalletModal } from '@/context/WalletModalContext';

export function EvmWalletButton() {
  const { isConnected } = useAccount();
  const { open } = useWalletModal();

  // Once connected (or on a wrong network), RainbowKit's own account/chain
  // UI is unchanged on every screen size — this only affects the initial
  // "Connect Wallet" trigger.
  if (isConnected) {
    return <ConnectButton showBalance={false} chainStatus="icon" />;
  }

  return (
    <>
      {/* Desktop: exactly the same RainbowKit button as before. */}
      <div className="hidden md:block">
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>
      {/* Mobile: opens the computer/phone wallet picker instead. */}
      <button
        onClick={open}
        className="md:hidden px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-all"
      >
        Connect Wallet
      </button>
    </>
  );
}
