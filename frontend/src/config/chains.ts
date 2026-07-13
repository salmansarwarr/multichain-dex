import { bscTestnet, bsc, sepolia, mainnet, arbitrumSepolia, arbitrum } from 'wagmi/chains';
import { Chain } from 'wagmi/chains';

// Define the RPC URLs from env variables
const bscTestnetRpcUrl = process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || 'https://bsc-testnet.publicnode.com';
const bscMainnetRpcUrl = process.env.NEXT_PUBLIC_BSC_MAINNET_RPC_URL || 'https://bsc-dataseed.binance.org';
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const ethMainnetRpcUrl = process.env.NEXT_PUBLIC_ETH_MAINNET_RPC_URL || 'https://eth.llamarpc.com';
const arbitrumSepoliaRpcUrl = process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const arbitrumOneRpcUrl = process.env.NEXT_PUBLIC_ARBITRUM_MAINNET_RPC_URL || 'https://arb1.arbitrum.io/rpc';

export const customBscTestnet = {
  ...bscTestnet,
  rpcUrls: {
    default: { http: [bscTestnetRpcUrl] },
    public: { http: [bscTestnetRpcUrl] },
  },
} as const satisfies Chain;

export const customBsc = {
  ...bsc,
  rpcUrls: {
    default: { http: [bscMainnetRpcUrl] },
    public: { http: [bscMainnetRpcUrl] },
  },
} as const satisfies Chain;

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [sepoliaRpcUrl] },
    public: { http: [sepoliaRpcUrl] },
  },
} as const satisfies Chain;

export const customMainnet = {
  ...mainnet,
  rpcUrls: {
    default: { http: [ethMainnetRpcUrl] },
    public: { http: [ethMainnetRpcUrl] },
  },
} as const satisfies Chain;

export const customArbitrumSepolia = {
  ...arbitrumSepolia,
  rpcUrls: {
    default: { http: [arbitrumSepoliaRpcUrl] },
    public: { http: [arbitrumSepoliaRpcUrl] },
  },
} as const satisfies Chain;

export const customArbitrumOne = {
  ...arbitrum,
  rpcUrls: {
    default: { http: [arbitrumOneRpcUrl] },
    public: { http: [arbitrumOneRpcUrl] },
  },
} as const satisfies Chain;
