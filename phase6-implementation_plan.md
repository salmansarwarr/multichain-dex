# Phase 6 — Swap UI

Build the complete swap interface wired to the live testnet contracts and Jupiter API.

---

## Architecture

### EVM Swap Flow (BSC + Ethereum)

The contracts expose two entry points:

| Scenario | Function | Value sent |
|---|---|---|
| Native → Token (BNB/ETH) | `swapExactETHForTokensWithFee(amountOutMin, path, to, deadline)` | `msg.value` = full input |
| Token → Token | `swapExactTokensForTokensWithFee(amountIn, amountOutMin, path, to, deadline)` | 0 (needs prior ERC-20 approval) |

**Quote source:** direct on-chain read via `getAmountsOut(amountIn, path[])` on the underlying V2 router — no off-chain API needed.

**Fee preview math:** `fee = amountIn * 15 / 10000`. The contract skims the fee first, so the quote is computed on `amountIn - fee`.

### Solana Swap Flow

Uses Jupiter Quote API v6:
- `GET /quote?inputMint=...&outputMint=...&amount=...&platformFeeBps=15&feeAccount=...`
- `POST /swap` → get serialized transaction
- Sign + send via `@solana/web3.js`

### Quote Debouncing

All fetches debounced 400 ms. Loading spinner in output field while pending.

---

## Token Lists

| Chain | Source |
|---|---|
| BSC Testnet | Curated short list (tBNB, BUSD, CAKE) — hardcoded in `src/data/tokens.ts` |
| Ethereum Sepolia | Curated short list (ETH, UNI, LINK) — hardcoded |
| Solana Devnet | Jupiter strict list fetched at runtime, cached |

> [!NOTE]
> Full dynamic token lists (PancakeSwap + Uniswap JSON) will be added in Phase 8. For Phase 6, curated lists keep testing fast and predictable.

---

## Component Architecture

```
SwapCard (replaces placeholder)
├── TokenAmountInput  ("You pay")
│   ├── TokenSelector (modal with search)
│   └── NumericInput
├── SwapDirectionButton (↕ flip)
├── TokenAmountOutput ("You receive")
│   ├── TokenSelector
│   └── QuoteDisplay (read-only)
├── SwapDetails (collapsible)
│   ├── Fee line item (0.15% = X tokens)
│   ├── Price impact
│   ├── Minimum received
│   └── Slippage tolerance setting
└── SwapButton (state machine driven)
```

---

## Swap State Machine

```
IDLE → [amount typed]
  → QUOTING
    → QUOTED
      → [Swap clicked]
        → NEEDS_APPROVAL (token→token only)
          → APPROVING → SWAPPING
        → SWAPPING (native→token, skip approval)
          → SUCCESS (tx hash + explorer link)
          → ERROR (friendly message)
```

---

## Proposed Changes

### ABIs — `src/abis/`

#### [NEW] `FeeRouter.ts`
Minimal ABI: `swapExactETHForTokensWithFee`, `swapExactTokensForTokensWithFee`, `SwapExecuted` event.

#### [NEW] `EthFeeRouter.ts`
Same + `uniswapRouter()` getter.

#### [NEW] `ERC20.ts`
`approve`, `allowance`, `decimals`, `symbol`, `balanceOf`.

#### [NEW] `V2Router.ts`
`getAmountsOut`, `WETH`.

---

### Data & Config

#### [NEW] `src/data/tokens.ts`
`Token` interface + per-chain curated lists.

#### [NEW] `src/config/contracts.ts`
Deployed addresses keyed by chain ID (reads from `NEXT_PUBLIC_*` env vars).

---

### Hooks — `src/hooks/`

#### [NEW] `useEvmQuote.ts`
Calls `getAmountsOut`, returns `{ quote, loading, error }`. Debounced 400 ms.

#### [NEW] `useSolanaQuote.ts`
Calls Jupiter `/quote` with `platformFeeBps=15`, returns `{ quote, loading, error }`.

#### [NEW] `useTokenAllowance.ts`
Reads ERC-20 allowance. Returns `{ needsApproval, approve, approving }`.

#### [NEW] `useSwap.ts`
Orchestrates EVM state machine: approve → swap. Returns `{ state, execute, txHash, error, reset }`.

#### [NEW] `useSolanaSwap.ts`
Jupiter `/swap` → sign → send → confirm. Returns same shape.

#### [NEW] `useSwapHistory.ts`
Reads `SwapExecuted` events via `getLogs` (last 1000 blocks, filtered by user address).

---

### Components — `src/components/swap/`

#### [MODIFY] `src/components/ui/SwapCard.tsx`
Replace placeholder shell with the full assembled swap form.

#### [NEW] `TokenSelector.tsx`
Search modal listing tokens for the active chain.

#### [NEW] `TokenAmountInput.tsx`
Numeric input + token selector button + MAX button + balance.

#### [NEW] `SwapDetails.tsx`
Collapsible: fee, price impact, min received, slippage input.

#### [NEW] `SwapButton.tsx`
Renders differently per state: Connect Wallet / Switch Network / Insufficient Balance / Approve / Approving… / Swap / Swapping…

#### [NEW] `SwapHistory.tsx`
Table of recent `SwapExecuted` events for the connected wallet.

---

### Pages

#### [MODIFY] `src/app/page.tsx`
Add `<SwapHistory>` below swap card (hidden if no wallet connected).

---

## Verification Plan

### Build
```bash
cd frontend && npm run build
```

### Manual test matrix

| Chain | Scenario | Expected |
|---|---|---|
| BSC Testnet | 0.001 tBNB → BUSD | Quote shows, swap executes, success toast + tx link |
| BSC Testnet | BUSD → tBNB (token input) | Approve step shown, then swap |
| Sepolia | 0.001 ETH → UNI | Quote shows, swap executes |
| Solana Devnet | SOL → USDC | Jupiter quote shows, swap executes |
| Any | No wallet | Button says "Connect Wallet" |
| Any | Wrong network | Button says "Switch Network" |
| Any | Balance too low | Button says "Insufficient Balance", disabled |
| Any | Slippage exceeded | Error toast with clear message |

---

## Open Questions

> [!IMPORTANT]
> **Solana fee account ATA**: Jupiter requires a pre-created Associated Token Account for your fee wallet for each output token. For SOL→USDC on devnet, the USDC ATA for your fee wallet must exist first. Do you already have this? If not, I'll add a one-time setup script in `/solana`.
