'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'WALLETCONNECT_DEEPLINK_CHOICE';

// Written by WalletConnectModal when a mobile wallet is first connected —
// see the comment there for why. @walletconnect/sign-client is *supposed*
// to read this same key itself and auto-redirect back to the wallet app for
// every subsequent signature request (approve, swap, ...), but that's an
// internal, undocumented mechanism we can't fully verify or control, and on
// real devices it doesn't always fire. Exposing it here too lets the swap
// flow offer an explicit "Open <wallet>" fallback the user can tap whenever
// a request is pending, so getting to the wallet app never depends on that
// internal redirect actually working.
function readStoredWallet(): { href: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.href === 'string' && typeof parsed?.name === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function useWalletDeepLink() {
  // useSyncExternalStore (rather than reading localStorage inline during
  // render) keeps this consistent with SSR: the server snapshot is always
  // null, avoiding a hydration mismatch on first paint.
  const wallet = useSyncExternalStore(subscribe, readStoredWallet, () => null);

  const open = useCallback(() => {
    const stored = readStoredWallet();
    if (!stored) return;
    // Always navigate the current tab — see the matching redirect in
    // WalletConnectModal.tsx for why target="_blank" is avoided even for
    // http(s) universal links.
    window.location.href = stored.href;
  }, []);

  return { wallet, open };
}
