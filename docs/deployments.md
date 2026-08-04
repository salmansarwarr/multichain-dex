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

**2026-08-04 redeploy:** all three testnet contracts were redeployed after a
security review (manual + Slither + Hashlock AI Audit Tool — see the review
artifact) surfaced a real DoS: a broken/reverting `feeWallet` blocked *all*
swaps, not just fee delivery. Fixed via `_tryTransfer` — a failed fee push
now degrades to a claimable `pendingTokenFees`/`pendingEthFees` balance
instead of reverting the user's swap. Also added: owner-only rescue
functions for stray funds, a `to != address(0)` check on every swap
function, removed the dead `FeeWalletTransferFailed` event by actually
wiring it up, and pinned the exact compiler version. Old addresses are
archived in `contracts/deployments/*.json` under `previousDeployments`.
Fee wallet was correct (`0x12e260D0a664736593173f335FcDcc1076eEA4De`) on all
three from this deployment onward — the dev-wallet mixup from the original
2026-07 deploy no longer applies.

**Known gaps as of this redeploy:**
- BSC Testnet: deployer wallet ran low on tBNB mid-verification — state
  reads confirmed correct on-chain, but the swap itself hasn't been
  smoke-tested against the *new* address yet. Needs a top-up from
  https://testnet.bnbchain.org/faucet-smart before finishing.
- Sepolia / Arbitrum Sepolia: swap + fee-correctness + access-control all
  smoke-tested successfully on the new contracts. The `pause`/`unpause`
  step specifically was **not** re-verified on-chain post-redeploy, because
  ownership was transferred to the client's wallet before running the
  smoke test (sequencing mistake — should have smoke-tested first). Both
  functions are plain OpenZeppelin `Pausable` calls with no custom logic
  and are covered by the 34-test unit suite against the same compiled
  bytecode, so risk is low, but it wasn't independently exercised live.

---

## Testnets

| Chain | Contract | Address | Verified | Deployed At | Tx Hash | Fee Wallet |
|---|---|---|---|---|---|---|
| BSC Testnet (Chapel) | `FeeRouter` | `0xBbD4Ff24f2c28e6dAe5f083eb0C98EF65c2fd9e9` | ✅ | 2026-08-04 | `0x2a85ed7e91050166a21dd2e195a30f45c01e67369aa2515589f64f869f914191` | ✅ `0x12e26...eA4De` |
| Ethereum Sepolia | `EthFeeRouter` | `0x5d02b756d416231fe71188e2F73C54446140bb56` | ✅ | 2026-08-04 | `0x5b9c6367b5d06fb84cc7235d7c93157cbf37633a6455e60560aac92694a29ac3` | ✅ `0x12e26...eA4De` |
| Arbitrum Sepolia | `EthFeeRouter` | `0x43aB86B6461297BF95Fbc7bd84Ab61d98F13969A` | ✅ | 2026-08-04 | `0x8d03e02040a70e3fb74acc23b71cd39857c8d8eec5cb6996b3a7152ddc7e91bd` | ✅ `0x12e26...eA4De` |

All three: ownership transferred to `0x937Cd31D806FC4Ebd9a5A70C34809482E3166b6b` same day.

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
