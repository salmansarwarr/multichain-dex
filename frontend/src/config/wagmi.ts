import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  trustWallet,
  binanceWallet,
  okxWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { customBscTestnet, customBsc, customSepolia, customMainnet, customArbitrumSepolia, customArbitrumOne } from './chains';
import { createConfig, http } from 'wagmi';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        metaMaskWallet,
        trustWallet,
        binanceWallet,
        okxWallet,
        coinbaseWallet,
        walletConnectWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: 'AlphaterraSwapX',
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

