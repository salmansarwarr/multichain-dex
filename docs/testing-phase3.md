# Phase 3 — Solana / Jupiter Integration Notes

## Important: Jupiter API migration (discovered during this phase)

Jupiter deprecated the old, key-free `quote-api.jup.ag/v6/quote` and
`/swap` endpoints on **1 October 2025** (confirmed via Jupiter's own
DevRel announcement). Phase 0's `check-jupiter.ts` was written against
that old endpoint — it has been **updated in this phase** to use the
current API:

| | Old (deprecated) | Current |
|---|---|---|
| Quote | `quote-api.jup.ag/v6/quote` | `api.jup.ag/swap/v1/quote` |
| Swap | `quote-api.jup.ag/v6/swap` | `api.jup.ag/swap/v1/swap` |
| Auth | none required | **`x-api-key` header required**, even free tier |

Get a free key at [portal.jup.ag](https://portal.jup.ag) (the "Jupiter
Developer Platform") and set `JUPITER_API_KEY` in `solana/.env`. Without
it, every call in `src/jupiterService.ts` fails fast with a
`JupiterConfigError` before any network request — see "fail-fast config
validation" below.

`platformFeeBps` / `feeAccount` still work exactly as the Phase 0
architecture doc assumed: `platformFeeBps` goes on the `/quote` request,
`feeAccount` (any valid token account — no referral program setup needed
since Jan 2025) goes on the `/swap` request. Confirmed against Jupiter's
current OpenAPI reference, not assumed from memory.

## Important: no Jupiter liquidity on devnet (scope correction)

The original plan calls for a "devnet test script" that does
quote → sign → submit → confirm end-to-end. **This isn't actually
achievable as written** — Jupiter's Swap API only routes against real
mainnet liquidity. There's no meaningful Jupiter devnet routing to test
against (devnet SPL tokens have no real pools for Jupiter to aggregate
across).

This is the same category of constraint Phase 0's architecture doc
already flagged for the on-chain side ("Solana isn't a fork, it's a
Jupiter integration") — it turns out the same limitation applies to
*testing*, not just production. Rather than silently working around this
or producing a script that looks like it tests something it doesn't, the
gate item has been split into what's honestly achievable:

| Gate item | How it's actually covered |
|---|---|
| Fee param wiring (`platformFeeBps` → `feeAccount`) | `scripts/quote-and-fee-check.ts` — real quote request, confirms Jupiter echoes back the correct `platformFee` |
| Illiquid/failed-quote handling | Same script — deliberately invalid pair, confirms a typed `JupiterApiError`, not a crash |
| End-to-end swap + fee account balance change | `scripts/mainnet-swap-smoke-test.ts` — **real mainnet swap, tiny real amount, opt-in only** (see below) |
| ATA creation for fee collection | `src/feeAccount.ts` — works on devnet or mainnet (this part has no Jupiter dependency, it's plain SPL token account creation) |

If you want a devnet-only smoke test, it can only cover the ATA-creation
and RPC-connectivity parts, not an actual Jupiter swap — happy to build
that as a separate lighter-weight script if useful, but it wouldn't
touch Jupiter at all.

## Fail-fast config validation

Both `getQuote()` and `getSwapTransaction()` throw a `JupiterConfigError`
immediately if `JUPITER_API_KEY` is missing — before making any network
call. `getSwapTransaction()` also throws `JupiterConfigError` if the
quote has a `platformFee` but no `feeAccount` was provided, catching a
likely integration mistake with a clear message instead of letting
Jupiter's API reject it less legibly.

## Error handling: typed errors, not crashes

`JupiterApiError` wraps any non-2xx response from Jupiter's API
(including the "no route found" case for an illiquid/disconnected pair —
the Phase 3 gate's explicit "graceful error" requirement) with the HTTP
status and Jupiter's own error message, parsed safely even if the error
body isn't valid JSON. Callers can `instanceof` check to distinguish
"Jupiter rejected this request" from a plain network-level failure.

## Unit tests (real, run in this build)

```bash
cd solana
npm test
```

9/9 passing, using Node's built-in test runner (`node:test`) with
`global.fetch` mocked per-test — no real network calls, runs offline:

| Coverage | Test(s) |
|---|---|
| Fail-fast config validation | `config validation > ...` (both missing API key, and missing feeAccount when platformFee is set) |
| Quote parsing | `getQuote > parses a successful quote response correctly` |
| Graceful error handling | `getQuote > throws a typed JupiterApiError...` (both a clean error body and a non-JSON error body) |
| Swap request shape | `getSwapTransaction > posts the correct body shape including feeAccount` |
| Fee math | `fee math helpers > ...` — including a round-trip check that fee + user receipt reconstitute the original `outAmount` |

This is the same "aggressively test what's actually testable without
network access" approach as Phases 1-2's mock-based unit tests, adapted
to a workspace that isn't a Hardhat project.

## Scripts requiring real network access (not run in this sandbox)

This sandbox's egress allowlist doesn't include `api.jup.ag` or any
Solana RPC host — confirmed by testing (`check-jupiter.ts` gets a 403
from the sandbox's own egress proxy once a fake API key clears the
config-validation step, i.e. it's reaching for the network correctly,
just blocked by this environment specifically). Run these for real on
your machine:

```bash
# Reachability + fee wiring + illiquid-pair handling (read-only, no funds needed)
npm run check:jupiter --workspace=solana
npm run quote:check --workspace=solana

# RPC connectivity (from Phase 0, still relevant)
npm run check:rpc --workspace=solana
```

### Mainnet swap smoke test — real funds, opt-in only

```bash
RUN_MAINNET_SWAP_TEST=true npx tsx scripts/mainnet-swap-smoke-test.ts
```

This executes a **real swap on Solana mainnet** with a small **real**
amount (default 0.01 SOL) from a wallet you fund yourself. It is not
wired into `npm test`, has an explicit `RUN_MAINNET_SWAP_TEST=true` gate,
and has **not been run by Claude anywhere** — this is the one piece of
Phase 3 that fundamentally requires a human to deliberately spend real
money to fully close out, since there's no synthetic substitute for real
Jupiter liquidity. Required env vars are documented in the script's
header comment and in `.env.example`.

## Associated Token Account (fee collection) notes

`src/feeAccount.ts` wraps `@solana/spl-token`'s own
`getOrCreateAssociatedTokenAccount` — no custom on-chain logic, just our
usage pattern (fee wallet as owner, one ATA per collected mint). Since
Jupiter pays fees in whatever token comes out of the swap (not
auto-converted — confirmed in Phase 0 and again here), you'll need one
fee ATA per distinct output mint you expect to route swaps into. The
`payer` funding account creation doesn't have to be the fee wallet
itself — useful if you want an ops/deployer wallet to pay rent while the
fee wallet purely owns the resulting accounts.