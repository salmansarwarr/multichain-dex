import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { customBscTestnet, customBsc, customSepolia, customMainnet, customArbitrumSepolia, customArbitrumOne } from './chains';
import { http } from 'wagmi';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

export const wagmiConfig = getDefaultConfig({
  appName: 'AlphaterraSwapX',
  projectId,
  chains: [customBscTestnet, customBsc, customSepolia, customMainnet, customArbitrumSepolia, customArbitrumOne],
  transports: {
    [customBscTestnet.id]: http(customBscTestnet.rpcUrls.default.http[0]),
    [customBsc.id]: http(customBsc.rpcUrls.default.http[0]),
    [customSepolia.id]: http(customSepolia.rpcUrls.default.http[0]),
    [customMainnet.id]: http(customMainnet.rpcUrls.default.http[0]),
    [customArbitrumSepolia.id]: http(customArbitrumSepolia.rpcUrls.default.http[0]),
    [customArbitrumOne.id]: http(customArbitrumOne.rpcUrls.default.http[0]),
  },
  ssr: true, // Since we're using Next.js App Router
});

