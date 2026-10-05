import { customBscTestnet, customBsc, customSepolia, customMainnet, customArbitrumSepolia, customArbitrumOne } from './chains';
import { Address } from 'viem';

export const contracts = {
  bscTestnet: {
    // Redeployed 2026-08-05 (per-wallet pending fees, withdrawal recipient
    // param, trySafeTransfer). See docs/deployments.md.
    feeRouter: (process.env.NEXT_PUBLIC_BSC_FEE_ROUTER_ADDRESS as Address) || '0x6D303DCA98459736c00FfF0507ddA414CbBF0792',
    chainId: customBscTestnet.id,
  },
  // Deployed 2026-08-22, source-verified on BscScan. Owner/fee-wallet
  // confirmed live via on-chain reads 2026-08-23 — see docs/deployments.md.
  bscMainnet: {
    feeRouter: (process.env.NEXT_PUBLIC_BSC_MAINNET_FEE_ROUTER_ADDRESS as Address) || '0xBd018b76A06C51f000EB3DB6a1861384643D5E16',
    chainId: customBsc.id,
  },
  sepolia: {
    // Redeployed 2026-08-05 (per-wallet pending fees, withdrawal recipient
    // param, trySafeTransfer). See docs/deployments.md.
    feeRouter: (process.env.NEXT_PUBLIC_ETH_FEE_ROUTER_ADDRESS as Address) || '0xF27443aAdBaE8611Db6d4164ac4560eF73fa6b64',
    chainId: customSepolia.id,
  },
  // Deployed 2026-08-22 via Remix (not the deploy script), source-verified
  // on Etherscan. Owner/fee-wallet/router confirmed live via on-chain reads
  // 2026-08-23 — see docs/deployments.md.
  mainnet: {
    feeRouter: (process.env.NEXT_PUBLIC_ETH_MAINNET_FEE_ROUTER_ADDRESS as Address) || '0x0766dEf109f1a78B2a13b0Bbc8f3E4c9E477fF09',
    chainId: customMainnet.id,
  },
  arbitrumSepolia: {
    // Redeployed 2026-08-05 (per-wallet pending fees, withdrawal recipient
    // param, trySafeTransfer). See docs/deployments.md.
    feeRouter: (process.env.NEXT_PUBLIC_ARB_FEE_ROUTER_ADDRESS as Address) || '0x327d2Dc9977eD987E2EB8658EfE823d71C65e614',
    chainId: customArbitrumSepolia.id,
  },
  // Deployed 2026-08-22, source-verified on Arbiscan. Owner/fee-wallet
  // confirmed live via on-chain reads 2026-08-23 — see docs/deployments.md.
  arbitrumOne: {
    feeRouter: (process.env.NEXT_PUBLIC_ARB_MAINNET_FEE_ROUTER_ADDRESS as Address) || '0xFBa5A8fCb59b97C6bc398C1e8D7cE191ee0a3B11',
    chainId: customArbitrumOne.id,
  },
} as const;

export function getFeeRouterAddress(chainId: number): Address | undefined {
  if (chainId === contracts.bscTestnet.chainId) return contracts.bscTestnet.feeRouter;
  if (chainId === contracts.bscMainnet.chainId) return contracts.bscMainnet.feeRouter;
  if (chainId === contracts.sepolia.chainId) return contracts.sepolia.feeRouter;
  if (chainId === contracts.mainnet.chainId) return contracts.mainnet.feeRouter;
  if (chainId === contracts.arbitrumSepolia.chainId) return contracts.arbitrumSepolia.feeRouter;
  if (chainId === contracts.arbitrumOne.chainId) return contracts.arbitrumOne.feeRouter;
  return undefined;
}

