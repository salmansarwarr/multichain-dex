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

const TRUSTWALLET_ETH = (address: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`;

export const BSC_TESTNET_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'tBNB',
    name: 'Testnet BNB',
    decimals: 18,
    isNative: true,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  },
  {
    address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18,
    // Same branding as mainnet WBNB — testnets don't get their own logo asset.
    logoURI: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
  },
  {
    address: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
    symbol: 'BUSD',
    name: 'BUSD Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56.png',
  }
];

// BSC Mainnet — code-ready for when contracts/scripts/deploy-bsc-mainnet.ts
// is actually run (see contracts.bscMainnet in config/contracts.ts). WBNB
// address confirmed by reading WETH() directly off the live PancakeSwap
// Router (0x10ED43...024E) rather than assumed from memory.
//
// Non-WBNB/Alfat entries below (address + logoURI) were pulled directly
// from PancakeSwap's own published token list
// (https://tokens.pancakeswap.finance/pancakeswap-extended.json) rather
// than typed from memory, specifically to avoid hand-entering a wrong
// contract address for a real mainnet token.
export const BSC_MAINNET_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'BNB',
    name: 'BNB',
    decimals: 18,
    isNative: true,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  },
  {
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
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
    // TODO: no official logo asset supplied yet — add once the client
    // sends one (see limits.ts / conversation history).
  },
  {
    address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    symbol: 'CAKE',
    name: 'PancakeSwap Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82.png',
  },
  {
    address: '0x55d398326f99059fF775485246999027B3197955',
    symbol: 'USDT',
    name: 'Binance Pegged USDT',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x55d398326f99059fF775485246999027B3197955.png',
  },
  {
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    symbol: 'USDC',
    name: 'Binance Pegged USD Coin',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.png',
  },
  {
    address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    symbol: 'BUSD',
    name: 'Binance Pegged BUSD',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56.png',
  },
  {
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    symbol: 'BTCB',
    name: 'Binance Pegged Bitcoin',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c.png',
  },
  {
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    symbol: 'ETH',
    name: 'Binance Pegged ETH',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x2170Ed0880ac9A755fd29B2688956BD959F933F8.png',
  },
  {
    address: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
    symbol: 'DOT',
    name: 'Polkadot Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402.png',
  },
  {
    address: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',
    symbol: 'ADA',
    name: 'Cardano Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47.png',
  },
  {
    address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
    symbol: 'XRP',
    name: 'XRP Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE.png',
  },
  {
    address: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
    symbol: 'DOGE',
    name: 'Dogecoin',
    decimals: 8,
    logoURI: 'https://tokens.pancakeswap.finance/images/0xbA2aE424d960c26247Dd6c32edC70B295c744C43.png',
  },
  {
    address: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
    symbol: 'LINK',
    name: 'ChainLink Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD.png',
  },
  {
    address: '0x4338665CBB7B2485A8855A139b75D5e34AB0DB94',
    symbol: 'LTC',
    name: 'Litecoin Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x4338665CBB7B2485A8855A139b75D5e34AB0DB94.png',
  },
  {
    address: '0x4B0F1812e5Df2A09796481Ff14017e6005508003',
    symbol: 'TWT',
    name: 'Trust Wallet',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0x4B0F1812e5Df2A09796481Ff14017e6005508003.png',
  },
  {
    address: '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63',
    symbol: 'XVS',
    name: 'Venus Token',
    decimals: 18,
    logoURI: 'https://tokens.pancakeswap.finance/images/0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63.png',
  },
  // Below: matched against the client's 136-token request (see conversation
  // history) via CoinGecko's top-500-by-market-cap list (to avoid picking a
  // scam-clone contract sharing the same ticker) + its platforms/contract
  // database, with decimals confirmed by an on-chain decimals() call —
  // nothing here was typed from memory.
  {
    address: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d',
    symbol: 'USD1',
    name: 'USD1',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/54977/large/USD1_1000x1000_transparent.png?1749297002',
  },
  {
    address: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
    symbol: 'USDE',
    name: 'Ethena USDe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/33613/large/usde.png?1733810059',
  },
  {
    address: '0xbf5140a22578168fd562dccf235e5d43a02ce9b1',
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  },
  {
    address: '0x47474747477b199288bf72a1d702f7fe0fb1deea',
    symbol: 'WLFI',
    name: 'World Liberty Financial',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/50767/large/wlfi.png?1756438915',
  },
  {
    address: '0x000ae314e2a2172a039b26378814c252734f556a',
    symbol: 'ASTER',
    name: 'Aster',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/69040/large/_ASTER.png?1757326782',
  },
  {
    address: '0x22b1458e780f8fa71e2f84502cee8b5a3cc731fa',
    symbol: 'M',
    name: 'MemeCore',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/53247/large/square-bg-transparent.png?1752637478',
  },
  {
    address: '0xfb6115445bff7b52feb98650c87f44907e58f802',
    symbol: 'AAVE',
    name: 'Aave',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
  },
  {
    address: '0x25d887ce7a35172c62febfd67a1856f20faebb00',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  },
  {
    address: '0x0eb3a705fc54725037cc9e008bdede697f62f335',
    symbol: 'ATOM',
    name: 'Cosmos Hub',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png?1696502525',
  },
  {
    address: '0xa2b726b1145a4773f68593cf171187d8ebe4d495',
    symbol: 'INJ',
    name: 'Injective',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212',
  },
  {
    address: '0x6e88056e8376ae7709496ba64d37fa2f8015ce3e',
    symbol: 'DEXE',
    name: 'DeXe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12713/large/DEXE_token_logo.png?1696512514',
  },
  {
    address: '0x6418c0dd099a9fda397c766304cdd918233e8847',
    symbol: 'PENGU',
    name: 'Pudgy Penguins',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png?1733809110',
  },
  {
    address: '0xfe930c2d63aed9b82fc4dbc801920dd2c1a3224f',
    symbol: 'NIGHT',
    name: 'Midnight',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/71015/large/midnight.png?1765193080',
  },
  {
    address: '0x031b41e504677879370e9dbcf937283a8691fa7f',
    symbol: 'FET',
    name: 'Artificial Superintelligence Alliance',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/5681/large/ASI.png?1719827289',
  },
  {
    address: '0x6985884c4392d348587b19cb9eaaf157f13271cd',
    symbol: 'ZRO',
    name: 'LayerZero',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28206/large/ftxG9_TJ_400x400.jpeg?1696527208',
  },
  {
    address: '0xb3ed0a426155b79b898849803e3b36552f7ed507',
    symbol: 'PENDLE',
    name: 'Pendle',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728',
  },
  {
    address: '0xa697e272a73744b343528c3bc4702f2565b2f422',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28600/large/bonk.jpg?1696527587',
  },
  {
    address: '0x352cb5e19b12fc216548a2677bd0fce83bae434b',
    symbol: 'BTT',
    name: 'BitTorrent',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/22457/large/btt_logo.png?1696521780',
  },
  {
    address: '0x904567252d8f48555b7447c67dca23f0372e16be',
    symbol: 'KITE',
    name: 'Kite',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/70426/large/KITE-ICON.png?1762328605',
  },
  {
    address: '0x8b194370825e37b33373e74a41009161808c1488',
    symbol: 'VELVET',
    name: 'Velvet',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/67194/large/velvet.jpg?1752054592',
  },
  {
    address: '0x52ce071bd9b1c4b00a0b92d298c512478cad67e8',
    symbol: 'COMP',
    name: 'Compound',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/10775/large/COMP.png?1696510737',
  },
  {
    address: '0x715d400f88c167884bbcc41c5fea407ed4d2f8a0',
    symbol: 'AXS',
    name: 'Axie Infinity',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13029/large/axie_infinity_logo.png?1696512817',
  },
  {
    address: '0x8f86a15ec17cb3369d8b3e666dadbc11daa82b79',
    symbol: 'APE',
    name: 'ApeCoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24383/large/APECOIN.png?1756551529',
  },
  {
    address: '0x111111111117dc0aa78b770fa6a738034120c302',
    symbol: '1INCH',
    name: '1INCH',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13469/large/1inch-logo.jpeg?1759404663',
  },
  {
    address: '0x5bfdaa3f7c28b9994b56135403bf1acea02595b0',
    symbol: 'COW',
    name: 'CoW Protocol',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png?1719524382',
  },
  {
    address: '0x62d0a8458ed7719fdaf978fe5929c6d342b0bfce',
    symbol: 'BEAM',
    name: 'Beam',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/32417/large/cgicon.png?1747892021',
  },
  // Below: "Binance-Peg" wrapped/custodied BEP-20 versions of coins that are
  // natively on their own chain (client request — a licensed/custodian
  // version carries bridging risk, unlike the native coin itself). Each was
  // confirmed two ways before being added: (1) the coin's dedicated
  // `binance-peg-*` id on CoinGecko (Binance-Peg tokens are NOT listed under
  // the native coin's own `platforms` field — they're separate CoinGecko
  // entries), cross-checked against (2) a verified, name/symbol-matching
  // contract on BscScan. Candidates without a matching pair on both sources
  // were left out rather than guessed — see PR discussion for the excluded
  // list (e.g. no official Binance-Peg version exists for Monero, Tron,
  // Toncoin, ICP, Hedera, Aptos, Sui, VeChain, Algorand, Stellar, Ethereum
  // Classic, Kaspa, Sei, Celestia, THORChain, Mina, Flow, MultiversX, Dash,
  // Kusama, Waves, or Qtum as of this writing).
  {
    address: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF',
    symbol: 'SOL',
    name: 'Binance-Peg Solana',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/54582/large/wsol.png?1740542147',
  },
  {
    address: '0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf',
    symbol: 'BCH',
    name: 'Binance-Peg Bitcoin Cash',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15774/large/bitcoin-cash-circle.png?1696515398',
  },
  {
    address: '0x1Fa4a73a3F0133f0025378af00236f3aBDEE5D63',
    symbol: 'NEAR',
    name: 'Binance-Peg NEAR Protocol',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/51252/large/NEAR.JPG?1730470269',
  },
  {
    address: '0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153',
    symbol: 'FIL',
    name: 'Binance-Peg Filecoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15776/large/filecoin.png?1696515400',
  },
  {
    address: '0x56b6fB708fC5732DEC1Afc8D8556423A2EDcCbD6',
    symbol: 'EOS',
    name: 'Binance-Peg EOS',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15771/large/eos-eos-logo.png?1696515395',
  },
  {
    address: '0x16939ef78684453bfDFb47825F8a5F714f12623a',
    symbol: 'XTZ',
    name: 'Binance-Peg Tezos',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/51251/large/TEZOS.png?1730470163',
  },
  {
    address: '0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb',
    symbol: 'ZEC',
    name: 'Binance-Peg Zcash',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/70075/large/zcash.png?1760512015',
  },
  // Found via CoinGecko's authoritative `binance-peg-tokens` category listing
  // (the complete, canonical set of every Binance-Peg token that exists —
  // used to double-check nothing above was missed and that no other native
  // L1 coin in this batch has an official peg).
  {
    address: '0x1CE0c2827e2eF14D5C4f29a091d735A204794041',
    symbol: 'AVAX',
    name: 'Binance-Peg Avalanche',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/18674/large/avax_logo_1.png?1696518143',
  },
  {
    address: '0xFd7B3A77848f1C2D67E05E54d78d174a0C850335',
    symbol: 'ONT',
    name: 'Binance-Peg Ontology',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/18559/large/ont.png?1696518037',
  },
  {
    address: '0x9678E42ceBEb63F23197D726B29b1CB20d0064E5',
    symbol: 'IOTX',
    name: 'Binance-Peg IoTeX',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15978/large/iotex-logo.png?1696515591',
  },
  {
    address: '0xd5d0322b6bAb6a762C79f8c81A0B674778E13aeD',
    symbol: 'FIRO',
    name: 'Binance-Peg Firo',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/20128/large/firocoingecko.png?1696519544',
  },
];

export const SEPOLIA_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    // Testnet WETH — reusing mainnet WETH's logo (same token, same branding).
    logoURI: TRUSTWALLET_ETH('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
  },
  {
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    logoURI: TRUSTWALLET_ETH('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'),
  }
];

// Arbitrum Sepolia has no confirmed live Uniswap-V2-compatible DEX (see
// docs/deployments.md), so deploy-arbitrum-sepolia.ts deploys its own mock
// router + mock tWETH/tUSDC and seeds the router with tUSDC liquidity.
// These addresses MUST match contracts/deployments/arbitrum-sepolia.json's
// `mocks` block exactly, or swaps here will revert (the token exists but
// has no liquidity in this router, or doesn't exist at all). They
// previously pointed at two unrelated addresses that were never part of
// this deployment — fixed here to match the deployment record.
//
// No tUSDT mock has been deployed/seeded yet, so USDT isn't listed for
// this network — see conversation history (2026-08-01) for the deploy step
// still needed to add it.
export const ARBITRUM_SEPOLIA_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    address: '0xBd018b76A06C51f000EB3DB6a1861384643D5E16',
    symbol: 'tWETH',
    name: 'Test Wrapped ETH',
    decimals: 18,
    logoURI: TRUSTWALLET_ETH('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
  },
  {
    address: '0x82f89bBD87c75F915736E5d346dD48f40d66c8e0',
    symbol: 'tUSDC',
    name: 'Test USD Coin',
    decimals: 6,
    logoURI: TRUSTWALLET_ETH('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  }
];


// Ethereum Mainnet — not deployed yet (see contracts.mainnet in
// config/contracts.ts, currently address(0)). Populated ahead of that so
// the token list is ready the moment the mainnet FeeRouter goes live.
// Addresses/logos matched against the client's requested list via
// CoinGecko's top-500-by-market-cap + platforms database, decimals
// confirmed by an on-chain decimals() call — see conversation history.
export const ETH_MAINNET_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    address: '0xb8c77482e45f1f44de1745f52c74426c631bdd52',
    symbol: 'BNB',
    name: 'BNB',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
  },
  {
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    symbol: 'USDT',
    name: 'Tether',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661',
  },
  {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602',
  },
  {
    address: '0x152649ea73beab28c5b49b26eb48f7ead6d4c898',
    symbol: 'CAKE',
    name: 'PancakeSwap',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12632/large/pancakeswap-cake-logo_%281%29.png?1696512440',
  },
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405',
  },
  {
    address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    symbol: 'DAI',
    name: 'Dai',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/9956/large/Badge_Dai.png?1696509996',
  },
  {
    address: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d',
    symbol: 'USD1',
    name: 'USD1',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/54977/large/USD1_1000x1000_transparent.png?1749297002',
  },
  {
    address: '0x4c9edd5852cd905f086c759e8383e09bff1e68b3',
    symbol: 'USDE',
    name: 'Ethena USDe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/33613/large/usde.png?1733810059',
  },
  {
    address: '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b',
    symbol: 'CRO',
    name: 'Cronos',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/7310/large/cro_token_logo.png?1696507599',
  },
  {
    address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
    symbol: 'SHIB',
    name: 'Shiba Inu',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/11939/large/shiba.png?1696511800',
  },
  {
    address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  },
  {
    address: '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3',
    symbol: 'ONDO',
    name: 'Ondo',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/26580/large/ONDO.png?1696525656',
  },
  {
    address: '0xda5e1988097297dcdc1f90d4dfe7909e847cbef6',
    symbol: 'WLFI',
    name: 'World Liberty Financial',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/50767/large/wlfi.png?1756438915',
  },
  {
    address: '0x75231f58b43240c9718dd58b4967c5114342a86c',
    symbol: 'OKB',
    name: 'OKB',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png?1696505053',
  },
  {
    address: '0x8292bb45bf1ee4d140127049757c2e0ff06317ed',
    symbol: 'RLUSD',
    name: 'Ripple USD',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/39651/large/RLUSD_200x200_%281%29.png?1727376633',
  },
  {
    address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    symbol: 'AAVE',
    name: 'Aave',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
  },
  {
    address: '0x56072c95faa701256059aa122697b133aded9279',
    symbol: 'SKY',
    name: 'Sky',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/39925/large/sky.jpg?1724827980',
  },
  {
    address: '0x3c3a81e81dc49a522a592e7622a7e711c06bf354',
    symbol: 'MNT',
    name: 'Mantle',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/30980/large/MNT_Token_Logo.png?1765516974',
  },
  {
    address: '0x163f8c2467924be0ae7b5347228cabf260318753',
    symbol: 'WLD',
    name: 'Worldcoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903',
  },
  {
    address: '0x00f3c42833c3170159af4e92dbb451fb3f708917',
    symbol: 'ICP',
    name: 'Internet Computer',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png?1696514180',
  },
  {
    address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  },
  {
    address: '0x58d97b57bb95320f9a05dc918aef65434969c2b2',
    symbol: 'MORPHO',
    name: 'Morpho',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29837/large/Morpho-token-icon.png?1726771230',
  },
  {
    address: '0x455e53cbb86018ac2b8092fdcd39d8444affc3f6',
    symbol: 'POL',
    name: 'POL (ex-MATIC)',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/32440/large/pol.png?1759114181',
  },
  {
    address: '0x57e114b691db790c35207b2e685d4a43181e6061',
    symbol: 'ENA',
    name: 'Ethena',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/36530/large/ethena.png?1711701436',
  },
  {
    address: '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24',
    symbol: 'RENDER',
    name: 'Render',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/11636/large/rndr.png?1696511529',
  },
  {
    address: '0x4a220e6096b25eadb88358cb44068a3248254675',
    symbol: 'QNT',
    name: 'Quant',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/3370/large/5ZOu7brX_400x400.jpg?1696504070',
  },
  {
    address: '0xb50721bcf8d664c30412cfbc6cf7a15145234ad1',
    symbol: 'ARB',
    name: 'Arbitrum',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  },
  {
    address: '0xe28b3b32b6c345a34ff64674606124dd5aceca30',
    symbol: 'INJ',
    name: 'Injective',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212',
  },
  {
    address: '0xb62132e35a6c13ee1ee0f84dc5d40bad8d815206',
    symbol: 'NEXO',
    name: 'NEXO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/3695/large/CG-nexo-token-200x200_2x.png?1730414360',
  },
  {
    address: '0xfe0c30065b384f05761f15d0cc899d4f9f9cc0eb',
    symbol: 'ETHFI',
    name: 'Ether.fi',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/35958/large/etherfi.jpeg?1710254562',
  },
  {
    address: '0xde4ee8057785a7e8e800db58f9784845a5c2cbd6',
    symbol: 'DEXE',
    name: 'DeXe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12713/large/DEXE_token_logo.png?1696512514',
  },
  {
    address: '0x6418c0dd099a9fda397c766304cdd918233e8847',
    symbol: 'PENGU',
    name: 'Pudgy Penguins',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png?1733809110',
  },
  {
    address: '0xaea46a60368a7bd060eec7df8cba43b7ef41ad85',
    symbol: 'FET',
    name: 'Artificial Superintelligence Alliance',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/5681/large/ASI.png?1719827289',
  },
  {
    address: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
    symbol: 'LDO',
    name: 'Lido DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13573/large/Lido_DAO.png?1696513326',
  },
  {
    address: '0xd533a949740bb3306d119cc777fa900ba034cd52',
    symbol: 'CRV',
    name: 'Curve DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12124/large/Curve.png?1696511967',
  },
  {
    address: '0x6985884c4392d348587b19cb9eaaf157f13271cd',
    symbol: 'ZRO',
    name: 'LayerZero',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28206/large/ftxG9_TJ_400x400.jpeg?1696527208',
  },
  {
    address: '0x6810e776880c02933d47db1b9fc05908e5386b96',
    symbol: 'GNO',
    name: 'Gnosis',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png?1696501854',
  },
  {
    address: '0x808507121b80c02388fad14726482e061b8da827',
    symbol: 'PENDLE',
    name: 'Pendle',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728',
  },
  {
    address: '0x1151cb3d861920e07a38e03eead12c32178567f6',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28600/large/bonk.jpg?1696527587',
  },
  {
    address: '0xc669928185dbce49d2230cc9b0979be6dc797957',
    symbol: 'BTT',
    name: 'BitTorrent',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/22457/large/btt_logo.png?1696521780',
  },
  {
    address: '0xf57e7e7c23978c3caec3c3548e3d615c346e79ff',
    symbol: 'IMX',
    name: 'Immutable',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/17233/large/immutableX-symbol-BLK-RGB.png?1696516787',
  },
  {
    address: '0x7420b4b9a0110cdc71fb720908340c03f9bc03ec',
    symbol: 'JASMY',
    name: 'JasmyCoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13876/large/JASMY200x200.jpg?1696513620',
  },
  {
    address: '0x904567252d8f48555b7447c67dca23f0372e16be',
    symbol: 'KITE',
    name: 'Kite',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/70426/large/KITE-ICON.png?1762328605',
  },
  {
    address: '0x643c4e15d7d62ad0abec4a9bd4b001aa3ef52d66',
    symbol: 'SYRUP',
    name: 'Maple Finance',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/51232/large/_syrup_token_logo.png?1747292046',
  },
  {
    address: '0xca14007eff0db1f8135f4c25b34de49ab0d42766',
    symbol: 'STRK',
    name: 'Starknet',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/26433/large/starknet.png?1696525507',
  },
  {
    address: '0xec53bf9167f50cdeb3ae105f56099aaab9061f83',
    symbol: 'EIGEN',
    name: 'EigenCloud (prev. EigenLayer)',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/37441/large/eigencloud.jpg?1751003565',
  },
  {
    address: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
    symbol: 'ENS',
    name: 'Ethereum Name Service',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/19785/large/ENS.jpg?1727872989',
  },
  {
    address: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
    symbol: 'GRT',
    name: 'The Graph',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13397/large/Graph_Token.png?1696513159',
  },
  {
    address: '0xc00e94cb662c3520282e6f5717214004a7f26888',
    symbol: 'COMP',
    name: 'Compound',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/10775/large/COMP.png?1696510737',
  },
  {
    address: '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b',
    symbol: 'AXS',
    name: 'Axie Infinity',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13029/large/axie_infinity_logo.png?1696512817',
  },
  {
    address: '0x3506424f91fd33084466f402d5d97f05f8e3b4af',
    symbol: 'CHZ',
    name: 'Chiliz',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/8834/large/CHZ_Token_updated.png?1696508986',
  },
  {
    address: '0x4d224452801aced8b2f0aebe155379bb5d594381',
    symbol: 'APE',
    name: 'ApeCoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24383/large/APECOIN.png?1756551529',
  },
  {
    address: '0x3845badade8e6dff049820680d1f14bd3903a5d0',
    symbol: 'SAND',
    name: 'The Sandbox',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12129/large/sandbox_logo.jpg?1696511971',
  },
  {
    address: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
    symbol: 'MANA',
    name: 'Decentraland',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/878/large/decentraland-mana.png?1696502010',
  },
  {
    address: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
    symbol: 'BAT',
    name: 'Basic Attention',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/677/large/basic-attention-token.png?1696501867',
  },
  {
    address: '0x111111111117dc0aa78b770fa6a738034120c302',
    symbol: '1INCH',
    name: '1INCH',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13469/large/1inch-logo.jpeg?1759404663',
  },
  {
    address: '0xcccccccccc33d538dbc2ee4feab0a7a1ff4e8a94',
    symbol: 'CFG',
    name: 'Centrifuge',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/55913/large/centrifuge.jpg?1747707741',
  },
  {
    address: '0xd1d2eb1b1e90b638588728b4130137d262c87cae',
    symbol: 'GALA',
    name: 'GALA',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12493/large/GALA_token_image_-_200PNG.png?1709725869',
  },
  {
    address: '0x7dd9c5cba05e151c895fde1cf355c9a1d5da6429',
    symbol: 'GLM',
    name: 'Golem',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/542/large/Golem_Submark_Positive_RGB.png?1696501761',
  },
  {
    address: '0x66a5cfb2e9c529f14fe6364ad1075df3a649c0a5',
    symbol: 'ZK',
    name: 'ZKsync',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/38043/large/ZKTokenBlack.png?1718614502',
  },
  {
    address: '0x6f40d4a6237c257fff2db00fa0510deeecd303eb',
    symbol: 'FLUID',
    name: 'Fluid',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14688/large/Frame_1686566116_%281%29_%281%29.png?1784708239',
  },
  {
    address: '0xdef1ca1fb7fbcdc777520aa7f396b4e015f497ab',
    symbol: 'COW',
    name: 'CoW Protocol',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png?1719524382',
  },
  {
    address: '0x320623b8e4ff03373931769a31fc52a4e78b5d70',
    symbol: 'RSR',
    name: 'Reserve Rights',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/8365/large/RSR_Blue_Circle_1000.png?1721777856',
  },
  {
    address: '0x62d0a8458ed7719fdaf978fe5929c6d342b0bfce',
    symbol: 'BEAM',
    name: 'Beam',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/32417/large/cgicon.png?1747892021',
  },
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    name: 'Synthetix',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/3406/large/SNX.png?1696504103',
  },
];

// Arbitrum One (mainnet) — not deployed yet (see contracts.arbitrumOne in
// config/contracts.ts, currently address(0)). Same sourcing method as
// ETH_MAINNET_TOKENS above.
export const ARBITRUM_MAINNET_TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602',
  },
  {
    // Verified on Arbiscan: this is the dominant/highest-liquidity USDT on
    // Arbitrum One (Tether's own token, bridged via the standard Arbitrum
    // bridge). Its on-chain name()/symbol() now read "USD₮0" / "USD₮0",
    // not "USDT" — Tether renamed it as part of its 2025 omnichain (LayerZero
    // OFT) rebrand. Listed here as USDT for user-facing familiarity since
    // that's the client's ask; the on-chain symbol will still show as
    // USD₮0 in wallets like MetaMask, which is expected and not a bug.
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    symbol: 'USDT',
    name: 'USD₮0 (Tether, Arbitrum)',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661',
  },
  {
    address: '0x1b896893dfc86bb67cf57767298b9073d2c1ba2c',
    symbol: 'CAKE',
    name: 'PancakeSwap',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12632/large/pancakeswap-cake-logo_%281%29.png?1696512440',
  },
  {
    address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405',
  },
  {
    address: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
    symbol: 'USDE',
    name: 'Ethena USDe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/33613/large/usde.png?1733810059',
  },
  {
    address: '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0',
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669',
  },
  {
    address: '0xba5ddd1f9d7f570dc94a51479a000e3bce967196',
    symbol: 'AAVE',
    name: 'Aave',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
  },
  {
    address: '0x25d887ce7a35172c62febfd67a1856f20faebb00',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
  },
  {
    address: '0x40bd670a58238e6e230c430bbb5ce6ec0d40df48',
    symbol: 'MORPHO',
    name: 'Morpho',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29837/large/Morpho-token-icon.png?1726771230',
  },
  {
    address: '0x58538e6a46e07434d7e7375bc268d3cb839c0133',
    symbol: 'ENA',
    name: 'Ethena',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/36530/large/ethena.png?1711701436',
  },
  {
    address: '0x912ce59144191c1204e64559fe8253a0e49e6548',
    symbol: 'ARB',
    name: 'Arbitrum',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  },
  {
    address: '0x7189fb5b6504bbff6a852b13b7b82a3c118fdc27',
    symbol: 'ETHFI',
    name: 'Ether.fi',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/35958/large/etherfi.jpeg?1710254562',
  },
  {
    address: '0x13ad51ed4f1b7e9dc168d8a00cb3f4ddd85efa60',
    symbol: 'LDO',
    name: 'Lido DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13573/large/Lido_DAO.png?1696513326',
  },
  {
    address: '0x11cdb42b0eb46d95f990bedd4695a6e3fa034978',
    symbol: 'CRV',
    name: 'Curve DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12124/large/Curve.png?1696511967',
  },
  {
    address: '0x6985884c4392d348587b19cb9eaaf157f13271cd',
    symbol: 'ZRO',
    name: 'LayerZero',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28206/large/ftxG9_TJ_400x400.jpeg?1696527208',
  },
  {
    address: '0xa0b862f60edef4452f25b4160f177db44deb6cf1',
    symbol: 'GNO',
    name: 'Gnosis',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png?1696501854',
  },
  {
    address: '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8',
    symbol: 'PENDLE',
    name: 'Pendle',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728',
  },
  {
    address: '0x09199d9a5f4448d0848e4395d065e1ad9c4a1f74',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28600/large/bonk.jpg?1696527587',
  },
  {
    address: '0x9623063377ad1b27544c965ccd7342f7ea7e88c7',
    symbol: 'GRT',
    name: 'The Graph',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13397/large/Graph_Token.png?1696513159',
  },
  {
    address: '0x354a6da3fcde098f8389cad84b0182725c6c91de',
    symbol: 'COMP',
    name: 'Compound',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/10775/large/COMP.png?1696510737',
  },
  {
    address: '0x7f9fbf9bdd3f4105c478b996b648fe6e828a1e98',
    symbol: 'APE',
    name: 'ApeCoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24383/large/APECOIN.png?1756551529',
  },
  {
    address: '0x61e030a56d33e8260fdd81f03b162a79fe3449cd',
    symbol: 'FLUID',
    name: 'Fluid',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14688/large/Frame_1686566116_%281%29_%281%29.png?1784708239',
  },
  {
    address: '0xcb8b5cd20bdcaea9a010ac1f8d835824f5c87a04',
    symbol: 'COW',
    name: 'CoW Protocol',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png?1719524382',
  },
  {
    address: '0xca5ca9083702c56b481d1eec86f1776fdbd2e594',
    symbol: 'RSR',
    name: 'Reserve Rights',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/8365/large/RSR_Blue_Circle_1000.png?1721777856',
  },
];
