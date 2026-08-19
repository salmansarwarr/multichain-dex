'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';

interface WalletModalContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const WalletModalContext = createContext<WalletModalContextType | undefined>(undefined);

// Tailwind's `md` breakpoint — matches the `hidden md:block` / `md:hidden`
// pairs already used throughout the layout (e.g. Header.tsx's ChainSwitcher)
// to distinguish mobile from desktop.
const MOBILE_BREAKPOINT_PX = 768;

// Shared so the header's connect button and the swap card's own "Connect
// Wallet" button both go through the same entry point. On desktop this is a
// pass-through to RainbowKit's own connect modal — unchanged from before.
// On mobile it opens our own computer/phone wallet picker instead, since
// RainbowKit's single modal doesn't let a visitor pick between "wallets on
// this device" and "wallets on my phone" the way the swap-page UX wants.
export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { openConnectModal } = useConnectModal();

  const open = useCallback(() => {
    const isMobileViewport =
      typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;
    if (isMobileViewport) {
      setIsOpen(true);
    } else {
      openConnectModal?.();
    }
  }, [openConnectModal]);

  const close = useCallback(() => setIsOpen(false), []);

  return (
    <WalletModalContext.Provider value={{ isOpen, open, close }}>
      {children}
    </WalletModalContext.Provider>
  );
}

export function useWalletModal() {
  const context = useContext(WalletModalContext);
  if (context === undefined) {
    throw new Error('useWalletModal must be used within a WalletModalProvider');
  }
  return context;
}
