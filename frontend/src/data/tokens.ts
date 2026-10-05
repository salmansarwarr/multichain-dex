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
  /// Transfer tax in basis points (out of 10_000), set whenever
  /// isFeeOnTransfer is true. PancakeRouter's getAmountsOut (what the quote
  /// hook calls) has no concept of this tax, so a raw quote overstates the
  /// amount actually received/forwarded whenever this token sits at an
  /// endpoint of the swap path — see useEvmQuote's tokenInTaxBps/
  /// tokenOutTaxBps params, which correct for it.
  transferTaxBps?: number;
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
  },
  {
    // Verified two ways before adding (same bar as the mainnet list below):
    // on-chain name()/symbol()/decimals() call confirms "Tether USD" / USDT
    // / 18 decimals, AND factory.getPair(WBNB, this) against our actual
    // deployed PancakeSwap-testnet router (0xD99D1c33...) returns a real
    // pair with non-zero reserves — a swap against this router will
    // actually succeed, unlike the Arbitrum Sepolia addresses this
    // replaced a mismatch for earlier.
    address: '0x66E972502A34A625828C544a1914E8D8cc2A9dE5',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661',
  },
  {
    // Same verification: on-chain symbol()/decimals() confirmed, plus a
    // real non-zero-reserve pair against WBNB on our deployed router.
    address: '0x64544969ed7ebf5f083679233325356ebe738930',
    symbol: 'USDC',
    name: 'USDC Token',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602',
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
//
// KITE, APE, and COW were removed from this list on 2026-09-28 after a
// client report of wildly wrong quotes for them, on the assumption they
// had no real PancakeSwap liquidity at all — true for V2 (factory.getPair()
// returns the zero address for every candidate against WBNB or our known
// stablecoin/CAKE intermediates), but wrong for V3: the client pushed back,
// correctly, that KITE and APE really are swappable on PancakeSwap. A
// follow-up check found APE has substantial real V3 liquidity directly
// against WBNB, and KITE has real V3 liquidity against USDT — this app
// just wasn't looking at V3 yet. Both are restored here as of 2026-09-29,
// alongside FeeRouter.sol's new V3 swap support (see that file's header
// comment) and useEvmQuote.ts's matching V3 quoting path.
//
// The V3-capable FeeRouter went live on BSC mainnet 2026-09-29 at
// 0x5DFdFe850C613cf043c5e016b9B5A0a0415F5807 (see deployments/bsc-mainnet.json
// and docs/deployments.md) — useEvmQuote.ts's V3 quoting reads that
// contract's own v3Router() to confirm support before using it, so this
// was (and remains) safe regardless of deployment timing.
//
// COW: initially also concluded dead on BSC — wrong. A client push-back
// (2026-09-29, same day) turned out to be right: COW has a real, active
// ~$60k PancakeSwap V2 pool, just not against any of WBNB/USDT/USDC/BUSD/
// CAKE, the intermediates checked at the time. It trades against ETH
// (Binance-Peg Ethereum Token) instead — common on BSC for an
// Ethereum-native token like COW Protocol. 'ETH' is now in
// SwapCard.tsx's intermediateTokens list specifically because of this, so
// this is restored and working via that route. See that file's comment
// for the fuller account, including the re-check that no other BSC token
// was hiding the same gap.
//
// DEXE (0x6e88056e8376ae7709496ba64d37fa2f8015ce3e) removed again the same
// day, for a different and more serious reason than the original "no
// liquidity" removal: it DOES quote here — a PancakeSwap V3 pool (0.01%
// tier, ~$38k reserve) against USDT gives a clean quote with no warning —
// but that pool is stale and unarbitraged (zero 24h volume) and prices
// DEXE at roughly 7x its real market rate. DEXE's actual liquidity/price
// discovery has moved to Uniswap V4 and PancakeSwap's newer "Infinity"
// AMM (confirmed via GeckoTerminal and PancakeSwap's own UI), neither of
// which useEvmQuote.ts checks. This is NOT caught by the existing
// price-impact/insufficient-liquidity checks: those compare a trade's
// outcome against that *same* pool's own reserves, which can never detect
// "this pool's own price is wrong relative to the wider market" — only
// "this trade is large relative to this pool." A quiet wrong price with
// no warning is worse than no route at all, so removed rather than left
// live. Restoring this needs either Uniswap V4 / PancakeSwap Infinity
// support, or a genuine external reference-price check — a real gap
// worth fixing deliberately, not a quick patch.
//
// 2026-09-30: useEvmQuote.ts gained V3 multi-hop quoting (through the same
// known-liquid intermediates as V2's route-shopping), after a client
// report that PENGU quoted ~85x off — its only deep PancakeSwap V3 pool is
// PENGU/USDT, not PENGU/WBNB directly, and this app previously only tried
// direct V3 pairs. That fix also corrected USDE, M/MemeCore, XTZ, and ONT
// (all had the same shape of gap: real liquidity behind a stablecoin V3
// pool this app wasn't checking) without any code changes specific to
// them. KITE was re-checked the same way and is NOT fixed by it: its only
// deep pool (~$1.6M) is on PancakeSwap's newer "Infinity" CLMM, not
// classic V2 or V3 — every classic-venue pool for KITE has under $30 of
// real liquidity. Same underlying problem as DEXE above (liquidity moved
// to a venue this app doesn't integrate at all), so removed again for the
// same reason, one day after being restored above on the (in hindsight,
// likely mistaken — possibly an Infinity pool momentarily misread as V3)
// claim that it had real V3 liquidity.
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
    transferTaxBps: 600,
    logoURI: '/alfat-terra-logo.png',
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
  },
  {
    // Circle's own official Sepolia testnet USDC (faucet.circle.com).
    // Verified two ways: on-chain symbol()/decimals() confirms USDC / 6
    // decimals, AND factory.getPair(WETH, this) against our actually
    // deployed Uniswap V2 router/factory (0xC532a742...) returns a real
    // pair with non-zero reserves on both sides.
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602',
  },
  {
    // No official Sepolia USDT had existing WETH liquidity against our
    // deployed router (checked on-chain via factory.getPair against
    // several known faucet USDT tokens — none had a pool). Deployed our
    // own mock and seeded a genuine WETH/tUSDT pair via addLiquidityETH on
    // the real Uniswap V2 router 2026-08-04 (deploy-sepolia-mock-usdt.ts)
    // — this is a real AMM pool with real constant-product pricing, not a
    // decimal-naive mock like Arbitrum Sepolia's fixture. Quote-verified:
    // 0.001 WETH -> ~906.6 tUSDT via getAmountsOut before wiring in here.
    address: '0x2D87204F285a897cEe2B3498d6AdD24f27EB4aFD',
    symbol: 'tUSDT',
    name: 'Test Tether USD',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661',
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
  },
  {
    // Deployed + seeded 2026-08-04 (deploy-arbitrum-sepolia-tusdt.ts) into
    // the existing MockUniswapRouter, closing the last USDC/USDT gap here.
    // Note: MockUniswapRouter.sol prices everything at a flat 1e18 (i.e.
    // "1 raw unit in = 1 raw unit out"), with no awareness of decimals —
    // pre-existing behavior shared with tUSDC above, not something specific
    // to this token. That makes quoted amounts here look nonsensical
    // (e.g. huge/tiny) for anything but very small trade sizes — expected
    // on this mock fixture, not a real price and not present on any real
    // router (BSC Testnet, Sepolia, or mainnet all use genuine AMM pools).
    address: '0x2A2fe46305Fa7a4F72d73b7E18f36FFD7b37d914',
    symbol: 'tUSDT',
    name: 'Test Tether USD',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661',
  }
];


