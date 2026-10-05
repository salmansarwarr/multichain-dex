import { Address } from 'viem';
import { contracts } from './contracts';

/// Per-chain V3 quoting config. Both quoters are QuoterV2 deployments with
/// identical ABIs (PancakeSwap's V3 periphery is a fork of Uniswap's), each
/// cross-checked against Sourcify's verified record for its chain: BSC
/// (chain 56) on 2026-09-29, Ethereum (chain 1) on 2026-10-04.
///
/// Fee tiers are in hundredths of a basis point (500 = 0.05%, 10000 = 1%).
/// A token's real pool can sit at any of a chain's tiers, so useEvmQuote
/// tries every one and keeps the best output. PancakeSwap's middle tier is
/// 0.25% (2500); Uniswap's is 0.3% (3000).
type V3Config = { quoter: Address; feeTiers: readonly number[] };

const V3_CONFIG: Record<number, V3Config> = {
  [contracts.bscMainnet.chainId]: {
    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    feeTiers: [100, 500, 2500, 10000],
  },
  [contracts.mainnet.chainId]: {
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    feeTiers: [100, 500, 3000, 10000],
  },
};

export function getV3Config(chainId: number): V3Config | undefined {
  return V3_CONFIG[chainId];
}
