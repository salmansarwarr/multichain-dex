import { customBscTestnet, customBsc, customSepolia, customArbitrumSepolia, customArbitrumOne } from './chains';
import { Address } from 'viem';

export const contracts = {
  bscTestnet: {
    // Redeployed 2026-08-04 (feeWallet-DoS fix, rescue functions, to!=0 check).
    feeRouter: (process.env.NEXT_PUBLIC_BSC_FEE_ROUTER_ADDRESS as Address) || '0xBbD4Ff24f2c28e6dAe5f083eb0C98EF65c2fd9e9',
    chainId: customBscTestnet.id,
  },
  // Not deployed yet — FeeRouter.sol is code-ready (fee-on-transfer support
  // for tax tokens like Alfat has been added and tested) but the mainnet
  // deploy script hasn't been run — see contracts/scripts/deploy-bsc-mainnet.ts
  // and docs/deployments.md. Feed the real address in via env once it's live.
  bscMainnet: {
    feeRouter: (process.env.NEXT_PUBLIC_BSC_MAINNET_FEE_ROUTER_ADDRESS as Address) || '0x0000000000000000000000000000000000000000',
    chainId: customBsc.id,
  },
  sepolia: {
    // Redeployed 2026-08-04 (feeWallet-DoS fix, rescue functions, to!=0 check).
    feeRouter: (process.env.NEXT_PUBLIC_ETH_FEE_ROUTER_ADDRESS as Address) || '0x5d02b756d416231fe71188e2F73C54446140bb56',
    chainId: customSepolia.id,
  },
  arbitrumSepolia: {
    // Redeployed 2026-08-04 (feeWallet-DoS fix, rescue functions, to!=0 check).
    feeRouter: (process.env.NEXT_PUBLIC_ARB_FEE_ROUTER_ADDRESS as Address) || '0x43aB86B6461297BF95Fbc7bd84Ab61d98F13969A',
    chainId: customArbitrumSepolia.id,
  },
  // Not deployed yet — Arbitrum only has a testnet (mock-DEX) deployment so far.
  // See docs/deployments.md. Feed the real address in via env once it's live.
  arbitrumOne: {
    feeRouter: (process.env.NEXT_PUBLIC_ARB_MAINNET_FEE_ROUTER_ADDRESS as Address) || '0x0000000000000000000000000000000000000000',
    chainId: customArbitrumOne.id,
  },
} as const;

export function getFeeRouterAddress(chainId: number): Address | undefined {
  if (chainId === contracts.bscTestnet.chainId) return contracts.bscTestnet.feeRouter;
  if (chainId === contracts.bscMainnet.chainId) return contracts.bscMainnet.feeRouter;
  if (chainId === contracts.sepolia.chainId) return contracts.sepolia.feeRouter;
  if (chainId === contracts.arbitrumSepolia.chainId) return contracts.arbitrumSepolia.feeRouter;
  if (chainId === contracts.arbitrumOne.chainId) return contracts.arbitrumOne.feeRouter;
  return undefined;
}

