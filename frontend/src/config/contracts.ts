import { customBscTestnet, customSepolia } from './chains';
import { Address } from 'viem';

export const contracts = {
  bscTestnet: {
    feeRouter: (process.env.NEXT_PUBLIC_BSC_FEE_ROUTER_ADDRESS as Address) || '0xBd018b76A06C51f000EB3DB6a1861384643D5E16',
    chainId: customBscTestnet.id,
  },
  sepolia: {
    feeRouter: (process.env.NEXT_PUBLIC_ETH_FEE_ROUTER_ADDRESS as Address) || '0x0f3eA3301da9DD6d287130bDb8454302808CbcC2',
    chainId: customSepolia.id,
  },
  solana: {
    feeWallet: process.env.NEXT_PUBLIC_SOLANA_FEE_WALLET_ADDRESS || '',
    feeBps: 15,
  }
} as const;

export function getFeeRouterAddress(chainId: number): Address | undefined {
  if (chainId === contracts.bscTestnet.chainId) return contracts.bscTestnet.feeRouter;
  if (chainId === contracts.sepolia.chainId) return contracts.sepolia.feeRouter;
  return undefined;
}
