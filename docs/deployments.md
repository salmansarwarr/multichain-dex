# Deployed Contract Addresses

Machine-readable records live in `contracts/deployments/*.json` (written automatically by the deploy scripts).
Update the tables below with the values printed to stdout after each successful deployment.

---

## Phase 4 Deployment Workflow

```bash
cd contracts

# 1. Fill in contracts/.env (DEPLOYER_PRIVATE_KEY, fee wallet addresses, API keys)

# 2. Deploy
npm run deploy:bsc-testnet   # → writes contracts/deployments/bsc-testnet.json
npm run deploy:sepolia        # → writes contracts/deployments/sepolia.json

# 3. Verify source on block explorers (wait ~60s after deploy)
npm run verify:bsc-testnet
npm run verify:sepolia

# 4. Smoke test
npm run smoke:bsc-testnet
npm run smoke:sepolia
```

---

## Testnets

| Chain | Contract | Address | Verified | Deployed At | Tx Hash |
|---|---|---|---|---|---|
| BSC Testnet (Chapel) | `FeeRouter` | `0xBd018b76A06C51f000EB3DB6a1861384643D5E16` | ✅ | 2026-07-09 | `0x600ae60d610992ff2d83fa1ee5627297c5377c73f2151308d3843802d24fcf92` |
| Ethereum Sepolia | `EthFeeRouter` | `0x0f3eA3301da9DD6d287130bDb8454302808CbcC2` | ✅ | 2026-07-09 | `0x4633f0575867ef62b9ab1d0095b33b99d5c23cbbb58fc8feb6741900f1e1f105` |

**Explorers:**
- BSC Testnet: `https://testnet.bscscan.com/address/<ADDRESS>#code`
- Sepolia: `https://sepolia.etherscan.io/address/<ADDRESS>#code`

---

## Mainnets

> Populated in Phase 10 only. Do not deploy to mainnet before Phase 9 security review is complete.

| Chain | Contract | Address | Verified | Deployed At | Tx Hash |
|---|---|---|---|---|---|
| BSC Mainnet | `FeeRouter` | — | — | — | — |
| Ethereum Mainnet | `EthFeeRouter` | — | — | — | — |

---

## Solana

Solana has no deployed contract — swaps route through the Jupiter Aggregator
API/program directly. The only "address" of note is the fee wallet's
Associated Token Account(s), tracked here once created (Phase 3).

| Network | Fee Wallet | ATA (per mint) | Created At |
|---|---|---|---|
| Devnet | — | — | — |
| Mainnet-beta | — | — | — |
