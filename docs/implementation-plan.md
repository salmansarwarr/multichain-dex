# Multi-Chain DEX Swap Platform — Implementation Plan
(BSC PancakeSwap fork + Ethereum Uniswap + Arbitrum One SushiSwap V2, custom 0.15% fee, branded UI, Hostinger subdomain deployment)

This plan is broken into phases. Each phase has: **Goal → Claude Code Tasks → Deliverables → Test/Validation Gate**. Do not move to the next phase until the gate passes. Feed one phase at a time to Claude Code as its own session/task so context stays clean.

---

## Phase 0 — Architecture & Environment Setup

**Goal:** Lock decisions before writing code, since "3 blockchains" means 3 different fee-collection mechanisms.

**Key architecture decision (important):**
- **BSC**: You can fork PancakeSwap's Router contract (Solidity) and add a fee-skim wrapper — full on-chain custom fee control.
- **Ethereum**: Same pattern, wrapping Uniswap V2/V3 Router — but ETH gas is expensive, so most teams route through 0x/1inch and take fee via `feeRecipient` param instead of deploying a full router fork.
- **Arbitrum**: Arbitrum is an EVM L2 — the same Solidity `EthFeeRouter.sol` deploys unchanged. Arbitrum uses SushiSwap V2 (Uniswap V2-compatible ABI) as the default DEX for this integration. No separate integration layer needed — just deploy and point to the SushiSwap router address on Arbitrum One.

So realistically: BSC = smart contract fork + fee wrapper. Ethereum = fee wrapper around Uniswap router. Arbitrum = same EthFeeRouter.sol deployed on Arbitrum One against SushiSwap V2 router — full on-chain fee control, EVM-native. Flag this to your client explicitly — it avoids overpromising.

**Claude Code Tasks:**
1. Init monorepo: `/contracts` (Hardhat, BSC+ETH+ARB), `/frontend` (Next.js), `/docs`.
2. Set up `.env.example` for RPC URLs (BSC mainnet/testnet, Ethereum mainnet/Sepolia, Arbitrum mainnet/Sepolia), fee wallet addresses, WalletConnect project ID.
3. Set up Hardhat config for BSC Testnet (chapel) + Ethereum Sepolia + Arbitrum Sepolia.

**Deliverables:** Repo skeleton, working `npx hardhat compile` on empty contracts, `.env.example` committed (never commit real keys).

**Validation Gate:**
- [ ] `hardhat compile` runs clean
- [ ] RPC connectivity test script pings BSC testnet, Sepolia, Arbitrum Sepolia successfully
- [ ] Git repo has `.gitignore` excluding `.env`, `node_modules`, `artifacts`

---

## Phase 1 — BSC Fee Router Smart Contract

**Goal:** Contract that wraps PancakeSwap Router, takes 0.15% fee, forwards to your wallet, executes swap for the remaining amount.

**Claude Code Tasks:**
1. Write `FeeRouter.sol`:
   - Constructor takes `pancakeRouterAddress`, `feeWallet`, `feeBps` (15 = 0.15%).
   - `swapExactTokensForTokensWithFee()` — pulls tokens in, calculates fee, transfers fee to `feeWallet`, calls PancakeSwap router with remainder.
   - `swapExactETHForTokensWithFee()` (payable) — same logic for native BNB swaps.
   - Add `onlyOwner` fee-adjustment function (capped, e.g. max 1%) and pausability (OpenZeppelin `Pausable`).
   - Emit `SwapExecuted(user, tokenIn, tokenOut, amountIn, feeAmount)` event for analytics.
2. Use OpenZeppelin `SafeERC20`, `ReentrancyGuard`.
3. Write Hardhat unit tests: normal swap, fee-on-BNB swap, zero-amount revert, fee-cap revert, reentrancy attempt, paused-state revert.

**Deliverables:** `FeeRouter.sol`, full test suite, gas report.

**Validation Gate:**
- [ ] 100% of unit tests pass (`npx hardhat test`)
- [ ] Slither or MythX static analysis run, zero high/critical findings
- [ ] Manual fork test: `hardhat_reset` forking BSC mainnet at a pinned block, execute a real WBNB→BUSD swap against live PancakeSwap liquidity, confirm fee wallet balance increases by exactly 0.15%
- [ ] Gas cost per swap benchmarked and documented

---

## Phase 2 — Ethereum Fee Router

**Goal:** Same pattern for Uniswap V2/V3.

**Claude Code Tasks:**
1. Decide V2 vs V3 (V3 needs pool `fee` tier param — more complex ABI). Confirm with client which pairs they care about; V2-style router is simpler if pairs are common ones.
2. Port `FeeRouter.sol` logic to `EthFeeRouter.sol` targeting Uniswap V2 Router02 (or V3 SwapRouter if required).
3. Same test suite pattern as Phase 1, forked against Ethereum mainnet via a fork RPC (Alchemy/Infura).

**Deliverables:** `EthFeeRouter.sol` + tests.

