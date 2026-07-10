# Phase 1 — Testing & Static Analysis Notes

## Unit tests

```bash
cd contracts
npm test
```

12/12 passing, covering every scenario in the Phase 1 validation gate:

| Gate item | Test(s) |
|---|---|
| Normal swap | `Normal ERC20 swap > skims exactly the configured fee...` |
| Fee-on-BNB swap | `Fee-on-BNB (native) swap > skims exactly the configured fee from msg.value...` |
| Zero-amount revert | `Zero-amount revert > ...` (both ERC20 and native paths) |
| Fee-cap revert | `Fee-cap revert > reverts setFeeBps above MAX_FEE_BPS` (+ boundary + ownership checks) |
| Reentrancy attempt | `Reentrancy attempt > blocks a malicious fee wallet from re-entering...` |
| Paused-state revert | `Paused-state revert > blocks both swap entry points while paused...` |

## Gas report

See `docs/gas-report-phase1.md`. Regenerate with:

```bash
cd contracts
REPORT_GAS=true npx hardhat test
```

## Static analysis (Slither)

```bash
pip install slither-analyzer --break-system-packages
cd contracts
slither . --hardhat-ignore-compile --filter-paths "mocks/"
```

**Result: zero High/Medium findings on production code** (`FeeRouter.sol`
+ `interfaces/IPancakeRouter02.sol`). Full breakdown:

| Scope | High | Medium | Low | Informational |
|---|---|---|---|---|
| Everything (incl. test mocks) | 1 | 2 | 6 | 24 |
| **Production contracts only** | **0** | **0** | 2 | 20 |

The 1 High + 2 Medium findings that show up when mocks are included are
*inside our own test-only attacker/mock contracts*
(`MockPancakeRouter.swapExactTokensForETH` — unused by FeeRouter — and
`MaliciousFeeWallet`, our intentional reentrancy-attack simulator). Neither
ships to any real network.

Remaining Low/Informational items on production code are style-level
(unindexed event address params, low-level-call-without-explicit-check on
the intentional `feeWallet.call{value: feeAmount}("")`, multiple pragma
versions pulled in transitively by OpenZeppelin) — none represent an
exploitable issue. Full JSON reports saved at:
- `contracts/audit/slither-full-report.json`
- `contracts/audit/slither-production-only-report.json`

Re-run Slither after any future contract change (this is a hard
requirement in Phase 9 before mainnet, but cheap enough to do on every
phase).

## Mainnet fork test (manual gate item)

`contracts/test/fork/FeeRouter.fork.test.ts` executes a **real** WBNB → BUSD
swap through `FeeRouter` against live PancakeSwap V2 liquidity on a pinned
BSC mainnet block, then asserts the fee wallet's WBNB balance increased by
exactly 0.15% of `amountIn`.

**This has not been run in this build environment** — the sandbox's network
egress allowlist doesn't include BSC RPC providers. The test is written,
type-checks, and is properly skipped (`pending`) by default so it doesn't
block `npm test`. To actually close out this gate item, run it from your
own machine or CI with an archive-capable BSC RPC:

```bash
BSC_MAINNET_ARCHIVE_RPC_URL=https://your-archive-rpc \
FORK_BLOCK_NUMBER=40000000 \
RUN_FORK_TESTS=true \
npx hardhat test test/fork/FeeRouter.fork.test.ts
```

Notes:
- Needs an **archive-enabled** RPC (Alchemy/QuickNode/Ankr paid tiers
  usually support this; most free public BSC RPCs don't serve old block
  state).
- Pick a recent-ish `FORK_BLOCK_NUMBER` (check BscScan for the current
  height and go back a few thousand blocks) so the whale address used to
  fund the test account still holds a real WBNB balance at that block —
  verify on BscScan first if the test fails on the whale-funding step.
- If a chosen whale is no longer suitable (balance moved out), swap in a
  different address — a top WBNB holder from BscScan's token holder list
  works.