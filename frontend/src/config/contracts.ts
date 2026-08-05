import { customBscTestnet, customBsc, customSepolia, customArbitrumSepolia, customArbitrumOne } from './chains';
import { Address } from 'viem';

export const contracts = {
  bscTestnet: {
    // Redeployed 2026-08-05 (per-wallet pending fees, withdrawal recipient
    // param, trySafeTransfer). See docs/deployments.md.
    feeRouter: (process.env.NEXT_PUBLIC_BSC_FEE_ROUTER_ADDRESS as Address) || '0x6D303DCA98459736c00FfF0507ddA414CbBF0792',
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
    // Redeployed 2026-08-05 (per-wallet pending fees, withdrawal recipient
    // param, trySafeTransfer). See docs/deployments.md.
    feeRouter: (process.env.NEXT_PUBLIC_ETH_FEE_ROUTER_ADDRESS as Address) || '0xF27443aAdBaE8611Db6d4164ac4560eF73fa6b64',
    chainId: customSepolia.id,
  },
  arbitrumSepolia: {
    // Redeployed 2026-08-05 (per-wallet pending fees, withdrawal recipient
    // param, trySafeTransfer). See docs/deployments.md.
    feeRouter: (process.env.NEXT_PUBLIC_ARB_FEE_ROUTER_ADDRESS as Address) || '0x327d2Dc9977eD987E2EB8658EfE823d71C65e614',
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

