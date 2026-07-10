# EthFeeRouter Gas Report (Phase 2)

Generated with `REPORT_GAS=true npx hardhat test` against mock router/tokens
(Solc 0.8.24, optimizer on, 200 runs). FeeRouter (Phase 1) numbers included
for comparison — both routers share the same wrapper pattern.

```
|  Contract                ·  Method                                                        ·  Min        ·  Max        ·  Avg        ·  # calls      |
|  EthFeeRouter            ·  pause                                                         ·          -  ·          -  ·      27780  ·            1  |
|  EthFeeRouter            ·  swapExactETHForTokensWithFee                                  ·          -  ·          -  ·      96735  ·            2  |
|  EthFeeRouter            ·  swapExactTokensForTokensWithFee                               ·     158511  ·     159010  ·     158818  ·            6  |
|  EthFeeRouter            ·  swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens  ·          -  ·          -  ·     167260  ·            1  |
|  EthFeeRouter            ·  unpause                                                       ·          -  ·          -  ·      27708  ·            1  |
|  FeeRouter               ·  swapExactETHForTokensWithFee                                  ·          -  ·          -  ·      96673  ·            2  |
|  FeeRouter               ·  swapExactTokensForTokensWithFee                               ·     157236  ·     157313  ·     157275  ·            4  |
|  Deployments                                                                              ·  gas        ·  % of 60M limit                            |
|  EthFeeRouter                                                                             ·    1368373  ·        2.3 %                                |
|  FeeRouter                                                                                ·    1095547  ·        1.8 %                                |
```

## Takeaways

- **`swapExactTokensForTokensWithFee`: ~159k gas** — about 1.5k more than
  FeeRouter's equivalent, due to the balance-delta accounting
  (`balanceOf` before/after the pull-in transfer) needed to handle
  fee-on-transfer input tokens correctly. That's the cost of the extra
  correctness; on Ethereum mainnet gas prices this is a small fraction of
  a cent difference relative to the underlying Uniswap pool swap cost.
- **`swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens`: ~167k
  gas** — a bit more again since it calls into Uniswap's own
  FeeOnTransfer-supporting variant, which does its own extra accounting
  internally.
- **`swapExactETHForTokensWithFee`: ~97k gas** — essentially identical to
  FeeRouter's BNB path, since there's no input-token balance-delta
  logic needed when the input is native ETH.
- **Deployment: ~1.37M gas**, about 2.3% of a 60M block gas limit —
  ~273k gas more than FeeRouter, mostly from the two additional
  FeeOnTransfer-supporting entry points.
- On Ethereum mainnet specifically, gas cost matters more in absolute
  dollar terms than on BSC — worth mentioning to the client that the
  extra ~1.5-9k gas for fee-on-transfer safety is the right tradeoff
  (a wrong fee calculation or a stuck swap costs far more than a few
  thousand gas), but it's a real, quantifiable cost worth being able to
  point to.

To regenerate: `cd contracts && REPORT_GAS=true npx hardhat test`