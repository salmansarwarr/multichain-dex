# FeeRouter Gas Report (Phase 1)

Generated with `REPORT_GAS=true npx hardhat test` against the mock
router/tokens (Solc 0.8.24, optimizer on, 200 runs). These numbers isolate
FeeRouter's own overhead — real-world PancakeSwap swap gas will be higher
once the underlying pool logic is included (see the fork test for a
real-world number).

```
|                   Solc version: 0.8.24                   ·  Optimizer enabled: true  ·  Runs: 200  ·  Block limit: 60000000 gas  │
···························································|···························|·············|······························
|  Methods                                                                                                                         │
·······················|···································|·············|·············|·············|···············|··············
|  Contract            ·  Method                           ·  Min        ·  Max        ·  Avg        ·  # calls      ·  usd (avg)  │
·······················|···································|·············|·············|·············|···············|··············
|  FeeRouter           ·  pause                            ·          -  ·          -  ·      27758  ·            1  ·          -  │
·······················|···································|·············|·············|·············|···············|··············
|  FeeRouter           ·  setFeeBps                        ·          -  ·          -  ·      30000  ·            2  ·          -  │
·······················|···································|·············|·············|·············|···············|··············
|  FeeRouter           ·  setFeeWallet                     ·          -  ·          -  ·      30486  ·            1  ·          -  │
·······················|···································|·············|·············|·············|···············|··············
|  FeeRouter           ·  swapExactETHForTokensWithFee     ·          -  ·          -  ·      96673  ·            2  ·          -  │
·······················|···································|·············|·············|·············|···············|··············
|  FeeRouter           ·  swapExactTokensForTokensWithFee  ·     157236  ·     157313  ·     157275  ·            4  ·          -  │
·······················|···································|·············|·············|·············|···············|··············
|  FeeRouter           ·  unpause                          ·          -  ·          -  ·      27708  ·            1  ·          -  │
·······················|···································|·············|·············|·············|···············|··············
|  Deployments                                             ·                                         ·  % of limit   ·             │
···························································|·············|·············|·············|···············|··············
|  FeeRouter                                               ·          -  ·          -  ·    1095547  ·        1.8 %  ·          -  │
·----------------------------------------------------------|-------------|-------------|-------------|---------------|-------------·
```

## Takeaways

- **`swapExactTokensForTokensWithFee`: ~157k gas** for the FeeRouter wrapper
  logic itself (pull tokens in, skim fee, forceApprove, call into router,
  emit event). Add the underlying PancakeSwap pool swap cost on top for a
  real end-to-end number — expect roughly another ~120k-150k gas depending
  on pool type and hop count.
- **`swapExactETHForTokensWithFee`: ~97k gas** — cheaper than the ERC20 path
  since there's no `transferFrom`/`approve` overhead on the input side.
- **Deployment: ~1.1M gas**, about 1.8% of a 60M block gas limit — cheap to
  deploy on BSC.
- Re-run this after any Phase 6/8/9 changes (per the Phase 9 gate) since
  admin function changes, added checks, or event changes will shift these
  numbers.

To regenerate: `cd contracts && REPORT_GAS=true npx hardhat test`