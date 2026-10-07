/**
 * Real KyberSwap routes through swapViaAggregatorWithFee on a fork of a
 * live chain. The route is fetched from KyberSwap's API at test time, built
 * for the freshly deployed contract as sender and recipient.
 *
 * Usage:
 *   AGG_FORK_CHAIN=bsc|ethereum|arbitrum AGG_FORK_RPC_URL=https://... \
 *   RUN_FORK_TESTS=true npx hardhat test test/fork/Aggregator.fork.test.ts
 */
import { expect } from "chai";
import { ethers, network } from "hardhat";

const CHAIN = process.env.AGG_FORK_CHAIN || "";
const RPC = process.env.AGG_FORK_RPC_URL || "";
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";

// Each target trades mainly on a venue the V2/V3 functions can't reach.
const CASES: Record<string, { contract: string; label: string; token: string }> = {
  bsc: { contract: "FeeRouter", label: "BNB -> KITE (PancakeSwap Infinity)", token: "0x904567252d8f48555b7447c67dca23f0372e16be" },
  ethereum: { contract: "EthFeeRouter", label: "ETH -> 1INCH (Uniswap V4)", token: "0x111111111117dC0aa78b770fA6A738034120C302" },
  arbitrum: { contract: "EthFeeRouter", label: "ETH -> WOO (Uniswap V4)", token: "0xcafcd85d8ca7ad1e1c6f82f651fa15e33aefd07b" },
};

async function kyber(tokenIn: string, tokenOut: string, amountIn: bigint, account: string) {
  const base = `https://aggregator-api.kyberswap.com/${CHAIN}/api/v1`;
  const headers = { "x-client-id": "alphaterraswapx", "content-type": "application/json" };
  const r = await (await fetch(`${base}/routes?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}`, { headers })).json();
  if (r.code !== 0) throw new Error(`routes: ${JSON.stringify(r)}`);
  const b = await (await fetch(`${base}/route/build`, {
    method: "POST", headers,
    body: JSON.stringify({ routeSummary: r.data.routeSummary, sender: account, recipient: account, slippageTolerance: 100 }),
  })).json();
  if (b.code !== 0) throw new Error(`build: ${JSON.stringify(b)}`);
  return { router: b.data.routerAddress as string, data: b.data.data as string, amountOut: BigInt(b.data.amountOut) };
}

const describeOrSkip = process.env.RUN_FORK_TESTS === "true" && RPC && CASES[CHAIN] ? describe : describe.skip;

describeOrSkip(`swapViaAggregatorWithFee — ${CHAIN} fork, real KyberSwap route`, function () {
  this.timeout(600_000);
  const c = CASES[CHAIN];

  before(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  });
  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it(`${c?.label}, then sells it back to native`, async function () {
    const [deployer, feeWallet, user] = await ethers.getSigners();
    await network.provider.request({ method: "hardhat_setBalance", params: [user.address, ethers.toQuantity(ethers.parseEther("10"))] });
    const F = await ethers.getContractFactory(c.contract);
    const fr: any = await F.deploy(deployer.address, ethers.ZeroAddress, ethers.ZeroAddress, KYBER_ROUTER, feeWallet.address, 15, deployer.address);
    const addr = await fr.getAddress();

    const amountIn = ethers.parseEther("0.1");
    const afterFee = amountIn - (amountIn * 15n) / 10_000n;
    const buy = await kyber(NATIVE, c.token, afterFee, addr);
    expect(buy.router).to.equal(KYBER_ROUTER);

    const token = await ethers.getContractAt("IERC20", c.token);
    const feeBefore = await ethers.provider.getBalance(feeWallet.address);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    const minOut = (buy.amountOut * 98n) / 100n;
    await fr.connect(user).swapViaAggregatorWithFee(NATIVE, amountIn, c.token, minOut, buy.router, buy.data, user.address, deadline, { value: amountIn });

    const got = await token.balanceOf(user.address);
    expect((await ethers.provider.getBalance(feeWallet.address)) - feeBefore).to.equal((amountIn * 15n) / 10_000n);
    expect(got).to.be.gte(minOut);
    expect(await token.balanceOf(addr)).to.equal(0n);
    console.log(`      bought ${ethers.formatUnits(got, 18)} (KyberSwap quoted ${ethers.formatUnits(buy.amountOut, 18)})`);

    await token.connect(user).approve(addr, got);
    const sellAfterFee = got - (got * 15n) / 10_000n;
    const sell = await kyber(c.token, NATIVE, sellAfterFee, addr);
    const before = await ethers.provider.getBalance(user.address);
    const tx = await fr.connect(user).swapViaAggregatorWithFee(c.token, got, NATIVE, (sell.amountOut * 98n) / 100n, sell.router, sell.data, user.address, deadline);
    const rc = await tx.wait();
    const back = (await ethers.provider.getBalance(user.address)) - before + rc!.gasUsed * rc!.gasPrice;
    console.log(`      sold back for ${ethers.formatEther(back)} native (KyberSwap quoted ${ethers.formatEther(sell.amountOut)})`);
    expect(back).to.be.gte((sell.amountOut * 98n) / 100n);
    expect(await ethers.provider.getBalance(addr)).to.equal(0n);
  });
});