// Ethereum Mainnet — EthFeeRouter (V2 + V3) live at
// 0x0766dEf109f1a78B2a13b0Bbc8f3E4c9E477fF09 since 2026-10-04.
// Addresses/logos matched against the client's requested list via
// CoinGecko's top-500-by-market-cap + platforms database, decimals
// confirmed by an on-chain decimals() call — see conversation history.
//
// CAKE, RLUSD, MNT, ICP, MORPHO, ARB, BONK, KITE, SYRUP, EIGEN, CFG, and ZK
// were removed from this list (2026-09-28), after the BSC KITE/APE/COW
// incident prompted a full sweep of every token on every mainnet. Unlike
// the BSC cases, these aren't illiquid — I confirmed each has a real,
// active Uniswap V3 pool against WETH — but this app only routes through
// Uniswap V2 (see useEvmQuote.ts), and none of the twelve have a V2 pool
// at all, so every quote attempt for them fails outright with "no route
// found". Listing them just sends users into a dead end. They can come
// back once/if V2 routing here is extended to also check V3.
//
// 2026-10-04: Uniswap V3 routing added (EthFeeRouter.sol + useEvmQuote.ts).
// Every token was re-quoted at 0.1 ETH against GeckoTerminal's market price,
// using the same direct + via-USDC/USDT/DAI routes the app checks:
// - Restored MORPHO, ICP, ARB, MNT (also requested by the client) and
//   RLUSD, SYRUP, EIGEN — all within 1% through V3 at the time. CAKE (-23%), BONK
//   (-7.5%), CFG (-15%), ZK (-36%) and KITE (no pool) still aren't.
// - Removed POL, GALA, AXS, IMX, GLM, MANA, WLD, WLFI, FET (too little
//   liquidity on any venue to price within 1%), 1INCH, INJ, APE, STRK, CHZ,
//   PENGU (main liquidity on Uniswap V4, not supported yet), FLUID (Fluid
//   DEX), GNO (Balancer) and DEXE (PancakeSwap on Ethereum).
// - After the V3-capable EthFeeRouter went live (2026-10-04, 0x0766dEf1…fF09)
//   the app itself quoted all 42 tokens on mainnet; OKB, SYRUP, EIGEN, CRV
//   and NEXO came out 1.2–2.3% below market (fee included) on the best
//   available V2/V3 route, so they were removed too. ARB (client-requested,
//   ~1.4%) and GRT/COMP (~1.0–1.1%, over only by our 0.15% fee) were kept.
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
    address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776',
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
    address: '0xfe0c30065b384f05761f15d0cc899d4f9f9cc0eb',
    symbol: 'ETHFI',
    name: 'Ether.fi',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/35958/large/etherfi.jpeg?1710254562',
  },
  {
    address: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
    symbol: 'LDO',
    name: 'Lido DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13573/large/Lido_DAO.png?1696513326',
  },
  {
    address: '0x6985884c4392d348587b19cb9eaaf157f13271cd',
    symbol: 'ZRO',
    name: 'LayerZero',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28206/large/ftxG9_TJ_400x400.jpeg?1696527208',
  },
  {
    address: '0x808507121b80c02388fad14726482e061b8da827',
    symbol: 'PENDLE',
    name: 'Pendle',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728',
  },
  {
    address: '0xc669928185dbce49d2230cc9b0979be6dc797957',
    symbol: 'BTT',
    name: 'BitTorrent',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/22457/large/btt_logo.png?1696521780',
  },
  {
    address: '0x7420b4b9a0110cdc71fb720908340c03f9bc03ec',
    symbol: 'JASMY',
    name: 'JasmyCoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13876/large/JASMY200x200.jpg?1696513620',
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
    address: '0x3845badade8e6dff049820680d1f14bd3903a5d0',
    symbol: 'SAND',
    name: 'The Sandbox',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12129/large/sandbox_logo.jpg?1696511971',
  },
  {
    address: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
    symbol: 'BAT',
    name: 'Basic Attention',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/677/large/basic-attention-token.png?1696501867',
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
  {
    address: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
    symbol: 'MORPHO',
    name: 'Morpho',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29837/large/Morpho-token-icon.png?1726771230',
  },
  {
    // Internet Computer's chain-key ERC-20 (the address CoinGecko lists
    // for ICP on Ethereum), not one of the several unofficial "ICP"
    // look-alikes on Uniswap.
    address: '0x00f3C42833C3170159af4E92dbb451Fb3F708917',
    symbol: 'ICP',
    name: 'Internet Computer',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png?1696514180',
  },
  {
    address: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
    symbol: 'ARB',
    name: 'Arbitrum',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242',
  },
  {
    address: '0x3c3a81e81dc49A522A592e7622A7E711c06bf354',
    symbol: 'MNT',
    name: 'Mantle',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/30980/large/MNT_Token_Logo.png?1765516974',
  },
  {
    address: '0x8292bb45bf1ee4d140127049757c2e0ff06317ed',
    symbol: 'RLUSD',
    name: 'Ripple USD',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/39651/large/RLUSD_200x200_%281%29.png?1727376633',
  },
];

