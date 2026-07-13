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

**Current status (2026-07-13):** BSC Testnet and Sepolia were deployed with
`feeWallet = 0x348DC510bEDCccB42AF5b720Fe474366379e052B` (a dev/test wallet),
not the project fee wallet `0x12e260D0a664736593173f335FcDcc1076eEA4De`. Run
`set-fee-wallet:bsc-testnet` and `set-fee-wallet:sepolia` (with
`BSC_FEE_WALLET_ADDRESS` / `ETH_FEE_WALLET_ADDRESS` set to the project fee
wallet) to correct this before any further testing.

---

## Testnets

| Chain | Contract | Address | Verified | Deployed At | Tx Hash | Fee Wallet |
|---|---|---|---|---|---|---|
| BSC Testnet (Chapel) | `FeeRouter` | `0xBd018b76A06C51f000EB3DB6a1861384643D5E16` | ✅ | 2026-07-09 | `0x600ae60d610992ff2d83fa1ee5627297c5377c73f2151308d3843802d24fcf92` | ⚠️ dev wallet — needs `set-fee-wallet:bsc-testnet` |
| Ethereum Sepolia | `EthFeeRouter` | `0x0f3eA3301da9DD6d287130bDb8454302808CbcC2` | ✅ | 2026-07-09 | `0x4633f0575867ef62b9ab1d0095b33b99d5c23cbbb58fc8feb6741900f1e1f105` | ⚠️ dev wallet — needs `set-fee-wallet:sepolia` |
| Arbitrum Sepolia | `EthFeeRouter` | — pending — | — | — | — | — |

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
