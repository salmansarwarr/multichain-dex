# Deployed Contract Addresses

Machine-readable records live in `contracts/deployments/*.json` (written automatically by the deploy scripts).
Update the tables below with the values printed to stdout after each successful deployment.

---

## Phase 4 Deployment Workflow

```bash
cd contracts

# 1. Fill in contracts/.env (DEPLOYER_PRIVATE_KEY, fee wallet addresses, API keys)

# 2. Deploy
npm run deploy:bsc-testnet         # → writes contracts/deployments/bsc-testnet.json
npm run deploy:sepolia             # → writes contracts/deployments/sepolia.json
npm run deploy:arbitrum-sepolia    # → writes contracts/deployments/arbitrum-sepolia.json

# 3. Verify source on block explorers (wait ~60s after deploy)
npm run verify:bsc-testnet
npm run verify:sepolia
npm run verify:arbitrum-sepolia

# 4. Smoke test
npm run smoke:bsc-testnet
npm run smoke:sepolia
npm run smoke:arbitrum-sepolia
```

### Correcting an already-set fee wallet (no redeploy needed)

Both `FeeRouter` and `EthFeeRouter` expose an owner-only `setFeeWallet()`. If the
wrong address was used at deploy time, fix it in place:

```bash
# Set the NEW address in the relevant *_FEE_WALLET_ADDRESS env var first, then:
npm run set-fee-wallet:bsc-testnet
npm run set-fee-wallet:sepolia
npm run set-fee-wallet:arbitrum-sepolia
```

`DEPLOYER_PRIVATE_KEY` must correspond to the contract's current owner.

**2026-08-04 redeploy (round 1):** all three testnet contracts were redeployed
after a security review (manual + Slither + Hashlock AI Audit Tool — see the
review artifact) surfaced a real DoS: a broken/reverting `feeWallet` blocked
*all* swaps, not just fee delivery. Fixed so a failed fee push degrades to a
claimable pending balance instead of reverting the user's swap. Also added:
owner-only rescue functions for stray funds, a `to != address(0)` check on
every swap function, removed the dead `FeeWalletTransferFailed` event by
actually wiring it up, and pinned the exact compiler version.

**2026-08-05 redeploy (round 2):** a second independent AI-audit pass on
round 1's code found two real regressions in what round 1 had just added,
both now fixed:
- The pending-fee ledger was keyed by *token only* — if `setFeeWallet` was
  called while a balance was pending, the old feeWallet lost access to it
  and the new feeWallet inherited it, unearned. Fixed: pending fees are now
  keyed by `[the address that was feeWallet when the fee accrued]`, not the
  current feeWallet, so a `setFeeWallet` call can never strand or redirect
  what's already owed. Withdrawal also now takes a `recipient` parameter,
  so a feeWallet later blacklisted by the token itself (USDC/USDT-style)
  can still redirect its claim elsewhere instead of being permanently locked
  out.
- The custom `_tryTransfer` helper (written for round 1's DoS fix) used a
  plain high-level `.call()` that copies *all* return data from the token's
  `transfer()` into memory — unbounded, so a malicious token could return
  a huge amount of data as a gas-griefing DoS. The original code (before
  round 1) didn't have this problem because `SafeERC20.safeTransfer` bounds
  its return-data copy to 32 bytes internally. Fixed by deleting the custom
  helper entirely and using OpenZeppelin's own `SafeERC20.trySafeTransfer`
  (same bounded-copy hardening, already audited, less code than what it
  replaced).

Also clarified (doc-only, no behavior change): `swapExactTokensForTokensWithFee`
computes the *fee* correctly for a fee-on-transfer `path[0]`, but the swap
itself still requires the `...SupportingFeeOnTransferTokens` variant for a
taxed input token — same limitation the underlying Uniswap V2 / PancakeSwap
routers have always had. The frontend already selects the correct function
via `tokenIn.isFeeOnTransfer || tokenOut.isFeeOnTransfer`, so this was never
reachable through the actual product; the fix was a misleading comment that
implied otherwise.

Old addresses (both rounds) are archived in `contracts/deployments/*.json`
under `previousDeployments`. Fee wallet was correct
(`0x12e260D0a664736593173f335FcDcc1076eEA4De`) on every deployment from
2026-08-04 onward — the dev-wallet mixup from the original 2026-07 deploy no
longer applies.

**Known gaps as of the round-2 redeploy:**
- BSC Testnet: deployer wallet is still low on tBNB — state reads confirmed
  correct on-chain (contract deployed, verified, constructor args correct),
  but the swap itself hasn't been smoke-tested against the round-2 address.
  Needs a top-up from https://testnet.bnbchain.org/faucet-smart.
- Sepolia / Arbitrum Sepolia: this time smoke-tested *before* transferring
  ownership (round 1's sequencing mistake, corrected) — swap, fee
  correctness, access control, and pause/unpause all independently
  confirmed live on the new contracts.

---

## Testnets

| Chain | Contract | Address | Verified | Deployed At | Tx Hash | Fee Wallet |
|---|---|---|---|---|---|---|
| BSC Testnet (Chapel) | `FeeRouter` | `0x6D303DCA98459736c00FfF0507ddA414CbBF0792` | ✅ | 2026-08-05 | `0x1c5090eebaafb8f1ffb17e6b469d36d5c75132e91ccee16bf99285ee176b75fa` | ✅ `0x12e26...eA4De` |
| Ethereum Sepolia | `EthFeeRouter` | `0xF27443aAdBaE8611Db6d4164ac4560eF73fa6b64` | ✅ | 2026-08-05 | `0x9a65b61dd0f1a7c7747bb903a148f22726c2b0efa0d488f69eee06199ff69d27` | ✅ `0x12e26...eA4De` |
| Arbitrum Sepolia | `EthFeeRouter` | `0x327d2Dc9977eD987E2EB8658EfE823d71C65e614` | ✅ | 2026-08-05 | `0xd6c5a79407c731788190c2589188b0996c0f845511d70ee41322a7d56a3a20a4` | ✅ `0x12e26...eA4De` |

All three: ownership transferred to `0x937Cd31D806FC4Ebd9a5A70C34809482E3166b6b` same day, after smoke testing.

**Explorers:**
- BSC Testnet: `https://testnet.bscscan.com/address/<ADDRESS>#code`
- Sepolia: `https://sepolia.etherscan.io/address/<ADDRESS>#code`
- Arbitrum Sepolia: `https://sepolia.arbiscan.io/address/<ADDRESS>#code`

**Arbitrum Sepolia note:** no official Uniswap-V2-compatible DEX is confirmed
live on Arbitrum Sepolia (checked directly on-chain — the mainnet SushiSwap/
Uniswap router addresses have no bytecode there). `deploy-arbitrum-sepolia.ts`
deploys a self-contained mock router + test tokens to exercise the same
`EthFeeRouter.sol` code, per the "test router on Arbitrum Sepolia" fallback
noted in `docs/implementation-plan.md` Phase 3.

---

## Mainnets

> Populated in Phase 10 only. Do not deploy to mainnet before Phase 9 security review is complete.

| Chain | Contract | Address | Verified | Deployed At | Tx Hash |
|---|---|---|---|---|---|
| BSC Mainnet | `FeeRouter` | — | — | — | — |
| Ethereum Mainnet | `EthFeeRouter` | — | — | — | — |

---

## Solana

Removed from scope — the project now targets three EVM chains only (BSC,
Ethereum, Arbitrum). Solana wallet/quote/swap code has been removed from the
frontend accordingly.