// Arbitrum One (mainnet) — not deployed yet (see contracts.arbitrumOne in
// config/contracts.ts, currently address(0)). Same sourcing method as
// ETH_MAINNET_TOKENS above.
//
// CAKE, MORPHO, ENA, CRV, GNO, APE, FLUID, and RSR were removed
// (2026-09-28) for the same reason as the twelve pulled from
// ETH_MAINNET_TOKENS above: each has real Uniswap V3 liquidity on
// Arbitrum but no V2 pool, and this app only routes through V2, so every
// quote attempt reverted with "no route found". See that comment for
// detail; same fix applies here.
// 2026-10-05: Arbitrum gets Uniswap V3 routing (same EthFeeRouter change as
// Ethereum). Re-quoted at 0.1 ETH vs GeckoTerminal's market price (our 0.15%
// fee included): V2-only, 15 of 16 tokens were 1.3% to 100% off; with V3,
// 13 are within ~1% (ZRO at 1.02%). Removed LDO (-1.3%), COMP (-12%) and
// BONK (-84%), which no V2/V3 route can price within 1%. Of the eight
// removed 2026-09-28 (above), only CRV (-0.2%) is now within 1% — restored.
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
    address: '0x6985884c4392d348587b19cb9eaaf157f13271cd',
    symbol: 'ZRO',
    name: 'LayerZero',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28206/large/ftxG9_TJ_400x400.jpeg?1696527208',
  },
  {
    address: '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8',
    symbol: 'PENDLE',
    name: 'Pendle',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png?1696514728',
  },
  {
    address: '0x9623063377ad1b27544c965ccd7342f7ea7e88c7',
    symbol: 'GRT',
    name: 'The Graph',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13397/large/Graph_Token.png?1696513159',
  },
  {
    address: '0xcb8b5cd20bdcaea9a010ac1f8d835824f5c87a04',
    symbol: 'COW',
    name: 'CoW Protocol',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png?1719524382',
  },
  {
    address: '0x11cdb42b0eb46d95f990bedd4695a6e3fa034978',
    symbol: 'CRV',
    name: 'Curve DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12124/large/Curve.png?1696511967',
  },
];
