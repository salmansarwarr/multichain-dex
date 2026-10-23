import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { Address, encodePacked } from 'viem';
import { V2RouterABI } from '../abis/V2Router';
import { V2FactoryABI, V2PairABI } from '../abis/V2FactoryPair';
import { FeeRouterABI } from '../abis/FeeRouter';
import { EthFeeRouterABI } from '../abis/EthFeeRouter';
import { PancakeV3QuoterABI } from '../abis/PancakeV3Quoter';
import { NATIVE_TOKEN_ADDRESS } from '../data/tokens';
import { getFeeRouterAddress, contracts } from '../config/contracts';
import { getMinNativeReserveWei } from '../config/liquidity';
import { getV3Config } from '../config/v3';
import { getAggregatorChain, fetchKyberRoute, KYBERSWAP_ROUTER, KYBERSWAP_NATIVE, KyberRouteSummary } from '../config/aggregator';
import { withRpcRetry } from './rpcRetry';

// Quote reads are single quick calls, not a chunked scan, so a couple of
// retries is enough to absorb a transient CU/s throttle without piling on.
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;

export type AggregatorRoute = {
  routeSummary: KyberRouteSummary;
  tokenIn: Address;
  tokenOut: Address;
};

export function useEvmQuote(
  chainId: number | undefined,
  tokenIn: string | undefined,
  tokenOut: string | undefined,
  amountIn: bigint | undefined,
  // Known-liquid tokens (e.g. BSC mainnet USDT, CAKE) to also try routing
  // through as a 2-hop intermediate, alongside the direct path. Some tokens
  // have a nearly-empty (or entirely nonexistent-liquidity) direct WBNB
  // pool but real liquidity against one of these, so a candidate path
  // through one can quote a far better rate than the direct one — e.g.
  // Alfat's direct WBNB pool has zero reserves and reverts outright, but
  // its CAKE pool is real and liquid.
  intermediateTokens: string[] | undefined,
  // Basis points of transfer tax on tokenIn/tokenOut (Token.transferTaxBps
  // — 0/undefined for a normal, non fee-on-transfer token). Needed because
  // getAmountsOut below is a pure pool-math view call with no idea a token
  // taxes transfers, so left uncorrected it overstates the real output by
  // however much tax applies — which then lets `amountOutMin` (derived from
  // this quote) sit above what the pool can actually deliver, so the swap
  // reverts with PancakeRouter's own INSUFFICIENT_OUTPUT_AMOUNT check.
  // tokenIn's tax hits TWICE when routed through FeeRouter (once on
  // user -> FeeRouter, again on FeeRouter -> pool — see
  // FeeRouter.sol's _pullAndSkimFee); tokenOut's tax hits once, on the
  // pool -> recipient transfer.
  tokenInTaxBps: number | undefined,
  tokenOutTaxBps: number | undefined,
  // Platform fee in basis points, read from the FeeRouter contract (owner-
  // adjustable). No quote until it is known, so the quote never assumes a
  // different fee than the contract will actually take.
  feeBps: number | null
) {
  const [quote, setQuote] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The path (2 or 3 addresses) that produced `quote` — whichever of the
  // direct/intermediate candidates gave the higher output. The caller
  // should execute the swap against this exact path, not recompute one.
  const [path, setPath] = useState<Address[] | null>(null);
  // Basis points of value lost to price impact vs. the pool's current spot
  // price, computed straight from on-chain reserves — not the token's
  // broader "market" price. A thin direct WBNB/token pool (or WETH on
  // ETH/Arbitrum) can quote successfully while still giving a terrible
  // effective rate; this catches that case even when getAmountsOut doesn't
  // revert. null while unknown/not applicable (e.g. quote failed).
  const [priceImpactBps, setPriceImpactBps] = useState<number | null>(null);
  // True when some hop of the winning path touches the wrapped-native
  // token (WBNB/WETH) with a reserve below config/liquidity.ts's floor —
  // i.e. the pool is essentially dead, not just thin for this trade size.
  // Separate from priceImpactBps: a small enough trade against a dead pool
  // can still compute a low impact percentage, so that check alone won't
  // catch it. See config/liquidity.ts for the full rationale.
  const [insufficientLiquidity, setInsufficientLiquidity] = useState(false);
  // Which router version `quote`/`path` actually came from — set only on
  // BSC mainnet, only once the configured FeeRouter contract's own
  // `v3Router()` reads non-zero (i.e. the deployed contract actually has
  // the V3 swap functions; the currently-live contract at time of writing
  // doesn't, so this stays 'v2' in production until it's redeployed — see
  // FeeRouter.sol's 2026-09-29 V3 addition). useSwap.ts needs this to call
  // the right contract function; when 'v3', `v3Fee` carries the winning
  // pool's fee tier, required by that function's `fee` param. When
  // 'v3-multihop', `v3Path` (not `v3Fee`) carries the pre-encoded 2-hop
  // route, required by the *V3MultiHopWithFee function's `v3Path` param —
  // added 2026-09-30 after PENGU quoted ~85x off with zero warning: it has
  // no meaningful direct WBNB pool on PancakeSwap V3 at all, only a deep
  // one against USDT, so only a multi-hop quote through a stablecoin
  // intermediate (mirroring V2's direct-vs-intermediate route-shopping
  // below) finds the real price. FeeRouter.sol already had the multi-hop
  // swap functions deployed; only the quoting side was missing.
  // 'aggregator' (2026-10-07): the best route came from KyberSwap, which
  // reaches venues the V2/V3 paths below can't (Uniswap V4, PancakeSwap
  // Infinity, Curve, Camelot, ...). `aggregatorRoute` then carries what
  // useSwap needs to build and send it via swapViaAggregatorWithFee.
  const [quoteVersion, setQuoteVersion] = useState<'v2' | 'v3' | 'v3-multihop' | 'aggregator'>('v2');
  const [v3Fee, setV3Fee] = useState<number | null>(null);
  const [v3Path, setV3Path] = useState<`0x${string}` | null>(null);
  const [aggregatorRoute, setAggregatorRoute] = useState<AggregatorRoute | null>(null);
  const publicClient = usePublicClient({ chainId });
  // Stable primitive for the effect's dependency array — intermediateTokens
  // is an array, and callers commonly pass a fresh one each render.
  const intermediateTokensKey = (intermediateTokens ?? []).join(',');

  useEffect(() => {
    let active = true;

    async function fetchQuote() {
      if (!chainId || !tokenIn || !tokenOut || !amountIn || amountIn === 0n || !publicClient || feeBps === null) {
        setQuote(null);
        setLoading(false);
        setError(null);
        setPriceImpactBps(null);
        setInsufficientLiquidity(false);
        setPath(null);
        setQuoteVersion('v2');
        setV3Fee(null);
        setV3Path(null);
        setAggregatorRoute(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const feeRouterAddress = getFeeRouterAddress(chainId);
        if (!feeRouterAddress) throw new Error("Unsupported chain");

        let routerAddress: Address;
        let wethAddress: Address;

        // BSC's FeeRouter and the Ethereum/Arbitrum EthFeeRouter have
        // different ABIs (pancakeRouter() vs uniswapRouter()) — branch on
        // the chain family, not a single hardcoded chain, same as useSwap.ts.
        const isBscFamily =
          chainId === contracts.bscTestnet.chainId || chainId === contracts.bscMainnet.chainId;

        if (chainId === contracts.bscTestnet.chainId) {
          // PancakeSwap router is hardcoded in FeeRouter, but we know it for testnet
          routerAddress = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1';
          wethAddress = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd'; // WBNB
        } else if (isBscFamily) {
          // BSC mainnet FeeRouter exposes pancakeRouter(), not uniswapRouter()
          routerAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: feeRouterAddress,
              abi: FeeRouterABI,
              functionName: 'pancakeRouter',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
          wethAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: routerAddress,
              abi: V2RouterABI,
              functionName: 'WETH',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
        } else {
          // Sepolia/Ethereum Mainnet/Arbitrum EthFeeRouter exposes uniswapRouter()
          routerAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: feeRouterAddress,
              abi: EthFeeRouterABI,
              functionName: 'uniswapRouter',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
          wethAddress = await withRpcRetry(
            () => publicClient.readContract({
              address: routerAddress,
              abi: V2RouterABI,
              functionName: 'WETH',
            }),
            MAX_RETRIES,
            BASE_DELAY_MS,
          ) as Address;
        }

        const directPath = [
          tokenIn === NATIVE_TOKEN_ADDRESS ? wethAddress : tokenIn as Address,
          tokenOut === NATIVE_TOKEN_ADDRESS ? wethAddress : tokenOut as Address
        ];

        if (directPath[0].toLowerCase() === directPath[1].toLowerCase()) {
          setQuote(null);
          setLoading(false);
          setError("Cannot swap identical tokens");
          return;
        }

        // Deduct the platform fee, plus (for a fee-on-transfer tokenIn
        // like Alfat) the two real transfer-tax hits it takes on its way
        // into the pool — user -> FeeRouter, then FeeRouter -> pool —
        // mirroring FeeRouter.sol's own _pullAndSkimFee order: tax, then
        // fee off the post-tax balance, then tax again.
        const tokenInTax = BigInt(tokenInTaxBps ?? 0);
        const receivedByRouter = amountIn - (amountIn * tokenInTax) / 10000n;
        const fee = (receivedByRouter * BigInt(feeBps)) / 10000n;
        const afterFee = receivedByRouter - fee;
        const amountInAfterFee = afterFee - (afterFee * tokenInTax) / 10000n;

        if (amountInAfterFee <= 0n) {
          throw new Error("Amount too small after fee");
        }

        // Route-shop between the direct path and a 2-hop path through each
        // given known-liquid intermediate (skipping any that's already an
        // endpoint, or a duplicate) — some tokens have a nearly-empty (or
        // zero-reserve, outright-reverting) direct WBNB/WETH pool but real
        // liquidity against one of these, so a candidate path through one
        // can quote a far better rate than the direct one. Each candidate
        // is allowed to revert (e.g. INSUFFICIENT_LIQUIDITY) independently;
        // whichever succeeding candidate yields the higher final output wins.
        // The native-currency placeholder (e.g. Ethereum's 'ETH' entry) can't
        // be routed through; its wrapped token is the real intermediate.
        const routableIntermediates = (intermediateTokens ?? []).map((t) =>
          t.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ? wethAddress : t
        );

        const candidatePaths: Address[][] = [directPath];
        const seenIntermediates = new Set<string>();
        for (const intermediateToken of routableIntermediates) {
          const key = intermediateToken.toLowerCase();
          if (
            key === directPath[0].toLowerCase() ||
            key === directPath[1].toLowerCase() ||
            seenIntermediates.has(key)
          ) {
            continue;
          }
          seenIntermediates.add(key);
          candidatePaths.push([directPath[0], intermediateToken as Address, directPath[1]]);
        }

        const attempts = await Promise.all(
          candidatePaths.map(async (candidatePath) => {
            try {
              const amountsOut = await withRpcRetry(
                () => publicClient.readContract({
                  address: routerAddress,
                  abi: V2RouterABI,
                  functionName: 'getAmountsOut',
                  args: [amountInAfterFee, candidatePath],
                }),
                MAX_RETRIES,
                BASE_DELAY_MS,
              ) as bigint[];
              return { path: candidatePath, out: amountsOut[amountsOut.length - 1], err: null as unknown };
            } catch (err) {
              return { path: candidatePath, out: null as bigint | null, err };
            }
          })
        );

        const successes = attempts.filter(
          (a): a is { path: Address[]; out: bigint; err: null } => a.out !== null
        );

        // --- V3 candidates: PancakeSwap V3 on BSC mainnet, Uniswap V3 on
        // Ethereum mainnet (since 2026-10-04 — most Ethereum tokens' real
        // liquidity is on V3, the same gap BSC had). Gated on the
        // *configured* FeeRouter contract's own v3Router() actually reading
        // non-zero, so this stays fully inert against the pre-2026-09-29
        // mainnet contract (no such function at all — the read below just
        // fails and falls through to V2-only) and only activates once that
        // contract is redeployed with V3 support — see FeeRouter.sol.
        let v3Best: { out: bigint; fee: number } | null = null;
        let v3MultiHopBest: { out: bigint; mid: Address; path: `0x${string}` } | null = null;
        const v3Config = getV3Config(chainId);
        if (v3Config) {
          try {
            const onChainV3Router = await withRpcRetry(
              () => publicClient.readContract({
                address: feeRouterAddress,
                abi: isBscFamily ? FeeRouterABI : EthFeeRouterABI,
                functionName: 'v3Router',
              }),
              MAX_RETRIES,
              BASE_DELAY_MS,
            ) as Address;

            if (onChainV3Router !== '0x0000000000000000000000000000000000000000') {
              const v3Attempts = await Promise.all(
                v3Config.feeTiers.map(async (feeTier) => {
                  try {
                    const result = await withRpcRetry(
                      () => publicClient.readContract({
                        address: v3Config!.quoter,
                        abi: PancakeV3QuoterABI,
                        functionName: 'quoteExactInputSingle',
                        args: [{
                          tokenIn: directPath[0],
                          tokenOut: directPath[1],
                          amountIn: amountInAfterFee,
                          fee: feeTier,
                          sqrtPriceLimitX96: 0n,
                        }],
                      }),
                      MAX_RETRIES,
                      BASE_DELAY_MS,
                    ) as readonly [bigint, bigint, number, bigint];
                    return { fee: feeTier as number, out: result[0] as bigint | null };
                  } catch {
                    return { fee: feeTier as number, out: null as bigint | null };
                  }
                })
              );

              const v3Successes = v3Attempts.filter(
                (a): a is { fee: number; out: bigint } => a.out !== null
              );
              if (v3Successes.length > 0) {
                v3Best = v3Successes.reduce((a, b) => (b.out > a.out ? b : a));
              }

              // --- V3 multi-hop candidate, through the same known-liquid
              // intermediates as V2's route-shopping above. Some tokens
              // have no meaningful direct WBNB pool on PancakeSwap V3 at
              // all (or one that exists but is nearly empty), only a real
              // one against a stablecoin — e.g. PENGU's only deep
              // PancakeSwap V3 pool is PENGU/USDT (~$110k), not PENGU/WBNB
              // (a few dollars on an unrelated CLMM venue this app doesn't
              // support). A single quoteExactInput(path) call per fee-tier
              // combo simulates the real compounded-across-hops swap
              // directly (not an estimate from separate legs), so this
              // tries every {intermediate x fee1 x fee2} combination and
              // keeps whichever succeeds with the best output — same
              // "try every candidate" approach as everywhere else in this
              // file, just extended to 2-hop V3 paths too.
              const multiHopCandidates: { mid: Address; fee1: number; fee2: number }[] = [];
              const seenMultiHopMid = new Set<string>();
              for (const intermediateToken of routableIntermediates) {
                const key = intermediateToken.toLowerCase();
                if (
                  key === directPath[0].toLowerCase() ||
                  key === directPath[1].toLowerCase() ||
                  seenMultiHopMid.has(key)
                ) {
                  continue;
                }
                seenMultiHopMid.add(key);
                for (const fee1 of v3Config.feeTiers) {
                  for (const fee2 of v3Config.feeTiers) {
                    multiHopCandidates.push({ mid: intermediateToken as Address, fee1, fee2 });
                  }
                }
              }

              const multiHopAttempts = await Promise.all(
                multiHopCandidates.map(async ({ mid, fee1, fee2 }) => {
                  try {
                    const candidatePath = encodePacked(
                      ['address', 'uint24', 'address', 'uint24', 'address'],
                      [directPath[0], fee1, mid, fee2, directPath[1]]
                    );
                    const result = await withRpcRetry(
                      () => publicClient.readContract({
                        address: v3Config!.quoter,
                        abi: PancakeV3QuoterABI,
                        functionName: 'quoteExactInput',
                        args: [candidatePath, amountInAfterFee],
                      }),
                      MAX_RETRIES,
                      BASE_DELAY_MS,
                    ) as readonly [bigint, readonly bigint[], readonly number[], bigint];
                    return { mid, path: candidatePath, out: result[0] as bigint | null };
                  } catch {
                    return { mid, path: null, out: null as bigint | null };
                  }
                })
              );

              const multiHopSuccesses = multiHopAttempts.filter(
                (a): a is { mid: Address; path: `0x${string}`; out: bigint } => a.out !== null && a.path !== null
              );
              if (multiHopSuccesses.length > 0) {
                v3MultiHopBest = multiHopSuccesses.reduce((a, b) => (b.out > a.out ? b : a));
              }
            }
          } catch {
            // v3Router() reverting/erroring (e.g. the currently-deployed
            // contract predates this function entirely) just means V3
            // isn't available yet — fall through to V2-only.
          }
        }

        // --- DEX-aggregator candidate (KyberSwap), on chains where the
        // configured fee router allowlists KyberSwap's router (read
        // on-chain, so an older contract without swapViaAggregatorWithFee
        // simply never gets here). Skipped for fee-on-transfer tokens: the
        // aggregator's calldata fixes an exact input amount, which a taxed
        // transfer into the router would break.
        let aggRoute: KyberRouteSummary | null = null;
        let aggRefRoute: KyberRouteSummary | null = null;
        const aggRefAmount = amountInAfterFee / 1000n > 0n ? amountInAfterFee / 1000n : 1n;
        const aggChain = getAggregatorChain(chainId);
        const kyberIn = tokenIn === NATIVE_TOKEN_ADDRESS ? KYBERSWAP_NATIVE : tokenIn as Address;
        const kyberOut = tokenOut === NATIVE_TOKEN_ADDRESS ? KYBERSWAP_NATIVE : tokenOut as Address;
        if (aggChain && !(tokenInTaxBps ?? 0) && !(tokenOutTaxBps ?? 0)) {
          try {
            const allowed = await withRpcRetry(
              () => publicClient.readContract({
                address: feeRouterAddress,
                abi: isBscFamily ? FeeRouterABI : EthFeeRouterABI,
                functionName: 'aggregatorRouters',
                args: [KYBERSWAP_ROUTER],
              }),
              MAX_RETRIES,
              BASE_DELAY_MS,
            ) as boolean;
            if (allowed) {
              // Second, tiny quote (1/1000 of the trade) in parallel: its rate
              // is ~the route's spot price, used for price impact below.
              const both = () => Promise.all([
                fetchKyberRoute(aggChain, kyberIn, kyberOut, amountInAfterFee).catch(() => null),
                fetchKyberRoute(aggChain, kyberIn, kyberOut, aggRefAmount).catch(() => null),
              ]);
              [aggRoute, aggRefRoute] = await both();
              // KyberSwap rate-limits per IP (~30 requests / 10s); one retry
              // after a pause before falling back to the V2/V3 routes alone.
              if (!aggRoute) {
                await new Promise((r) => setTimeout(r, 1500));
                [aggRoute, aggRefRoute] = await both();
              }
            }
          } catch {
            // Old contract (no aggregatorRouters()) or API unavailable —
            // fall back to the V2/V3 routes alone.
          }
        }

        if (successes.length === 0 && !v3Best && !v3MultiHopBest && !aggRoute) {
          throw attempts[0].err ?? new Error("No route found for this pair");
        }

        const v2Best = successes.length > 0 ? successes.reduce((a, b) => (b.out > a.out ? b : a)) : null;

        // Use the aggregator only when it beats the best direct V2/V3 route
        // by more than 0.1% — a direct route is cheaper in gas and has no
        // off-chain dependency, so near-ties stay on it.
        const onchainBest = [v2Best?.out, v3Best?.out, v3MultiHopBest?.out]
          .reduce<bigint>((m, x) => (x !== undefined && x > m ? x : m), 0n);
        const aggOut = aggRoute ? BigInt(aggRoute.amountOut) : 0n;
        if (aggRoute && aggOut * 1000n > onchainBest * 1001n) {
          if (active) {
            setQuote(aggOut);
            setPath(directPath as Address[]);
            setQuoteVersion('aggregator');
            setV3Fee(null);
            setV3Path(null);
            setAggregatorRoute({ routeSummary: aggRoute, tokenIn: kyberIn, tokenOut: kyberOut });
            // Same method as the V3 check below: scale the tiny reference
            // quote's rate up to the trade size and compare. Not KyberSwap's
            // amountIn/OutUsd: its USD prices for thin tokens can be several
            // percent off (2026-10-11: ONT valued ~6% low, so a trade 0.8%
            // under market showed a 6.4% warning).
            const refOut = aggRefRoute ? BigInt(aggRefRoute.amountOut) : 0n;
            const ideal = refOut > 0n ? (refOut * amountInAfterFee) / aggRefAmount : 0n;
            setPriceImpactBps(ideal > 0n ? (ideal > aggOut ? Number(((ideal - aggOut) * 10000n) / ideal) : 0) : null);
            setInsufficientLiquidity(false);
          }
          return;
        }

        // Whichever version — and, within V3, whichever of direct/multi-hop
        // — gives the better raw output wins outright. Same "try every
        // candidate, keep the best" principle as the V2 direct-vs-
        // intermediate route-shopping above, just extended across router
        // versions (and, for V3, hop counts) too.
        const v3DirectWins = v3Best !== null && (v3MultiHopBest === null || v3Best.out >= v3MultiHopBest.out);
        const v3Overall = v3DirectWins ? v3Best : v3MultiHopBest;
        const v3Wins = v3Overall !== null && (v2Best === null || v3Overall.out > v2Best.out);
        const winnerVersion: 'v2' | 'v3' | 'v3-multihop' = !v3Wins
          ? 'v2'
          : v3DirectWins ? 'v3' : 'v3-multihop';
        // best.out is the pool's raw output, pre tokenOut tax — kept as-is
        // below for the price-impact comparison (a pure pool-thinness
        // signal), separate from finalOut, which additionally accounts for
        // the tax the recipient actually pays on the pool -> recipient
        // transfer and is what the UI quotes / amountOutMin is derived from.
        const actualOut = v3Wins ? v3Overall!.out : v2Best!.out;
        const tokenOutTax = BigInt(tokenOutTaxBps ?? 0);
        const finalOut = actualOut - (actualOut * tokenOutTax) / 10000n;
        const path = !v3Wins
          ? v2Best!.path
          : winnerVersion === 'v3-multihop'
            ? [directPath[0], v3MultiHopBest!.mid, directPath[1]] as Address[]
            : directPath as Address[];

        if (active) {
          setQuote(finalOut);
          setPath(path);
          setQuoteVersion(winnerVersion);
          setV3Fee(winnerVersion === 'v3' ? v3Best!.fee : null);
          setV3Path(winnerVersion === 'v3-multihop' ? v3MultiHopBest!.path : null);
          setAggregatorRoute(null);
        }

        // Price impact vs. the winning path's current spot price — a real
        // trade on real pools, but those pools can be nearly empty even
        // when they have *some* liquidity (a few dollars, not a bug — just
        // too thin for this trade size). Walk every hop of the winning
        // path, compounding a no-slippage reference amount hop by hop, so a
        // 2-hop route through an intermediate is judged the same way as a
        // direct one. Compute best-effort; never let a failure here block
        // the quote itself.
        //
        // V3 doesn't expose simple reserves the way V2 does (concentrated
        // liquidity), so this can't reuse the V2 reserve-walk above. Same
        // idea, different mechanism: quote the SAME winning pool with a
        // tiny reference amount (near-zero slippage, i.e. close to the
        // pool's current spot price), scale that rate up to the real
        // trade size, and compare to what the real trade actually quotes.
        // A large gap means the trade itself is heavy relative to this
        // pool specifically — added 2026-09-30 after PENGU, WLFI, and XTZ
        // (all winning via V3) were found live-quoting at wildly wrong
        // prices (PENGU ~85x off) with zero warning, because this check
        // hadn't existed at all for a V3-won quote until now. Validated
        // against those three plus a known-good V3 token (APE, ~0.3%)
        // before shipping. Still doesn't catch a pool that's deep enough
        // to absorb *this* trade cleanly but is itself priced away from
        // the wider market (see DEXE, config/liquidity.ts) — that needs a
        // genuine external reference price, a separate, bigger change.
        if (v3Wins) {
          try {
            const tinyAmount = amountInAfterFee / 1000n;
            if (tinyAmount > 0n) {
              const tinyOut = winnerVersion === 'v3-multihop'
                ? ((await withRpcRetry(
                    () => publicClient.readContract({
                      address: v3Config!.quoter,
                      abi: PancakeV3QuoterABI,
                      functionName: 'quoteExactInput',
                      args: [v3MultiHopBest!.path, tinyAmount],
                    }),
                    MAX_RETRIES,
                    BASE_DELAY_MS,
                  )) as readonly [bigint, readonly bigint[], readonly number[], bigint])[0]
                : ((await withRpcRetry(
                    () => publicClient.readContract({
                      address: v3Config!.quoter,
                      abi: PancakeV3QuoterABI,
                      functionName: 'quoteExactInputSingle',
                      args: [{
                        tokenIn: directPath[0],
                        tokenOut: directPath[1],
                        amountIn: tinyAmount,
                        fee: v3Best!.fee,
                        sqrtPriceLimitX96: 0n,
                      }],
                    }),
                    MAX_RETRIES,
                    BASE_DELAY_MS,
                  )) as readonly [bigint, bigint, number, bigint])[0];

              const idealAmount = (tinyOut * amountInAfterFee) / tinyAmount;
              if (active) {
                if (idealAmount > 0n) {
                  const impact = idealAmount > actualOut
                    ? Number(((idealAmount - actualOut) * 10000n) / idealAmount)
                    : 0;
                  setPriceImpactBps(impact);
                } else {
                  setPriceImpactBps(null);
                }
                setInsufficientLiquidity(false);
              }
            } else if (active) {
              setPriceImpactBps(null);
              setInsufficientLiquidity(false);
            }
          } catch {
            // Best-effort only — an RPC hiccup here shouldn't hide a
            // perfectly good quote.
            if (active) {
              setPriceImpactBps(null);
              setInsufficientLiquidity(false);
            }
          }
        } else {
          try {
            const factoryAddress = await withRpcRetry(
              () => publicClient.readContract({
                address: routerAddress,
                abi: V2RouterABI,
                functionName: 'factory',
              }),
              MAX_RETRIES,
              BASE_DELAY_MS,
            ) as Address;

            let idealAmount = amountInAfterFee;
            let impactKnown = true;
            const minNativeReserve = getMinNativeReserveWei(chainId);
            let hitDeadPool = false;

            for (let i = 0; i < path.length - 1 && impactKnown; i++) {
              const hopIn = path[i];
              const hopOut = path[i + 1];

              const pairAddress = await withRpcRetry(
                () => publicClient.readContract({
                  address: factoryAddress,
                  abi: V2FactoryABI,
                  functionName: 'getPair',
                  args: [hopIn, hopOut],
                }),
                MAX_RETRIES,
                BASE_DELAY_MS,
              ) as Address;

              if (pairAddress === '0x0000000000000000000000000000000000000000') {
                impactKnown = false;
                break;
              }

              const [reserves, token0] = await Promise.all([
                withRpcRetry(
                  () => publicClient.readContract({ address: pairAddress, abi: V2PairABI, functionName: 'getReserves' }),
                  MAX_RETRIES,
                  BASE_DELAY_MS,
                ) as Promise<readonly [bigint, bigint, number]>,
                withRpcRetry(
                  () => publicClient.readContract({ address: pairAddress, abi: V2PairABI, functionName: 'token0' }),
                  MAX_RETRIES,
                  BASE_DELAY_MS,
                ) as Promise<Address>,
              ]);

              const [reserve0, reserve1] = reserves;
              const hopInIsToken0 = token0.toLowerCase() === hopIn.toLowerCase();
              const reserveIn = hopInIsToken0 ? reserve0 : reserve1;
              const reserveOut = hopInIsToken0 ? reserve1 : reserve0;

              if (reserveIn <= 0n || reserveOut <= 0n) {
                impactKnown = false;
                break;
              }

              // Dead-pool floor, independent of this trade's size — see
              // config/liquidity.ts. Only meaningful on the hop's
              // wrapped-native side; the other side is an arbitrary token
              // with its own decimals/valuation, not comparable to a wei
              // threshold.
              if (minNativeReserve !== null) {
                if (hopIn.toLowerCase() === wethAddress.toLowerCase() && reserveIn < minNativeReserve) {
                  hitDeadPool = true;
                } else if (hopOut.toLowerCase() === wethAddress.toLowerCase() && reserveOut < minNativeReserve) {
                  hitDeadPool = true;
                }
              }

              // No-slippage reference price from reserves *before* this
              // trade, compounded across hops so both sides are on equal
              // footing with the real (slippage-affected) quote.
              idealAmount = (idealAmount * reserveOut) / reserveIn;
            }

            if (impactKnown && idealAmount > 0n && active) {
              const impact = idealAmount > actualOut
                ? Number(((idealAmount - actualOut) * 10000n) / idealAmount)
                : 0;
              setPriceImpactBps(impact);
            } else if (active) {
              setPriceImpactBps(null);
            }
            if (active) setInsufficientLiquidity(hitDeadPool);
          } catch {
            // Best-effort only — an RPC hiccup here shouldn't hide a
            // perfectly good quote.
            if (active) {
              setPriceImpactBps(null);
              setInsufficientLiquidity(false);
            }
          }
        }
      } catch (err: any) {
        if (active) {
          console.error("Quote error:", err);
          setError(err.message || "Failed to fetch quote");
          setQuote(null);
          setPath(null);
          setPriceImpactBps(null);
          setInsufficientLiquidity(false);
          setQuoteVersion('v2');
          setV3Fee(null);
          setV3Path(null);
          setAggregatorRoute(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(fetchQuote, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [chainId, tokenIn, tokenOut, amountIn, intermediateTokensKey, publicClient, tokenInTaxBps, tokenOutTaxBps, feeBps]);

  return { quote, loading, error, priceImpactBps, insufficientLiquidity, path, quoteVersion, v3Fee, v3Path, aggregatorRoute };
}