**Validation Gate:**
- [ ] Same checklist as Phase 1, run against a mainnet fork
- [ ] Confirm behavior with a fee-on-transfer token (some ERC-20s break naive routers — test explicitly)

---

## Phase 3 — Arbitrum Fee Router Deployment

**Goal:** Deploy `EthFeeRouter.sol` on Arbitrum Sepolia, pointed at the SushiSwap V2 router on Arbitrum.

**Key architecture note:** Arbitrum is EVM-compatible — `EthFeeRouter.sol` is reused without modification. The only change is the constructor argument: `routerAddress` = SushiSwap V2 router on Arbitrum One (`0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506`) or a test router on Arbitrum Sepolia.

**Claude Code Tasks:**
1. Add `arbitrumSepolia` and `arbitrumOne` network configs to `hardhat.config.ts` (already done in Phase 0).
2. Add a parameterized deployment script `deploy/deployArb.ts` targeting the SushiSwap router address.
3. Deploy `EthFeeRouter.sol` to Arbitrum Sepolia (chainId 421614), verify on Arbiscan.
4. Document deployed address in `/docs/deployments.md`.

**Deliverables:** Deployed + verified `EthFeeRouter.sol` on Arbitrum Sepolia. Same contract code as Ethereum — no new Solidity needed.

**Validation Gate:**
- [ ] Contract verified and readable on Arbiscan Sepolia
- [ ] Manual testnet swap executed via script (not UI) on Arbitrum Sepolia, fee received correctly
- [ ] Confirm gas costs vs Ethereum (should be significantly lower on Arbitrum)

---

## Phase 4 — Testnet Deployment of Contracts

**Goal:** Get BSC + ETH + ARB contracts live on public testnets before any frontend work touches them.

**Claude Code Tasks:**
1. Deployment scripts (Hardhat `deploy/` or `scripts/deploy.ts`) parameterized by network.
2. Deploy `FeeRouter` to BSC Testnet, `EthFeeRouter` to Sepolia, `EthFeeRouter` to Arbitrum Sepolia.
3. Verify contracts on BscScan Testnet + Etherscan Sepolia + Arbiscan Sepolia (source verification).
4. Document deployed addresses in `/docs/deployments.md`.

**Validation Gate:**
- [ ] All three contracts verified and readable on block explorers
- [ ] Manual testnet swap executed via a script (not UI yet) on each chain, fee received correctly
- [ ] Ownership/admin functions tested from a non-owner account (must revert)

---

## Phase 5 — Frontend Foundation (Next.js, Multi-Chain Wallets)

**Goal:** Wallet connection across all three EVM chains (BSC, Ethereum, Arbitrum) in one app.

**Claude Code Tasks:**
1. Next.js app, Tailwind, your brand tokens (colors/fonts — define these before UI work starts, see `frontend-design` considerations).
2. EVM wallets via **wagmi + viem** + WalletConnect v2 (covers MetaMask, Trust Wallet, WalletConnect-compatible wallets). Configure chains: BSC, BSC Testnet, Ethereum, Sepolia, Arbitrum One, Arbitrum Sepolia.
3. A single top-level "Network" switcher component toggling the active chain context (tab-based: [BSC] [Ethereum] [Arbitrum]).

**Note:** All three chains are EVM-compatible — a single RainbowKit wallet connects to all of them. No secondary wallet stack needed.

**Deliverables:** Working app where a user can connect MetaMask and switch between BSC, Ethereum, and Arbitrum chains.

**Validation Gate:**
- [ ] Connect/disconnect works for at least 2 EVM wallets (MetaMask + WalletConnect)
- [ ] Chain-switch prompts correctly when wallet is on wrong network
- [ ] Wallet state persists across page refresh (session storage, not local fake state)
- [ ] Mobile wallet deep-linking tested (WalletConnect QR + mobile browser)

---

## Phase 6 — Swap UI

**Goal:** The actual swap interface, wired to your contracts (BSC/ETH/ARB).

**Claude Code Tasks:**
1. Token selector with search (token lists: PancakeSwap default list for BSC, Uniswap default list for ETH, SushiSwap/Arbitrum token list for ARB).
2. Amount input with live quote fetching (debounced), price impact display, slippage tolerance setting.
3. Swap execution flow: approve (ERC-20 allowance) → confirm → pending → success/fail states.
4. Transaction history panel (read from your `SwapExecuted` events on each chain).
5. Fee transparency: show the 0.15% fee line-item in the swap preview (builds trust, also often legally advisable).

**Validation Gate:**
- [ ] Full swap cycle works on BSC testnet through the UI (not scripts) — connect, quote, approve, swap, confirm
- [ ] Same for Sepolia
- [ ] Same for Arbitrum Sepolia
- [ ] Test insufficient-balance, rejected-signature, and slippage-exceeded error states all show clear UI messages, not raw RPC errors
- [ ] Test with a fee-on-transfer/deflationary token (BSC has many) to confirm UI doesn't break

---

## Phase 7 — Hostinger Subdomain Deployment

