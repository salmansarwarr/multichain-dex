export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isNative?: boolean;
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
