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
// 2026-10-12: removed BTT, ONT, PENDLE, ZRO, BONK, 1INCH, COMP and EOS.
// Each has too little on-chain liquidity on BSC to trade within 1% of
// market, on any route/exchange (confirmed via KyberSwap's full-market
// aggregation, not just our own routing) — flagged to the client after a
// BTT complaint, per the agreed 24h remediation plan.
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
    address: '0x8b194370825e37b33373e74a41009161808c1488',
    symbol: 'VELVET',
    name: 'Velvet',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/67194/large/velvet.jpg?1752054592',
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
  {
    // Restored 2026-10-07: its liquidity is on PancakeSwap Infinity, now
    // reachable through the DEX aggregator (-0.4% vs market at 0.1 BNB).
    address: '0x904567252d8f48555b7447c67dca23f0372e16be',
    symbol: 'KITE',
    name: 'Kite',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/70426/large/KITE-ICON.png?1762328605',
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
// - 2026-10-07: V3+aggregator EthFeeRouter live at 0x21a179A5…EC77, with DEX
//   aggregation (KyberSwap: Uniswap V4, Curve, Balancer, Fluid, ...). Every
//   CoinGecko top-500 token with an Ethereum address was quoted at 0.1 ETH
//   (fee included) vs CoinGecko's price: 102 were within 1%. Added 47
//   well-known ones, skipping obscure/RWA/tokenised-stock entries and those
//   within 0.1% of the limit (TRAC, XYO, RLC, AMP).
//   Then quoted all 84 live through the app: removed PENGU (main pool now on
//   Supernova, which the aggregator stopped routing — app blocked it),
//   BNB (-5.2%), JASMY (-2.2%), BTT (-2.0%), GLM (-1.9%), IMX (-1.6%) and
//   ID (-1.2%). CAKE, POL, FET, ALT, BIO, GRT and INJ measured 1.0-1.12%
//   below market that day; kept and flagged to the client.
// 2026-10-12: removed CAKE, POL, FET, ALT, BIO, GRT and INJ — each measured
// 1.0-1.12% from market in testing (just over the 1% bar), per the agreed
// remediation plan so every listed token tests within 1%.
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
    address: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
    symbol: 'ENS',
    name: 'Ethereum Name Service',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/19785/large/ENS.jpg?1727872989',
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
  {
    address: '0xda5e1988097297dcdc1f90d4dfe7909e847cbef6',
    symbol: 'WLFI',
    name: 'World Liberty Financial',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/50767/large/wlfi.png?1756438915',
  },
  {
    address: '0x163f8c2467924be0ae7b5347228cabf260318753',
    symbol: 'WLD',
    name: 'Worldcoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg?1696529903',
  },
  {
    address: '0xb62132e35a6c13ee1ee0f84dc5d40bad8d815206',
    symbol: 'NEXO',
    name: 'NEXO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/3695/large/CG-nexo-token-200x200_2x.png?1730414360',
  },
  {
    address: '0xd533a949740bb3306d119cc777fa900ba034cd52',
    symbol: 'CRV',
    name: 'Curve DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12124/large/Curve.png?1696511967',
  },
  {
    address: '0xca14007eff0db1f8135f4c25b34de49ab0d42766',
    symbol: 'STRK',
    name: 'Starknet',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/26433/large/starknet.png?1696525507',
  },
  {
    address: '0x118b70df4f06fa5678e7d543e6066e028c8ea0c0',
    symbol: 'KITE',
    name: 'Kite',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/70426/large/KITE-ICON.png?1762328605',
  },
  {
    address: '0x6810e776880c02933d47db1b9fc05908e5386b96',
    symbol: 'GNO',
    name: 'Gnosis',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png?1696501854',
  },
  {
    address: '0xec53bf9167f50cdeb3ae105f56099aaab9061f83',
    symbol: 'EIGEN',
    name: 'EigenCloud (prev. EigenLayer)',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/37441/large/eigencloud.jpg?1751003565',
  },
  {
    address: '0x6f40d4a6237c257fff2db00fa0510deeecd303eb',
    symbol: 'FLUID',
    name: 'Fluid',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14688/large/Frame_1686566116_%281%29_%281%29.png?1784708239',
  },
  {
    address: '0x4d224452801aced8b2f0aebe155379bb5d594381',
    symbol: 'APE',
    name: 'ApeCoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24383/large/APECOIN.png?1756551529',
  },
  {
    address: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
    symbol: 'SUSHI',
    name: 'Sushi',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12271/large/512x512_Logo_no_chop.png?1696512101',
  },
  {
    address: '0xde4ee8057785a7e8e800db58f9784845a5c2cbd6',
    symbol: 'DEXE',
    name: 'DeXe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12713/large/DEXE_token_logo.png?1696512514',
  },
  {
    address: '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',
    symbol: 'YFI',
    name: 'yearn.finance',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/11849/large/yearn.jpg?1696511720',
  },
  {
    address: '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b',
    symbol: 'CVX',
    name: 'Convex Finance',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/15585/large/convex.png?1696515221',
  },
  {
    address: '0xe41d2489571d322189246dafa5ebde1f4699f498',
    symbol: 'ZRX',
    name: '0x Protocol',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/863/large/0x.png?1696501996',
  },
  {
    address: '0x5afe3855358e112b5647b952709e6165e1c1eeee',
    symbol: 'SAFE',
    name: 'Safe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/27032/large/Artboard_1_copy_8circle-1.png?1696526084',
  },
  {
    address: '0xbe0ed4138121ecfc5c0e56b40517da27e6c5226b',
    symbol: 'ATH',
    name: 'Aethir',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/36179/large/logogram_circle_dark_green_vb_green_%281%29.png?1718232706',
  },
  {
    address: '0xb0ffa8000886e57f86dd5264b9582b2ad87b2b91',
    symbol: 'W',
    name: 'Wormhole',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/35087/large/W_Token_%283%29.png?1758122686',
  },
  {
    address: '0x626e8036deb333b408be468f951bdb42433cbf18',
    symbol: 'AIOZ',
    name: 'AIOZ Network',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14631/large/aioz-logo-200.png?1696514309',
  },
  {
    address: '0x1776e1f26f98b1a5df9cd347953a26dd3cb46671',
    symbol: 'NMR',
    name: 'Numeraire',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/752/large/numeraire.png?1696501906',
  },
  {
    address: '0x64aa3364f17a4d01c6f1751fd97c2bd3d7e7f1d5',
    symbol: 'OHM',
    name: 'Olympus',
    decimals: 9,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14483/large/token_OHM_%281%29.png?1696514169',
  },
  {
    address: '0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c',
    symbol: 'SPX',
    name: 'SPX6900',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/31401/large/centeredcoin_%281%29.png?1737048493',
  },
  {
    address: '0xcdf7028ceab81fa0c6971208e83fa7872994bee5',
    symbol: 'T',
    name: 'Threshold Network',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/22228/large/nFPNiSbL_400x400.jpg?1696521570',
  },
  {
    address: '0x6033f7f88332b8db6ad452b7c6d5bb643990ae3f',
    symbol: 'LSK',
    name: 'Lisk',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/385/large/LSK-logo.png?1788508326',
  },
  {
    address: '0xf8173a39c56a554837c4c7f104153a005d284d11',
    symbol: 'EDU',
    name: 'Open Campus',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/29948/large/EDU_Logo.png?1696528874',
  },
  {
    address: '0x68749665ff8d2d112fa859aa293f07a622782f38',
    symbol: 'XAUt',
    name: 'Tether Gold',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/10481/large/logo.png?1774627372',
  },
  {
    address: '0x45804880de22913dafe09f4980848ece6ecbaf78',
    symbol: 'PAXG',
    name: 'PAX Gold',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/9519/large/asset-paxg.png?1785284785',
  },
  {
    address: '0xdc035d45d973e3ec169d2276ddab16f1e407384f',
    symbol: 'USDS',
    name: 'USDS',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/39926/large/usds.webp?1726666683',
  },
  {
    address: '0xe343167631d89b6ffc58b88d6b7fb0228795491d',
    symbol: 'USDG',
    name: 'Global Dollar',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png?1730484111',
  },
  {
    address: '0x6c3ea9036406852006290770bedfcaba0e23a0e8',
    symbol: 'PYUSD',
    name: 'PayPal USD',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/31212/large/PYUSD_Token_Logo_2x.png?1765987788',
  },
  {
    address: '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f',
    symbol: 'GHO',
    name: 'GHO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/30663/large/gho-token-logo.png?1720517092',
  },
  {
    address: '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e',
    symbol: 'crvUSD',
    name: 'crvUSD',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/30118/large/crvusd.jpg?1746670973',
  },
  {
    address: '0x853d955acef822db058eb8505911ed77f175b99e',
    symbol: 'FRAX',
    name: 'Legacy Frax Dollar',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13422/large/LFRAX.png?1751911193',
  },
  {
    address: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c',
    symbol: 'EURC',
    name: 'EURC',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/26045/large/EURC.png?1769615705',
  },
  {
    address: '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409',
    symbol: 'FDUSD',
    name: 'First Digital USD',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/31079/large/FDUSD_icon_black.png?1731097953',
  },
  {
    address: '0x0000000000085d4780b73119b644ae5ecd22b376',
    symbol: 'TUSD',
    name: 'TrueUSD',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/3449/large/tusd.png?1696504140',
  },
  {
    address: '0x54d2252757e1672eead234d27b1270728ff90581',
    symbol: 'BGB',
    name: 'Bitget Token',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/11610/large/Bitget_logo.png?1736925727',
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
// 2026-10-06: client asked for 30 more. Official Arbitrum addresses from
// CoinGecko; quoted at 0.1 ETH through the app's V2/V3 routes. Added WBTC
// (-0.2%), LPT (-0.3/-0.75%) and LDO back (-0.3/-0.9% today; it was -1.3%
// on 2026-10-05, so borderline). SOL, MATIC/POL, OP, ICP, ENS, IMX, SNX and
// ARKM have no official Arbitrum token. The rest are 3-100% off or have no
// Uniswap pool: CAKE/SUSHI live on SushiSwap V3, FLUID on Fluid DEX,
// WOO/POND/ENA/COMP mostly on Uniswap V4, RSR on Curve; XVS, ANKR, TRB,
// MLN, RPL, 1INCH, DODO, LRC, AXL, APE have under ~$100k anywhere.
// 2026-10-07: DEX aggregation (KyberSwap via swapViaAggregatorWithFee,
// FeeRouter 0xF0EDEfbd…6921) reaches Uniswap V4, Camelot, Curve, Fluid,
// PancakeSwap, Balancer and more. Re-quoted the client's 30 plus every
// CoinGecko top-500 token with an Arbitrum address, at 0.1 ETH (fee
// included) vs CoinGecko's market price; added the 24 new ones within 1%.
// Still out (1.1-100% off, or no route): XVS, ANKR, TRB, MLN, RSR, SUSHI,
// FLUID, COMP, RPL, ENA, POND, 1INCH, DODO, LRC, AXL, ENS, SNX, IMX, MATIC,
// GNS, RDNT, SPELL, JOE, YFI, W, BONK, GNO and others. Newer stablecoins/RWA
// tokens that also passed (USDai, reUSD, THBILL, ...) were left out pending
// review.
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
  {
    // Arbitrum's canonical-bridge WBTC (CoinGecko: arbitrum-bridged-wbtc-arbitrum-one).
    address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/7598/large/WBTCLOGO.png?1764496367',
  },
  {
    address: '0x289ba1701C2F088cf0faf8B3705246331cB8A839',
    symbol: 'LPT',
    name: 'Livepeer',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/7137/large/badge-logo-circuit-green.png?1719357686',
  },
  {
    address: '0x13ad51ed4f1b7e9dc168d8a00cb3f4ddd85efa60',
    symbol: 'LDO',
    name: 'Lido DAO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13573/large/Lido_DAO.png?1696513326',
  },
  {
    address: '0xcafcd85d8ca7ad1e1c6f82f651fa15e33aefd07b',
    symbol: 'WOO',
    name: 'WOO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12921/large/WOO_Logos_2023_Profile_Pic_WOO.png?1696512709',
  },
  {
    address: '0x7f9fbf9bdd3f4105c478b996b648fe6e828a1e98',
    symbol: 'APE',
    name: 'ApeCoin',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24383/large/APECOIN.png?1756551529',
  },
  {
    address: '0x1b896893dfc86bb67cf57767298b9073d2c1ba2c',
    symbol: 'CAKE',
    name: 'PancakeSwap',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/12632/large/pancakeswap-cake-logo_%281%29.png?1696512440',
  },
  {
    address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped BTC',
    decimals: 8,
    logoURI: 'https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp?1726136727',
  },
  {
    address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
    symbol: 'tBTC',
    name: 'tBTC',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/11224/large/0x18084fba666a33d37592fa2633fd49a74dd93a88.png?1696511155',
  },
  {
    address: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a',
    symbol: 'GMX',
    name: 'GMX',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png?1696517814',
  },
  {
    address: '0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8',
    symbol: 'rETH',
    name: 'Rocket Pool ETH',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/20764/large/reth.png?1696520159',
  },
  {
    address: '0x539bde0d7dbd336b79148aa742883198bbf60342',
    symbol: 'MAGIC',
    name: 'Treasure',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/18623/large/magic.png?1696518095',
  },
  {
    address: '0x17fc002b466eec40dae837fc4be5c67993ddbd6f',
    symbol: 'FRAX',
    name: 'Legacy Frax Dollar',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/13422/large/LFRAX.png?1751911193',
  },
  {
    address: '0x2416092f143378750bb29b79ed961ab195cceea5',
    symbol: 'ezETH',
    name: 'Renzo Restaked ETH',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/34753/large/Ezeth_logo_circle.png?1713496404',
  },
  {
    address: '0x4186bfc76e2e237523cbc30fd220fe055156b41f',
    symbol: 'rsETH',
    name: 'Kelp DAO Restaked ETH',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/33800/large/Icon___Dark.png?1702991855',
  },
  {
    address: '0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2',
    symbol: 'sUSDe',
    name: 'Ethena Staked USDe',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/33669/large/sUSDe-Symbol-Color.png?1716307680',
  },
  {
    address: '0x498bf2b1e120fed3ad3d42ea2165e9b73f99c1e5',
    symbol: 'crvUSD',
    name: 'crvUSD',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/30118/large/crvusd.jpg?1746670973',
  },
  {
    address: '0x3d9907f9a368ad0a51be60f7da3b97cf940982d8',
    symbol: 'GRAIL',
    name: 'Camelot Token',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/28416/large/vj5DIMhP_400x400.jpeg?1696527414',
  },
  {
    address: '0x6694340fc020c5e6b96567843da2df01b2ce1eb6',
    symbol: 'STG',
    name: 'Stargate Finance',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/24413/large/STG_LOGO.png?1696523595',
  },
  {
    address: '0x5979D7b546E38E414F7E9822514be443A4800529',
    symbol: 'wstETH',
    name: 'Wrapped stETH',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png?1696518295',
  },
  {
    address: '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe',
    symbol: 'weETH',
    name: 'Wrapped eETH',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/33033/large/weETH.png?1701438396',
  },
  {
    address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    symbol: 'DAI',
    name: 'Dai',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/9956/large/Badge_Dai.png?1696509996',
  },
  {
    address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    symbol: 'USDC.e',
    name: 'Bridged USDC (USDC.e)',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602',
  },
  {
    address: '0x46850ad61c2b7d64d08c9c754f45254596696984',
    symbol: 'PYUSD',
    name: 'PayPal USD',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/31212/large/PYUSD_Token_Logo_2x.png?1765987788',
  },
  {
    address: '0x004b506865409877c9fa29bfb1eba929984b9bbc',
    symbol: 'USDG',
    name: 'Global Dollar',
    decimals: 6,
    logoURI: 'https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png?1730484111',
  },
  {
    address: '0x7dff72693f6a4149b17e7c6314655f6a9f7c8b33',
    symbol: 'GHO',
    name: 'GHO',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/30663/large/gho-token-logo.png?1720517092',
  },
  {
    address: '0xc87b37a581ec3257b734886d9d3a581f5a9d056c',
    symbol: 'ATH',
    name: 'Aethir',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/36179/large/logogram_circle_dark_green_vb_green_%281%29.png?1718232706',
  },
  {
    address: '0x6a7661795c374c0bfc635934efaddff3a7ee23b6',
    symbol: 'DOLA',
    name: 'DOLA',
    decimals: 18,
    logoURI: 'https://coin-images.coingecko.com/coins/images/14287/large/dola.png?1696513984',
  },
];