**Goal:** Get this live on a subdomain of the existing WordPress site.

**Important constraint to flag to your client:** Hostinger shared/WordPress hosting typically only serves static files or PHP — it does **not** run a Next.js Node server natively. Two real options:
- **Option A (recommended):** Deploy the Next.js app to Vercel/Railway/a VPS, then point the subdomain's DNS (A/CNAME record in Hostinger's DNS zone) to that host. WordPress stays untouched on the main domain.
- **Option B:** If they insist everything lives on Hostinger, you need a Hostinger **VPS** plan (not shared hosting) so you can run Node + a reverse proxy (Nginx) yourself.

**Claude Code Tasks:**
1. `next build && next export` if fully static is feasible (it usually isn't, given wallet/RPC calls are client-side anyway — static export often works fine here since there's no server-side secret logic).
2. Set up subdomain DNS record in Hostinger control panel pointing to chosen host.
3. SSL cert (Let's Encrypt via host, or automatic via Vercel).
4. Environment variables (RPC endpoints, WalletConnect project ID) configured on the hosting platform, not hardcoded.

**Validation Gate:**
- [ ] Subdomain resolves over HTTPS with valid cert
- [ ] Main WordPress domain unaffected (test both simultaneously)
- [ ] Wallet connections work from the live subdomain (WalletConnect requires correct allowed-origins config)
- [ ] Lighthouse/PageSpeed check — no broken assets, reasonable load time

---

## Phase 8 — Full Testnet QA Pass

**Goal:** End-to-end QA before touching mainnet.

**Claude Code Tasks / Test Matrix:**
| Chain | Wallet | Test swap pair | Expected fee behavior |
|---|---|---|---|
| BSC Testnet | MetaMask | tBNB → test token | 0.15% to fee wallet |
| BSC Testnet | Trust Wallet (mobile) | test token → tBNB | 0.15% to fee wallet |
| Sepolia | MetaMask | test ETH → test token | 0.15% to fee wallet |
| Arbitrum Sepolia | MetaMask | ETH → WETH | 0.15% to fee wallet |

Also test: wrong-network prompts, wallet rejection mid-swap, network drop mid-swap (does it show pending correctly and reconcile on reconnect), high slippage warning, very small amounts (dust), very large amounts (whale-size, checks liquidity depth errors).

**Validation Gate:**
- [ ] Every cell in the matrix above passes with a documented transaction hash
- [ ] No console errors in browser devtools during any flow
- [ ] Fee wallet balances reconciled manually against on-chain transaction history for at least 10 test swaps per chain

---

## Phase 9 — Security Review Before Mainnet

**Goal:** Don't skip this — real funds are involved.

**Claude Code Tasks:**
1. Re-run Slither/static analysis on final contract versions (post any Phase 6/8 changes).
2. Check: reentrancy, integer overflow (Solidity ^0.8 handles this but verify), unchecked external call return values, front-running exposure on fee-adjustment function, owner key custody plan (multisig recommended — e.g., Gnosis Safe — rather than a single EOA owning fee-adjustment rights).
3. Consider (and tell the client) that a paid third-party audit is standard practice before mainnet for anything holding third-party funds, even briefly in a router pattern.

**Validation Gate:**
- [ ] Zero unresolved high/critical static analysis findings
- [ ] Owner/admin key moved to multisig or hardware wallet, not a hot dev wallet
- [ ] Client has explicitly signed off on audit-or-no-audit decision in writing (protects you)

---

## Phase 10 — Mainnet Deployment & Monitoring

**Claude Code Tasks:**
1. Deploy `FeeRouter` to BSC mainnet, `EthFeeRouter` to Ethereum mainnet, `EthFeeRouter` to Arbitrum One (SushiSwap router: `0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506`).
2. Verify contracts on explorers (BscScan, Etherscan, Arbiscan).
3. Set up monitoring: a simple alert (e.g., webhook to Telegram/Discord) on `SwapExecuted` events and on any `Paused` event.
4. Point production subdomain env vars at mainnet RPCs/addresses.
5. Do a small real-money smoke test yourself (few dollars) on each chain before announcing launch.

**Validation Gate:**
- [ ] Real swap completed successfully on each of the 3 chains with real assets, fee received and verified
- [ ] Monitoring alert fires correctly on a test event
- [ ] Rollback plan documented (pause contract, revert DNS to maintenance page) in case of live issue

---

## Notes on scoping honestly with your client
- Arbitrum is EVM-native — it behaves identically to Ethereum from a code perspective, uses the same wallet (MetaMask), and the same contract pattern. Gas costs are meaningfully lower (~10–100x) which is a genuine selling point vs Ethereum mainnet.
- All three chains share one wallet connection in the UI — a much simpler UX than the old Solana dual-wallet approach.
- Multisig for the fee-adjustment owner key is a small extra step that meaningfully reduces your liability if the wallet is ever compromised.
- L2 advantages (Base, Optimism) could be additional future chain slots if the client wants to expand — same code pattern applies.
