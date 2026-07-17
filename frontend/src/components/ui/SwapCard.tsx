"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useBalance, useSwitchChain, useReadContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import { useChainContext } from "@/context/ChainContext";
import {
    BSC_TESTNET_TOKENS,
    SEPOLIA_TOKENS,
    ARBITRUM_SEPOLIA_TOKENS,
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

    // Determine expected chain ID for the active tab. Arbitrum targets
    // mainnet here — the testnet deployment is a dev-only mock DEX with no
    // real liquidity, so it isn't something end users should be routed to.
    const expectedChainId =
        activeTab === "bsc"
            ? contracts.bscTestnet.chainId
            : activeTab === "ethereum"
            ? contracts.sepolia.chainId
            : contracts.arbitrumOne.chainId;

    const isWrongNetwork = isConnected && chain?.id !== expectedChainId;

    // Arbitrum isn't live for end users on testnet (no real DEX liquidity
    // there — see docs/deployments.md). If the connected wallet happens to
    // be on Arbitrum Sepolia, show a "coming to mainnet" notice instead of
    // treating it like any other wrong-network state.
    const isArbitrumTestnetConnected =
        activeTab === "arbitrum" && chain?.id === contracts.arbitrumSepolia.chainId;

    // Token Lists
    const tokens = useMemo(() => {
        if (activeTab === "bsc") return BSC_TESTNET_TOKENS;
        if (activeTab === "ethereum") return SEPOLIA_TOKENS;
        return ARBITRUM_SEPOLIA_TOKENS;
    }, [activeTab]);

    // Form State
    const [tokenIn, setTokenIn] = useState<Token | null>(null);
    const [tokenOut, setTokenOut] = useState<Token | null>(null);
    const [amountIn, setAmountIn] = useState("");
    const [slippage, setSlippage] = useState("0.5");

    // Auto-select defaults when chain changes
    useEffect(() => {
        if (tokens.length >= 3) {
            setTokenIn(tokens[0]); // Native (e.g. tBNB, ETH)
            setTokenOut(tokens[2]); // ERC20 (e.g. BUSD, UNI, USDC)
            setAmountIn("");
        } else if (tokens.length >= 2) {
            setTokenIn(tokens[0]);
            setTokenOut(tokens[1]);
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

    // Quotes
    const { quote: evmQuoteOut, loading: evmQuoteLoading } = useEvmQuote(
        expectedChainId,
        tokenIn?.address,
        tokenOut?.address,
        amountInRaw,
    );

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
        if (tokenIn && tokenOut && amountInRaw && minReceivedRaw) {
            await executeSwap(
                expectedChainId,
                tokenIn.address,
                tokenOut.address,
                amountInRaw,
                minReceivedRaw,
                evmAddress!,
                tokenIn.isFeeOnTransfer || tokenOut.isFeeOnTransfer,
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
        isAboveMax;

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

            {isArbitrumTestnetConnected ? (
                <div className="flex flex-col items-center text-center gap-3 py-12">
                    <p className="text-base font-semibold">
                        Arbitrum will be available on mainnet
                    </p>
                    <p className="text-sm text-text-muted max-w-xs">
                        You&apos;re connected to Arbitrum Sepolia (testnet). Arbitrum
                        swaps open up once we launch on Arbitrum One mainnet.
                    </p>
                    <button
                        onClick={() =>
                            switchChain?.({ chainId: contracts.arbitrumOne.chainId })
                        }
                        className="mt-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all"
                    >
                        Switch to Arbitrum Mainnet
                    </button>
                </div>
            ) : (
            <>
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
            </>
            )}
        </div>
    );
}
