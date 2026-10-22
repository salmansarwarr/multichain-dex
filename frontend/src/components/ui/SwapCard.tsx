"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useBalance, useSwitchChain, useReadContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import { useChainContext } from "@/context/ChainContext";
import {
    BSC_MAINNET_TOKENS,
    ETH_MAINNET_TOKENS,
    ARBITRUM_MAINNET_TOKENS,
    Token,
    NATIVE_TOKEN_ADDRESS,
} from "@/data/tokens";
import { contracts, getFeeRouterAddress } from "@/config/contracts";
import { getSwapLimits } from "@/config/limits";
import { ERC20ABI } from "@/abis/ERC20";

import { TokenAmountInput } from "../swap/TokenAmountInput";
import { SwapDetails } from "../swap/SwapDetails";
import { SwapButton } from "../swap/SwapButton";
import { useEvmQuote } from "@/hooks/useEvmQuote";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useSwap } from "@/hooks/useSwap";
import { useLiquidityInfo, MAX_IMPACT } from "@/hooks/useLiquidityInfo";
import { describeRoute } from "@/lib/routeLabel";

/// Rounded *down* to 3 significant digits, so a suggested maximum shown to
/// the user never exceeds the real one (typing it in must not re-trigger the
/// notice).
function fmtAmountDown(n: number): string {
    if (n >= 1000) return Math.floor(n).toLocaleString();
    const d = n >= 1 ? 2 : Math.max(0, 2 - Math.floor(Math.log10(n)));
    return (Math.floor(n * 10 ** d + 1e-9) / 10 ** d).toFixed(d).replace(/\.?0+$/, "");
}

function fmtAmount(n: number): string {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}

const CHAIN_NAMES: Record<string, string> = { bsc: "BNB Chain", ethereum: "Ethereum", arbitrum: "Arbitrum" };

