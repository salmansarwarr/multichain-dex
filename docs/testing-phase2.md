# Phase 2 — Testing & Static Analysis Notes

## Design decision: Uniswap V2 Router02, not V3

Per the plan's own Phase 2 guidance, went with the simpler V2-style router
rather than V3 (which needs pool `fee`-tier params and a more complex ABI).
`EthFeeRouter.sol` wraps `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`
(Uniswap V2 Router02 on Ethereum mainnet). Revisit if the client specifically
needs V3-only pools/pairs.

## Fee-on-transfer token handling

This is the one place EthFeeRouter meaningfully differs from Phase 1's
FeeRouter, per the Phase 2 gate's explicit requirement to test this:

- **Input side**: `_pullAndSkimFee` measures the actual `balanceOf` delta
  after `safeTransferFrom`, not the caller-supplied `amountIn`. If
  `path[0]` is a deflationary/reflection token that takes a cut on
  transfer, the fee is computed off what was *actually received*, and the
  contract never tries to approve/forward more than it actually holds.
- **Output side**: two additional entry points —
  `swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens` and
  `swapExactETHForTokensWithFeeSupportingFeeOnTransferTokens` — call
  Uniswap's own `...SupportingFeeOnTransferTokens` functions, which don't
  return an `amounts` array (Uniswap itself can't know the exact output in
  advance for such tokens); slippage protection relies entirely on
  `amountOutMin` for these two functions.

Caller/frontend responsibility: pick the right entry point for the pair
being swapped. The plain `swapExactTokensForTokensWithFee` is cheaper but
will under-swap or revert unexpectedly against a deflationary output
token; the SupportingFeeOnTransferTokens variant should be the default
whenever the frontend doesn't already know a token is "well-behaved"
(fixed supply, no rebasing/tax).

## Unit tests

```bash
cd contracts
npm test
```

24/24 passing across both routers. EthFeeRouter-specific coverage:

| Gate item | Test(s) |
|---|---|
| Normal swap | `Normal ERC20 swap > ...` |
| Fee-on-ETH swap | `Fee-on-ETH (native) swap > ...` |
| Zero-amount revert | `Zero-amount revert > ...` (both paths) |
| Fee-cap revert | `Fee-cap revert > ...` (+ ownership checks) |
| Paused-state revert | `Paused-state revert > ...` |
| **Fee-on-transfer handling** | `Fee-on-transfer token handling (Phase 2 gate item) > ...` — both the input-side balance-delta case (2% deflationary `tokenIn`) and the output-side SupportingFeeOnTransferTokens path (3% deflationary `tokenOut`) |

Note: EthFeeRouter's reentrancy protection is architecturally identical to
FeeRouter's (same `nonReentrant` + raw `.call` pattern), already proven
against a real attack contract in Phase 1 — not re-duplicated here to
avoid redundant test maintenance, but flag if you'd like an explicit
EthFeeRouter-specific version too.

## Gas report

See `docs/gas-report-phase2.md`. Regenerate with:

```bash
cd contracts
REPORT_GAS=true npx hardhat test
```

## Static analysis (Slither)

```bash
cd contracts
npm run audit:slither
```

**Result: zero High/Medium findings on production code** (`FeeRouter.sol`,
`EthFeeRouter.sol`, both interfaces). Two findings needed review this
phase:

1. **`arbitrary-send-eth`** on both routers' `feeWallet.call{value:...}`
   line — reviewed as a false positive in Phase 1 (destination is
   owner-gated via `setFeeWallet`/`onlyOwner`, never attacker-controlled)
   and suppressed with a `slither-disable-next-line` + one-line comment.
2. **`incorrect-equality`** on `EthFeeRouter._pullAndSkimFee`'s
   `received == 0` check — also a false positive (plain zero-check on a
   same-transaction balance delta, not equality against some externally
   manipulable expected amount), suppressed the same way.

**Formatting gotcha worth knowing**: Slither's `slither-disable-next-line`
only suppressed the finding when the directive comment was the single
line immediately touching the code — putting explanatory prose on
additional comment lines *above* the directive works fine, but explanatory
lines placed *between* the directive and the code silently broke
suppression (confirmed by testing both orderings against a clean
`hardhat clean` rebuild). If you add new suppressions later, keep the
`// slither-disable-next-line <detector>` line directly adjacent to the
flagged code.

Full breakdown:

| Scope | High | Medium | Low | Informational |
|---|---|---|---|---|
| Everything (incl. test mocks) | 1 | 3 | 13 | 29 |
| **Production contracts only** | **0** | **0** | 5 | 23 |

The remaining High/Medium in the "everything" scope live entirely in
`MockPancakeRouter.swapExactTokensForETH` (unused by FeeRouter) and
`MaliciousFeeWallet` (intentional reentrancy-attack simulator) — same as
Phase 1, nothing new introduced by Phase 2's mocks.

Full JSON reports: `contracts/audit/slither-full-report.json` and
`contracts/audit/slither-production-only-report.json` (now cover both
routers).

## Mainnet fork test (manual gate item)

`contracts/test/fork/EthFeeRouter.fork.test.ts` — real WETH → USDC swap
through `EthFeeRouter` against live Uniswap V2 liquidity on a pinned
Ethereum mainnet block. Same pattern as Phase 1's BSC fork test:
self-funds via `WETH.deposit()` rather than depending on a whale address,
and has **not been run in this sandbox** (no Ethereum RPC egress here) —
written and reviewed only.

```bash
ETH_MAINNET_ARCHIVE_RPC_URL=https://your-archive-rpc \
FORK_BLOCK_NUMBER=20000000 \
RUN_FORK_TESTS=true \
npx hardhat test test/fork/EthFeeRouter.fork.test.ts
```

All three addresses used (`UNISWAP_V2_ROUTER02`, `WETH`, `USDC`) were
verified via web search against live block-explorer results and checked
against `ethers.getAddress()`'s strict EIP-55 checksum before being written
into this file — see the Phase 1 BSC fork test's address bugs (two
transcription errors, each a dropped trailing character) for why that
verification step matters here.x