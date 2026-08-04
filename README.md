# Multi-Chain DEX Swap Platform

BSC (PancakeSwap fork + fee wrapper) · Ethereum (Uniswap fee wrapper) ·
Solana (Jupiter Aggregator integration). Custom 0.15% fee across all
three chains, branded UI, deployed on a subdomain.

This repo follows a phased build plan — see the implementation plan doc
for the full phase-by-phase breakdown. **Phases completed so far: 0
(architecture + environment setup), 1 (BSC FeeRouter contract), 2
(Ethereum EthFeeRouter contract), 3 (Solana / Jupiter integration).**

## Structure

```
multichain-dex/
├── contracts/    # Hardhat + Solidity workspace (BSC + ETH fee routers)
├── solana/       # Jupiter API integration scripts
├── frontend/     # Next.js swap UI (scaffolded starting Phase 5)
└── docs/
    ├── architecture.md    # Phase 0 architecture decisions
    └── deployments.md     # Deployed contract addresses (from Phase 4)
```

See `docs/architecture.md` for why each chain uses a different
fee-collection mechanism — this is intentional, not an oversight.

## Setup

```bash
# From repo root
npm install   # installs all 3 workspaces via npm workspaces

# Copy env templates and fill in real values (never commit the real files)
cp contracts/.env.example contracts/.env
cp solana/.env.example solana/.env
cp frontend/.env.example frontend/.env.local
```

## Phase 0 validation gate

```bash
# 1. Contracts compile clean (no real .sol files yet — expect "Nothing to compile")
npm run compile --workspace=contracts

# 2. RPC connectivity — BSC Testnet + Sepolia
npm run check:rpc --workspace=contracts

# 3. RPC connectivity — Solana devnet
npm run check:rpc --workspace=solana

# 4. Jupiter API sandbox reachability
npm run check:jupiter --workspace=solana
```

All four should pass (or clearly report which env var is missing) before
moving to Phase 1.

## Phase 1 — BSC FeeRouter

`contracts/contracts/FeeRouter.sol` wraps a PancakeSwap-compatible
Router02, skims a configurable fee (basis points, hard-capped at 1%) off
the swap's input amount, forwards the fee to `feeWallet`, then executes
the swap for the remainder. Owner-only fee/wallet adjustment, `Pausable`
emergency stop, `ReentrancyGuard`, `SafeERC20` throughout.

```bash
cd contracts
npm test              # 34/34 unit tests (runs both routers' suites together)
npm run gas-report     # gas benchmark — see docs/gas-report-phase1.md
npm run audit:slither  # static analysis — see docs/testing-phase1.md
```

See `docs/testing-phase1.md` for the full validation-gate writeup,
including the BSC-mainnet-fork test (real PancakeSwap swap against live
liquidity) — that one needs an archive RPC and hasn't been run inside this
sandbox, only written and reviewed.

## Phase 2 — Ethereum EthFeeRouter

`contracts/contracts/EthFeeRouter.sol` wraps Uniswap V2 Router02 (not V3
— see `docs/testing-phase2.md` for why). Same fee-skim pattern as
Phase 1's FeeRouter, plus explicit handling for fee-on-transfer
(deflationary/reflection) tokens on both the input and output side:

- Input side: fee is computed off the *actually received* balance-delta,
  not the nominal `amountIn` — safe even if `path[0]` itself taxes transfers.
- Output side: `swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens`
  / `swapExactETHForTokensWithFeeSupportingFeeOnTransferTokens` call
  Uniswap's own FeeOnTransfer-supporting functions for tokens that tax the
  output leg too.

```bash
cd contracts
npm test                  # 34/34 unit tests (both routers)
npm run gas-report         # see docs/gas-report-phase2.md
npm run audit:slither      # see docs/testing-phase2.md
```

See `docs/testing-phase2.md` for the full gate writeup, including the
Ethereum-mainnet-fork test (real WETH → USDC swap against live Uniswap V2
liquidity) — same caveat as Phase 1's fork test: written and reviewed,
not executed in this sandbox (no Ethereum RPC egress here).

## Phase 3 — Solana / Jupiter integration

`solana/src/jupiterService.ts` integrates with Jupiter's **current** Swap
API (`api.jup.ag/swap/v1/*`) — not the old `quote-api.jup.ag/v6` endpoint
you'll see in a lot of older tutorials, which Jupiter deprecated on
1 Oct 2025. Requires a free API key from https://portal.jup.ag.

Two important findings from this phase, both documented in
`docs/testing-phase3.md`:

1. **The API migration above** — Phase 0's `check-jupiter.ts` targeted the
   deprecated endpoint and has been fixed.
2. **Jupiter has no real devnet liquidity**, so the plan's "devnet test
   script" isn't achievable as literally written. The gate item is split
   into what's honestly testable (fee-param wiring, illiquid-pair error
   handling, ATA creation — all real, run against live/mocked interfaces)
   plus an opt-in **mainnet** smoke test that uses a small amount of real
   SOL, since there's no synthetic substitute for real Jupiter liquidity.

```bash
cd solana
npm test                        # 9/9 unit tests, mocked fetch, no network needed
npm run check:jupiter           # reachability (needs JUPITER_API_KEY)
npm run quote:check             # fee wiring + illiquid-pair handling (needs JUPITER_API_KEY)

# Opt-in, real mainnet funds — see docs/testing-phase3.md before running:
RUN_MAINNET_SWAP_TEST=true npx tsx scripts/mainnet-swap-smoke-test.ts
```

## Secrets

- Never commit `.env`, `.env.local`, or any file with a real private key
  or API key. `.gitignore` already excludes these; only `.env.example`
  files are tracked.
- Use a dedicated throwaway wallet for testnet deployer keys.
- The mainnet fee-adjustment owner key should be a multisig (e.g. Gnosis
  Safe), not a raw EOA — see Phase 9.