export function SwapCard() {
    const { activeTab } = useChainContext();

    // Wallet context
    const {
        address: evmAddress,
        isConnected,
        chain,
    } = useAccount();
    const { switchChain } = useSwitchChain();
    const { openConnectModal } = useConnectModal();

    // All three chains target mainnet — see docs/deployments.md for the
    // live FeeRouter/EthFeeRouter addresses (deployed 2026-08-22, verified
    // 2026-08-23).
    const expectedChainId =
        activeTab === "bsc"
            ? contracts.bscMainnet.chainId
            : activeTab === "ethereum"
            ? contracts.mainnet.chainId
            : contracts.arbitrumOne.chainId;

    const isWrongNetwork = isConnected && chain?.id !== expectedChainId;

    // Token Lists
    const tokens = useMemo(() => {
        if (activeTab === "bsc") return BSC_MAINNET_TOKENS;
        if (activeTab === "ethereum") return ETH_MAINNET_TOKENS;
        return ARBITRUM_MAINNET_TOKENS;
    }, [activeTab]);

    // Form State
    const [tokenIn, setTokenIn] = useState<Token | null>(null);
    const [tokenOut, setTokenOut] = useState<Token | null>(null);
    const [amountIn, setAmountIn] = useState("");
    const [slippage, setSlippage] = useState("0.5");

    // Auto-select defaults when chain changes. Default "you receive" to
    // USDT specifically (by symbol, not array position) — on BSC mainnet,
    // tokens[2] is Alfat, whose PancakeSwap V2 pool currently has
    // insufficient liquidity for getAmountsOut, which broke the swap card
    // on first load with nothing typed. USDT is confirmed liquid on all
    // three chains as of 2026-08-23.
    useEffect(() => {
        if (tokens.length >= 2) {
            const defaultOut = tokens.find((t) => t.symbol === "USDT") ?? tokens[Math.min(2, tokens.length - 1)];
            setTokenIn(tokens[0]); // Native (e.g. tBNB, ETH)
            setTokenOut(defaultOut);
            setAmountIn("");
        }
    }, [tokens]);

    // Balances
    const { data: evmBalance } = useBalance({
        address: evmAddress,
        token:
            tokenIn && tokenIn.address !== NATIVE_TOKEN_ADDRESS
                ? (tokenIn.address as `0x${string}`)
                : undefined,
        chainId: expectedChainId,
        query: { enabled: isConnected && !isWrongNetwork },
    });

    const displayBalance = evmBalance ? evmBalance.formatted : "0";
    const amountInRaw =
        amountIn && tokenIn
            ? parseUnits(amountIn, tokenIn.decimals)
            : undefined;

    const hasInsufficientBalance = useMemo(() => {
        if (!amountInRaw || !tokenIn) return false;
        if (!evmBalance) return true;
        return amountInRaw > evmBalance.value;
    }, [amountInRaw, evmBalance, tokenIn]);

    // Min/max transaction limits (frontend guardrail — see config/limits.ts)
    const swapLimits = getSwapLimits(tokenIn?.symbol);
    const amountInNumber = parseFloat(amountIn || "0");
    const isBelowMin = amountInNumber > 0 && amountInNumber < swapLimits.min;
    const isAboveMax = amountInNumber > swapLimits.max;

    // Quotes — also try routing through known-liquid intermediates as a
    // 2-hop alternative to the direct path (see useEvmQuote's
    // `intermediateTokens` param): most altcoins hold their real liquidity
    // in the wrapped-native pool (WBNB/WETH) or a major stablecoin pair, not
    // in a direct pair against the other token. E.g. on BSC, FET -> USDT
    // direct quotes ~0.012 USDT while FET -> WBNB -> USDT quotes ~0.51 for
    // the same input. Alfat's direct WBNB pool has zero liquidity and
    // reverts outright, but its CAKE pool is real and liquid. The best
    // output across all candidates wins.
    //
    // 'ETH' (Binance-Peg Ethereum Token) added 2026-09-29 after a client
    // report that COW — which a prior check had wrongly concluded had no
    // BSC liquidity anywhere — actually trades on PancakeSwap. It does:
    // a real, active ~$60k V2 pool, but paired against bridged ETH, not
    // any of the tokens originally in this list. Common on BSC for
    // Ethereum-ecosystem tokens (COW Protocol is Ethereum-native) to hold
    // their real liquidity against ETH rather than BNB/a stablecoin — this
    // list was missing that base entirely. Re-checked DEXE and M/MemeCore
    // (the two BSC tokens still gated on insufficient liquidity at time of
    // writing) against ETH too — neither gained a route; still genuinely
    // thin/dead. A broader sweep found 27 of the other 52 BSC tokens also
    // get *some* route via ETH, expected and harmless: those already had a
    // working route elsewhere, and the best-output-wins logic below can
    // only ever benefit from an extra candidate, never regress from one.
    const intermediateTokens = useMemo(
        () =>
            ["WBNB", "WETH", "ETH", "USDT", "USDC", "BUSD", "DAI", "CAKE"]
                .map((symbol) => tokens.find((t) => t.symbol === symbol)?.address)
                .filter((address): address is string => !!address),
        [tokens],
    );
    const {
        quote: evmQuoteOut,
        loading: evmQuoteLoading,
        error: evmQuoteError,
        priceImpactBps,
        insufficientLiquidity,
        path: evmQuotePath,
        quoteVersion,
        v3Fee,
        v3Path,
        aggregatorRoute,
    } = useEvmQuote(
        expectedChainId,
        tokenIn?.address,
        tokenOut?.address,
        amountInRaw,
        intermediateTokens,
        tokenIn?.transferTaxBps,
        tokenOut?.transferTaxBps,
    );

    // Price impact vs. the pool's own spot price — catches thin direct
    // pools that quote successfully but at a badly distorted rate (seen
    // live on BSC mainnet: USDe, WLFI, MemeCore all have a direct WBNB
    // pool with well under 1 BNB of real reserves). Past 15% the swap is
    // refused, the common Uniswap/PancakeSwap-frontend convention.
    const isExtremePriceImpact = priceImpactBps !== null && priceImpactBps >= 1500;

    // Pair liquidity, the CoinGecko market rate and the largest amount that
    // stays close to it, checked once when the pair is selected.
    const { info: liquidity, loading: liquidityLoading } = useLiquidityInfo(expectedChainId, tokenIn, tokenOut, tokens);
    // How far this quote is below the market rate, before the 0.15% fee
    // (shown separately). Not for tax tokens, whose quote includes the tax.
    const marketDeviation =
        evmQuoteOut && tokenIn && tokenOut && liquidity?.market && amountInNumber > 0 && !tokenIn.isFeeOnTransfer && !tokenOut.isFeeOnTransfer
            ? 1 - Number(formatUnits(evmQuoteOut, tokenOut.decimals)) / (amountInNumber * 0.9985 * liquidity.market.rate)
            : null;
    // Warnings compare against the market price when there is one; pairs of
    // major tokens and tax tokens fall back to the pool's price impact.
    const taxedPair = !!(tokenIn?.isFeeOnTransfer || tokenOut?.isFeeOnTransfer);
    const byMarket = !taxedPair && (liquidityLoading || !!liquidity?.market);
    const deviation = byMarket ? marketDeviation : priceImpactBps !== null ? priceImpactBps / 10000 : null;
    const isOffMarket = deviation !== null && deviation > MAX_IMPACT;
    const isHighPriceImpact = deviation !== null && deviation >= 0.03;
    // Even a tiny swap is off the market price: every exchange on this
    // chain prices the token away from where it trades elsewhere.
    const offAtAnySize = byMarket && liquidity?.depth?.maxIn === 0;
    const offSymbol = liquidity?.pool?.symbol ?? tokenOut?.symbol;
    const suggestedMaxIn =
        isOffMarket && liquidity?.depth && !liquidity.depth.aboveRange && liquidity.depth.maxIn > 0 && amountInNumber > liquidity.depth.maxIn
            ? liquidity.depth.maxIn
            : null;

    const route =
        tokenIn && tokenOut && evmQuoteOut
            ? describeRoute({
                  isBsc: activeTab === "bsc",
                  tokens,
                  tokenIn,
                  tokenOut,
                  quoteVersion,
                  path: evmQuotePath,
                  v3Fee,
                  aggregatorRoute,
              })
            : null;

    const amountOutDisplay =
        evmQuoteOut && tokenOut
            ? formatUnits(evmQuoteOut, tokenOut.decimals)
            : "";

    // Approvals (EVM)
    const feeRouterAddress = getFeeRouterAddress(expectedChainId);
    const { needsApproval, approve, approving } = useTokenAllowance(
        tokenIn?.address,
        feeRouterAddress,
        amountInRaw,
    );

    // Swapping
    const {
        state: swapState,
        execute: executeSwap,
        reset: resetSwap,
    } = useSwap();

    // Derived calculations for Swap Details
    const feeRaw = amountInRaw ? (amountInRaw * 15n) / 10000n : null;
    const feeDisplay =
        feeRaw && tokenIn ? formatUnits(feeRaw, tokenIn.decimals) : null;

    const slippageBps = parseFloat(slippage || "0.5") * 100;
    const minReceivedRaw = evmQuoteOut
        ? (evmQuoteOut * BigInt(10000 - Math.floor(slippageBps))) / 10000n
        : null;
    const minReceivedDisplay =
        minReceivedRaw && tokenOut
            ? formatUnits(minReceivedRaw, tokenOut.decimals)
            : null;

    // Actions
    const handleConnect = () => openConnectModal?.();

    const handleSwap = async () => {
        if (tokenIn && tokenOut && amountInRaw && minReceivedRaw && evmQuotePath) {
            await executeSwap(
                expectedChainId,
                tokenIn.address,
                amountInRaw,
                minReceivedRaw,
                evmAddress!,
                evmQuotePath,
                tokenIn.isFeeOnTransfer || tokenOut.isFeeOnTransfer,
                quoteVersion,
                v3Fee,
                v3Path,
                aggregatorRoute,
                Math.floor(slippageBps),
            );
        }
    };

    const flipTokens = () => {
        setTokenIn(tokenOut);
        setTokenOut(tokenIn);
        setAmountIn("");
        resetSwap();
    };

    const disableSwap =
        !amountInRaw ||
        amountInRaw === 0n ||
        !evmQuoteOut ||
        hasInsufficientBalance ||
        isBelowMin ||
        isAboveMax ||
        isExtremePriceImpact ||
        insufficientLiquidity;

    // Featured tax-token stat (e.g. Alfat) — read live rather than
    // hardcoded, so it can't drift from the real on-chain value.
    const featuredToken = tokenIn?.isFeeOnTransfer ? tokenIn : tokenOut?.isFeeOnTransfer ? tokenOut : undefined;
    const { data: featuredTokenSupply } = useReadContract({
        address: featuredToken?.address as `0x${string}` | undefined,
        abi: ERC20ABI,
        functionName: "totalSupply",
        chainId: expectedChainId,
        query: { enabled: !!featuredToken },
    });

    return (
        <div className="w-full max-w-[480px] mx-auto mt-8 glass-card p-6 flex flex-col min-h-[400px]">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Swap</h2>
                <div className="text-sm font-medium text-text-muted bg-surface-light px-3 py-1 rounded-lg border border-border">
                    {activeTab.toUpperCase()}
                </div>
            </div>

            <div className="flex items-center gap-2 -mt-3 mb-5 flex-wrap">
                <span className="text-xs font-medium text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                    0.15% fee
                </span>
                <span className="text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
                    Smart-contract secured
                </span>
                {featuredToken && featuredTokenSupply !== undefined && (
                    <span className="text-xs font-medium text-text-muted bg-surface-light border border-border px-2.5 py-1 rounded-full">
                        {featuredToken.symbol} supply: {Number(formatUnits(featuredTokenSupply as bigint, featuredToken.decimals)).toLocaleString()}
                    </span>
                )}
            </div>

            <div className="relative">
                <TokenAmountInput
                    label="You pay"
                    amount={amountIn}
                    onAmountChange={(val) => {
                        setAmountIn(val);
                        if (swapState === "SUCCESS" || swapState === "ERROR")
                            resetSwap();
                    }}
                    token={tokenIn}
                    onTokenSelect={setTokenIn}
                    tokens={tokens}
                    balance={displayBalance}
                    onMax={() => setAmountIn(displayBalance)}
                    chainId={expectedChainId}
                />

                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 z-10">
                    <button
                        onClick={flipTokens}
                        className="w-10 h-10 rounded-xl bg-surface border-4 border-[#0a0f1c] hover:bg-surface-light hover:border-primary/20 transition-all flex items-center justify-center text-text-muted hover:text-white group"
                    >
                        <svg
                            className="w-5 h-5 group-hover:rotate-180 transition-transform duration-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                            />
                        </svg>
                    </button>
                </div>

                <div className="mt-2">
                    <TokenAmountInput
                        label="You receive"
                        amount={amountOutDisplay}
                        token={tokenOut}
                        onTokenSelect={setTokenOut}
                        tokens={tokens}
                        disabled={true}
                        loading={evmQuoteLoading}
                        chainId={expectedChainId}
                    />
                </div>
            </div>

            {amountInRaw && !evmQuoteLoading && !evmQuoteOut && evmQuoteError && (
                <div className="mt-4 p-3 rounded-xl border text-sm text-center font-medium bg-red-500/10 border-red-500/30 text-red-400">
                    Couldn&apos;t get a quote for this pair — insufficient liquidity or an RPC issue. Try again in a moment.
                </div>
            )}

            {evmQuoteOut && insufficientLiquidity && (
                <div className="mt-4 p-3 rounded-xl border text-sm text-center font-medium bg-red-500/10 border-red-500/30 text-red-400">
                    This pool doesn&apos;t hold enough on-chain liquidity to give a reliable price. Swap disabled to protect you.
                </div>
            )}

            {evmQuoteOut && !insufficientLiquidity && (isHighPriceImpact || isExtremePriceImpact) && (
                <div
                    className={`mt-4 p-3 rounded-xl border text-sm text-center font-medium ${
                        isExtremePriceImpact
                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                            : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                    }`}
                >
                    {isExtremePriceImpact
                        ? `Price impact ~${(priceImpactBps! / 100).toFixed(1)}% — this pool has too little liquidity for this trade. Swap disabled to protect you.`
                        : offAtAnySize
                          ? `You receive ~${(deviation! * 100).toFixed(1)}% less than the market price (CoinGecko). ${offSymbol} is priced off the market on every ${CHAIN_NAMES[activeTab]} exchange, so even small swaps get ~${(Math.max(liquidity!.depth!.spotDeviation, MAX_IMPACT) * 100).toFixed(1)}% less.`
                          : byMarket
                            ? `You receive ~${(deviation! * 100).toFixed(1)}% less than the market price (CoinGecko) — low liquidity for this amount.`
                            : `High price impact ~${(deviation! * 100).toFixed(1)}% — low liquidity for this pair, you may receive significantly less value than expected.`}
                    {suggestedMaxIn !== null && tokenIn && (
                        <div className="mt-1.5 font-normal">
                            {isExtremePriceImpact
                                ? `Reduce the amount to ~${fmtAmountDown(suggestedMaxIn)} ${tokenIn.symbol} or less to swap close to the market price.`
                                : `Swap up to ~${fmtAmountDown(suggestedMaxIn)} ${tokenIn.symbol} to stay within ${MAX_IMPACT * 100}% of the market price, or continue at this price.`}
                        </div>
                    )}
                </div>
            )}

            {evmQuoteOut && !insufficientLiquidity && !isHighPriceImpact && !isExtremePriceImpact && isOffMarket && tokenIn && tokenOut && (
                <div className="mt-4 p-3 rounded-xl border text-sm text-center bg-blue-500/10 border-blue-500/30 text-blue-300">
                    {offAtAnySize
                        ? `You receive ~${(deviation! * 100).toFixed(1)}% less than the market price (CoinGecko). ${offSymbol} is priced off the market on every ${CHAIN_NAMES[activeTab]} exchange, so even small swaps get ~${(Math.max(liquidity!.depth!.spotDeviation, MAX_IMPACT) * 100).toFixed(1)}% less.`
                        : byMarket
                          ? `At this amount you receive ~${(deviation! * 100).toFixed(1)}% less than the market price (CoinGecko), due to limited liquidity.`
                          : `Price impact ~${(deviation! * 100).toFixed(1)}% — limited liquidity for this amount.`}
                    {suggestedMaxIn !== null && (
                        <div className="mt-1.5">
                            Swap up to ~{fmtAmountDown(suggestedMaxIn)} {tokenIn.symbol} to stay within {MAX_IMPACT * 100}% of the market
                            price, or continue at this price.
                        </div>
                    )}
                </div>
            )}

            {route && (
                <div className="mt-3 px-1 text-xs text-text-muted">
                    <span className="text-white/80">Route:</span> {route.path.join(" → ")}
                    <span className="block mt-0.5">
                        via {route.venues.join(", ")}
                        {route.splits > 1 ? ` (split across ${route.splits} routes)` : ""}
                    </span>
                </div>
            )}

            {tokenIn && tokenOut && (liquidityLoading || liquidity?.pool) && (
                <div className="mt-3 p-3 rounded-xl bg-surface-light border border-border text-xs text-text-muted space-y-1">
                    {liquidityLoading && <div>Checking liquidity…</div>}
                    {liquidity?.pool && (
                        <div>
                            <span className="text-white/80">{liquidity.pool.symbol} liquidity on {CHAIN_NAMES[activeTab]}:</span>{" "}
                            ~${fmtAmount(liquidity.pool.usd)} (~{fmtAmount(liquidity.pool.tokenAmount)} {liquidity.pool.symbol})
                        </div>
                    )}
                </div>
            )}

            {amountInRaw && evmQuoteOut && (
                <SwapDetails
                    feeAmount={feeDisplay}
                    feeSymbol={tokenIn?.symbol || null}
                    minReceived={minReceivedDisplay}
                    minReceivedSymbol={tokenOut?.symbol || null}
                    slippage={slippage}
                    onSlippageChange={setSlippage}
                />
            )}

            {swapState === "SUCCESS" && (
                <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm text-center font-medium">
                    Swap Successful!
                </div>
            )}

            {swapState === "ERROR" && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center font-medium">
                    Swap Failed. Check console or slippage.
                </div>
            )}

            <SwapButton
                isConnected={isConnected}
                isWrongNetwork={isWrongNetwork}
                needsApproval={needsApproval}
                hasInsufficientBalance={hasInsufficientBalance}
                isBelowMin={isBelowMin}
                isAboveMax={isAboveMax}
                minAmountLabel={tokenIn ? `${swapLimits.min} ${tokenIn.symbol}` : undefined}
                maxAmountLabel={tokenIn ? `${swapLimits.max} ${tokenIn.symbol}` : undefined}
                swapState={swapState}
                approving={approving}
                onConnect={handleConnect}
                onSwitchNetwork={() =>
                    switchChain?.({ chainId: expectedChainId })
                }
                onApprove={approve}
                onSwap={handleSwap}
                disabled={disableSwap}
            />
        </div>
    );
}
