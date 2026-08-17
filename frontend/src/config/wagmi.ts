import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  walletConnectWallet,
  coinbaseWallet,
  trustWallet,
  binanceWallet,
  okxWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { metaMaskWalletConnectOnly } from './metaMaskWalletConnectOnly';
import { customBscTestnet, customBsc, customSepolia, customMainnet, customArbitrumSepolia, customArbitrumOne } from './chains';
import { createConfig, http } from 'wagmi';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

// WalletConnect (used by Trust/Binance/OKX/etc. whenever the matching
// extension isn't detected) shows this metadata in the wallet app during
// pairing, and some wallets use it to verify the requesting origin. appUrl
// is left unset so RainbowKit defaults it to window.location.origin — it
// always matches whatever domain the app is actually served from (localhost
// in dev, the real domain in prod) instead of a hardcoded value that would
// go stale.
const siteOrigin =
  typeof window !== 'undefined' ? window.location.origin : 'https://alphaterracoin.com';

// RainbowKit's bundled metaMaskWallet is deliberately NOT used — on mobile
// it unconditionally routes through MetaMask's own legacy SDK relay
// (metamask-sdk.api.cx.metamask.io), which drops its WebSocket connection
// when the browser tab is backgrounded during the app-switch to MetaMask,
// so returning to the tab after switching networks never delivers the
// update. metaMaskWalletConnectOnly (./metaMaskWalletConnectOnly.ts) is a
// same-branded replacement: connects directly when MetaMask's own injected
// provider is present (its in-app browser, or the desktop extension — no
// relay involved either way), and falls back to standard WalletConnect
// otherwise — the same relay walletConnectWallet uses for every other
// wallet, confirmed reliable across the same background/foreground cycle.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        metaMaskWalletConnectOnly,
        walletConnectWallet,
        trustWallet,
        binanceWallet,
        okxWallet,
        coinbaseWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: 'AlphaterraSwapX',
    appDescription:
      'Multichain DEX for the Alphaterracoin ecosystem — swap tokens across BSC, Ethereum, and Arbitrum.',
    appIcon: `${siteOrigin}/alfat-terra-logo.png`,
    projectId,
  },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [customBscTestnet, customBsc, customSepolia, customMainnet, customArbitrumSepolia, customArbitrumOne],
  transports: {
    // retryCount: 0 — viem's http transport retries 429s (and generic fetch
    // failures) internally by default (retryCount: 3), invisibly to app code.
    // useSwapHistory already layers its own retry/backoff on top of this, so
    // the two compound: a single rate-limited call could silently balloon to
    // (1 + our retries) x (1 + viem's 3 retries) real HTTP requests, making
    // throttling worse right when the endpoint is already struggling. Let
    // call sites that want retries own that decision explicitly instead.
    [customBscTestnet.id]: http(customBscTestnet.rpcUrls.default.http[0], { retryCount: 0 }),
    [customBsc.id]: http(customBsc.rpcUrls.default.http[0], { retryCount: 0 }),
    [customSepolia.id]: http(customSepolia.rpcUrls.default.http[0], { retryCount: 0 }),
    [customMainnet.id]: http(customMainnet.rpcUrls.default.http[0], { retryCount: 0 }),
    [customArbitrumSepolia.id]: http(customArbitrumSepolia.rpcUrls.default.http[0], { retryCount: 0 }),
    [customArbitrumOne.id]: http(customArbitrumOne.rpcUrls.default.http[0], { retryCount: 0 }),
  },
  ssr: true, // Since we're using Next.js App Router
});

