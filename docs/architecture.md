# Architecture Decisions (Phase 0)

## Per-chain fee-collection strategy

There is **no single mechanism** that works identically across all three
chains. Locking this in now avoids overpromising "3 identical forked DEXs"
to the client.

| Chain | Mechanism | Why |
|---|---|---|
| **BSC** | Fork PancakeSwap's Router pattern; deploy our own `FeeRouter.sol` that skims a fee then calls into the real PancakeSwap Router for the swap itself. | Full on-chain custom fee control is cheap enough on BSC to justify a real contract deployment. |
| **Ethereum** | Do **not** deploy a full router fork. Wrap Uniswap V2/V3 Router in a thin `EthFeeRouter.sol`, or alternatively take the fee via a `feeRecipient`-style param if routing through 0x/1inch. | ETH mainnet gas makes a full custom router meaningfully more expensive per swap; most teams avoid it. |
| **Solana** | Integrate the **Jupiter Aggregator API/SDK** directly. No contract deployment. Fee is collected via Jupiter's native `platformFeeBps` parameter, paid into an Associated Token Account (ATA) we own. | There is no Solana AMM equivalent to "fork" the way PancakeSwap/Uniswap can be forked — Jupiter already aggregates all Solana DEX liquidity. |

**Client-facing framing:** "BSC and Ethereum get a custom smart contract
that wraps the existing DEX router and takes your fee on-chain. Solana
gets a direct integration with Jupiter, the standard aggregator every
serious Solana swap product uses — there's no equivalent of 'forking a
DEX' on Solana, and trying to build one from scratch would mean worse
pricing and liquidity than just using Jupiter."

## Monorepo layout

```
multichain-dex/
├── contracts/    # Hardhat + Solidity — BSC FeeRouter, ETH EthFeeRouter (Phase 1-2)
├── solana/       # Jupiter API integration scripts/SDK usage (Phase 3)
├── frontend/     # Next.js swap UI, wallets for all 3 chains (Phase 5-6)
└── docs/         # Architecture notes + deployment address log
```

Each workspace has its own `package.json`, `.env.example`, and lifecycle —
they're wired together via npm workspaces at the root so shared tooling
(linting, CI) can run from one place, but each can also be developed and
tested independently.

## Fee parameter (applies to all 3 chains)

- Fee: **0.15%** (`feeBps = 15` in basis-points terms, where 10_000 = 100%).
- BSC/ETH: enforced on-chain in the router wrapper, with an `onlyOwner`
  adjustment function capped at a hard max (proposed: 1%) — see Phase 1.
- Solana: passed as `platformFeeBps=15` to Jupiter's `/quote` and `/swap`
  endpoints — see Phase 3.

## Phase 3 update: Jupiter API specifics

The Solana approach above (Jupiter integration, no fork) held up as
planned. Two specifics worth flagging that weren't knowable until
actually integrating:

- Jupiter deprecated the old `quote-api.jup.ag/v6` endpoint on
  1 Oct 2025 — current API is `api.jup.ag/swap/v1/*` and requires a free
  API key even on the free tier. See `docs/testing-phase3.md`.
- Jupiter has no real liquidity on Solana devnet, so genuine end-to-end
  swap testing requires either real mainnet funds (small amounts) or
  accepting that this specific piece stays untested until mainnet
  deployment. Also in `docs/testing-phase3.md`.