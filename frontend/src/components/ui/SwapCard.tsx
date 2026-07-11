"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { formatUnits, parseUnits } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import { useChainContext } from "@/context/ChainContext";
import {
    BSC_TESTNET_TOKENS,
    SEPOLIA_TOKENS,
    Token,
    NATIVE_TOKEN_ADDRESS,
} from "@/data/tokens";
import { contracts, getFeeRouterAddress } from "@/config/contracts";

import { TokenAmountInput } from "../swap/TokenAmountInput";
import { SwapDetails } from "../swap/SwapDetails";
import { SwapButton } from "../swap/SwapButton";
import { useEvmQuote } from "@/hooks/useEvmQuote";
import { useSolanaQuote } from "@/hooks/useSolanaQuote";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useSwap } from "@/hooks/useSwap";
import { useSolanaSwap } from "@/hooks/useSolanaSwap";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function SwapCard() {
    const { activeTab } = useChainContext();

    // Wallet context
    const {
        address: evmAddress,
        isConnected: isEvmConnected,
        chain,
    } = useAccount();
    const { switchChain } = useSwitchChain();
    const { openConnectModal } = useConnectModal();
    const { connected: isSolanaConnected } = useWallet();
    const { setVisible: setSolanaModalVisible } = useWalletModal();

    const isSolana = activeTab === "solana";
    const isEvm = !isSolana;

    // Determine expected chain ID for EVM
    const expectedChainId =
        activeTab === "bsc"
            ? contracts.bscTestnet.chainId
            : contracts.sepolia.chainId;
    const isWrongNetwork =
        isEvm && isEvmConnected && chain?.id !== expectedChainId;

    // Token Lists
    const [solanaTokens, setSolanaTokens] = useState<Token[]>([]);

    const tokens = useMemo(() => {
        if (activeTab === "bsc") return BSC_TESTNET_TOKENS;
        if (activeTab === "ethereum") return SEPOLIA_TOKENS;
        return solanaTokens;
    }, [activeTab, solanaTokens]);

    // For Solana, load a default strict list on mount
    useEffect(() => {
        if (activeTab === "solana" && solanaTokens.length === 0) {
            fetch("https://lite-api.jup.ag/tokens/v1/tagged/verified")
                .then((res) => {
                    if (!res.ok)
                        throw new Error(
                            `Jupiter tokens fetch failed: ${res.status}`,
                        );
                    return res.json();
                })
                .then((data) => {
                    setSolanaTokens(
                        data.slice(0, 50).map((t: any) => ({
                            address: t.address,
                            symbol: t.symbol,
                            name: t.name,
                            decimals: t.decimals,
                            logoURI: t.logoURI,
                        })),
                    );
                })
                .catch((err) => {
                    console.warn("Could not load Solana tokens:", err);
                    setSolanaTokens([
                        {
                            address:
                                "So11111111111111111111111111111111111111112",
                            symbol: "SOL",
                            name: "Solana",
                            decimals: 9,
                            isNative: true,
                        },
                        {
                            address:
                                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                            symbol: "USDC",
                            name: "USD Coin",
                            decimals: 6,
                        },
                    ]);
                });
        }
    }, [activeTab, solanaTokens.length]);

    // Form State
    const [tokenIn, setTokenIn] = useState<Token | null>(null);
    const [tokenOut, setTokenOut] = useState<Token | null>(null);
    const [amountIn, setAmountIn] = useState("");
    const [slippage, setSlippage] = useState("0.5");

    // Auto-select defaults when chain changes
    useEffect(() => {
        if (tokens.length >= 3) {
            setTokenIn(tokens[0]); // Native (e.g. tBNB, ETH)
            setTokenOut(tokens[2]); // ERC20 (e.g. BUSD, UNI)
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
        query: { enabled: isEvm && isEvmConnected && !isWrongNetwork },
    });

    const displayBalance = isEvm && evmBalance ? evmBalance.formatted : "0";
    const amountInRaw =
        amountIn && tokenIn
            ? parseUnits(amountIn, tokenIn.decimals)
            : undefined;

    const hasInsufficientBalance = useMemo(() => {
        if (!amountInRaw || !tokenIn || isSolana) return false;
        if (!evmBalance) return true;
        return amountInRaw > evmBalance.value;
    }, [amountInRaw, evmBalance, tokenIn, isSolana]);

    // Quotes
    const { quote: evmQuoteOut, loading: evmQuoteLoading } = useEvmQuote(
        isEvm ? expectedChainId : undefined,
        tokenIn?.address,
        tokenOut?.address,
        amountInRaw,
    );

    const {
        quote: solQuote,
        quoteAmountOut: solQuoteOut,
        loading: solQuoteLoading,
    } = useSolanaQuote(
        isSolana ? tokenIn?.address : undefined,
        isSolana ? tokenOut?.address : undefined,
        amountInRaw,
    );

    const loadingQuote = isEvm ? evmQuoteLoading : solQuoteLoading;
    const quoteOutRaw = isEvm ? evmQuoteOut : solQuoteOut;
    const amountOutDisplay =
        quoteOutRaw && tokenOut
            ? formatUnits(quoteOutRaw, tokenOut.decimals)
            : "";

    // Approvals (EVM only)
    const feeRouterAddress = isEvm
        ? getFeeRouterAddress(expectedChainId)
        : undefined;
    const { needsApproval, approve, approving } = useTokenAllowance(
        isEvm ? tokenIn?.address : undefined,
        feeRouterAddress,
        amountInRaw,
    );

    // Swapping
    const {
        state: evmSwapState,
        execute: executeEvmSwap,
        reset: resetEvmSwap,
    } = useSwap();
    const {
        state: solSwapState,
        execute: executeSolSwap,
        reset: resetSolSwap,
    } = useSolanaSwap();

    const swapState = isEvm ? evmSwapState : solSwapState;

    // Derived calculations for Swap Details
    const feeRaw = amountInRaw ? (amountInRaw * 15n) / 10000n : null;
    const feeDisplay =
        feeRaw && tokenIn ? formatUnits(feeRaw, tokenIn.decimals) : null;

    const slippageBps = parseFloat(slippage || "0.5") * 100;
    const minReceivedRaw = quoteOutRaw
        ? (quoteOutRaw * BigInt(10000 - Math.floor(slippageBps))) / 10000n
        : null;
    const minReceivedDisplay =
        minReceivedRaw && tokenOut
            ? formatUnits(minReceivedRaw, tokenOut.decimals)
            : null;

    // Actions
    const handleConnect = () => {
        if (isEvm) openConnectModal?.();
        else setSolanaModalVisible(true);
    };

    const handleSwap = async () => {
        if (isEvm && tokenIn && tokenOut && amountInRaw && minReceivedRaw) {
            await executeEvmSwap(
                expectedChainId,
                tokenIn.address,
                tokenOut.address,
                amountInRaw,
                minReceivedRaw,
                evmAddress!,
            );
        } else if (isSolana && solQuote) {
            await executeSolSwap(solQuote);
        }
    };

    const flipTokens = () => {
        setTokenIn(tokenOut);
        setTokenOut(tokenIn);
        setAmountIn("");
        if (isEvm) resetEvmSwap();
        else resetSolSwap();
    };

    const isConnected = isEvm ? isEvmConnected : isSolanaConnected;
    const disableSwap =
        !amountInRaw ||
        amountInRaw === 0n ||
        !quoteOutRaw ||
        hasInsufficientBalance;

    return (
        <div className="w-full max-w-[480px] mx-auto mt-20 glass-card p-6 flex flex-col min-h-[400px]">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Swap</h2>
                <div className="text-sm font-medium text-text-muted bg-surface-light px-3 py-1 rounded-lg border border-border">
                    {activeTab.toUpperCase()}
                </div>
            </div>

            <div className="relative">
                <TokenAmountInput
                    label="You pay"
                    amount={amountIn}
                    onAmountChange={(val) => {
                        setAmountIn(val);
                        if (swapState === "SUCCESS" || swapState === "ERROR")
                            isEvm ? resetEvmSwap() : resetSolSwap();
                    }}
                    token={tokenIn}
                    onTokenSelect={setTokenIn}
                    tokens={tokens}
                    balance={displayBalance}
                    onMax={() => setAmountIn(displayBalance)}
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
                        loading={loadingQuote}
                    />
                </div>
            </div>

            {amountInRaw && quoteOutRaw && (
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
                needsApproval={isEvm && needsApproval}
                hasInsufficientBalance={hasInsufficientBalance}
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
