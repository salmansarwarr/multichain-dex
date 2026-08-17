'use client';

import { createConnector } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { getWalletConnectConnector, type Wallet } from '@rainbow-me/rainbowkit';

// A "MetaMask" wallet entry that never touches MetaMask's own legacy SDK
// relay (metamask-sdk.api.cx.metamask.io) — see the note where this is used
// in config/wagmi.ts for why. Two paths only:
//   1. MetaMask's own injected provider is present (its in-app mobile
//      browser, or the desktop extension) -> connect to it directly, no
//      relay involved at all.
//   2. Otherwise (Chrome/Safari, no extension) -> standard WalletConnect,
//      deep-linking via MetaMask's official universal link
//      (metamask.app.link), same mechanism RainbowKit's own
//      walletConnectWallet uses for every other wallet.
// Deliberately simpler than RainbowKit's bundled metaMaskWallet: this skips
// its long isMetaMask() spoof-detection filter (Brave/Rabby/etc. also set
// window.ethereum.isMetaMask) since a false positive here just means that
// wallet's own injected provider gets used instead of a WalletConnect
// prompt — a reasonable fallback, not a broken one.
function isMetaMaskInjected(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask);
}

export const metaMaskWalletConnectOnly = ({
  projectId,
  walletConnectParameters,
}: {
  projectId: string;
  walletConnectParameters?: Record<string, unknown>;
}): Wallet => {
  const injectedDetected = isMetaMaskInjected();

  return {
    id: 'metaMask',
    name: 'MetaMask',
    rdns: 'io.metamask',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
    iconAccent: '#f6851a',
    iconBackground: '#fff',
    installed: injectedDetected ? true : undefined,
    downloadUrls: {
      android: 'https://play.google.com/store/apps/details?id=io.metamask',
      ios: 'https://apps.apple.com/us/app/metamask/id1438144202',
      mobile: 'https://metamask.io/download',
      qrCode: 'https://metamask.io/download',
      chrome:
        'https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn',
      browserExtension: 'https://metamask.io/download',
    },
    mobile: {
      getUri: injectedDetected
        ? undefined
        : (uri: string) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
    },
    qrCode: injectedDetected
      ? undefined
      : {
          getUri: (uri: string) => uri,
          instructions: {
            learnMoreUrl: 'https://metamask.io/faqs/',
            steps: [
              {
                description: 'Install the MetaMask app and set up your wallet.',
                step: 'install',
                title: 'Get the MetaMask app',
              },
              {
                description: 'Create a wallet or import an existing one.',
                step: 'create',
                title: 'Create or import a wallet',
              },
              {
                description: 'After connecting, refresh the browser if it doesn’t update automatically.',
                step: 'refresh',
                title: 'Refresh your browser',
              },
            ],
          },
        },
    createConnector: injectedDetected
      ? (walletDetails) =>
          createConnector((config) => ({
            ...injected()(config),
            ...walletDetails,
          }))
      : getWalletConnectConnector({ projectId, walletConnectParameters }),
  };
};
