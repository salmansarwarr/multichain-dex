export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isNative?: boolean;
  /// Charges a transfer tax (deflationary/reflection token, e.g. Alfat's
  /// 6%). Swaps involving this token must route through the contract's
  /// *SupportingFeeOnTransferTokens entry points instead of the plain ones.
  isFeeOnTransfer?: boolean;
}

export const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export const BSC_TESTNET_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'tBNB',
    name: 'Testnet BNB',
    decimals: 18,
    isNative: true,
  },
  {
    address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18,
  },
  {
    address: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
    symbol: 'BUSD',
    name: 'BUSD Token',
    decimals: 18,
  }
];

// BSC Mainnet — code-ready for when contracts/scripts/deploy-bsc-mainnet.ts
// is actually run (see contracts.bscMainnet in config/contracts.ts). WBNB
// address confirmed by reading WETH() directly off the live PancakeSwap
// Router (0x10ED43...024E) rather than assumed from memory.
export const BSC_MAINNET_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'BNB',
    name: 'BNB',
    decimals: 18,
    isNative: true,
  },
  {
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18,
  },
  {
    // Verified on-chain: name "Alphaterra", symbol "Alfat", 9 decimals,
    // ~1B total supply, verified source on BscScan. Charges a 6% transfer
    // tax — swaps route through the *SupportingFeeOnTransferTokens entry
    // points added to FeeRouter.sol specifically for this token.
    address: '0x834ee470ddb53b9337f07d909b10461c3035bb38',
    symbol: 'Alfat',
    name: 'Alphaterra',
    decimals: 9,
    isFeeOnTransfer: true,
  },
];

export const SEPOLIA_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
  },
  {
    address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  {
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
  }
];

export const ARBITRUM_SEPOLIA_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
  },
  {
    address: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  {
    address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  }
];

