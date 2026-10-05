/**
 * Arbitrum One fork test for EthFeeRouter's Uniswap V3 support — same
 * checks as the Ethereum mainnet fork test, against live Arbitrum state.
 *
 * Usage:
 *   ARB_MAINNET_ARCHIVE_RPC_URL=https://your-arbitrum-rpc \
 *   RUN_FORK_TESTS=true \
 *   npx hardhat test test/fork/EthFeeRouter.arbitrum.fork.test.ts
 */
import { expect } from "chai";
import { ethers, network } from "hardhat";

const RUN_FORK_TESTS = process.env.RUN_FORK_TESTS === "true";
const ARB_RPC = process.env.ARB_MAINNET_ARCHIVE_RPC_URL || "";

const UNISWAP_V2_ROUTER02 = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const UNISWAP_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNISWAP_V3_QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const LINK = "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4";
const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const USDE = "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34";
const FEES = [100, 500, 3000, 10000];

const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256,uint160[],uint32[],uint256)",
];

const describeOrSkip = RUN_FORK_TESTS && ARB_RPC ? describe : describe.skip;

describeOrSkip("EthFeeRouter — Arbitrum One fork (Uniswap V3)", function () {
  this.timeout(300_000);

  before(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: ARB_RPC } }] });
  });
  after(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  async function setup() {
    const [deployer, feeWallet, user] = await ethers.getSigners();
    await network.provider.request({ method: "hardhat_setBalance", params: [user.address, ethers.toQuantity(ethers.parseEther("10"))] });
    const F = await ethers.getContractFactory("EthFeeRouter");
    const router = await F.deploy(UNISWAP_V2_ROUTER02, UNISWAP_V3_SWAP_ROUTER, WETH, feeWallet.address, 15, deployer.address);
    const quoter = new ethers.Contract(UNISWAP_V3_QUOTER_V2, QUOTER_ABI, user);
    return { router, feeWallet, user, quoter };
  }

  async function bestSingle(quoter: any, tokenOut: string, amountIn: bigint) {
    let best = { out: 0n, fee: 0 };
    for (const fee of FEES) {
      try {
        const [out] = await quoter.quoteExactInputSingle.staticCall({ tokenIn: WETH, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0 });
        if (out > best.out) best = { out, fee };
      } catch {}
    }
    return best;
  }

  it("ETH -> LINK through a single V3 pool: exact 0.15% fee, output matches the quoter", async function () {
    const { router, feeWallet, user, quoter } = await setup();
    const amountIn = ethers.parseEther("0.1");
    const afterFee = amountIn - (amountIn * 15n) / 10_000n;
    const { out, fee } = await bestSingle(quoter, LINK, afterFee);
    expect(out).to.be.gt(0n);
    const link = await ethers.getContractAt("IERC20", LINK);
    const feeBefore = await ethers.provider.getBalance(feeWallet.address);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    await router.connect(user).swapExactETHForTokensV3WithFee(out, LINK, fee, user.address, deadline, { value: amountIn });
    expect((await ethers.provider.getBalance(feeWallet.address)) - feeBefore).to.equal((amountIn * 15n) / 10_000n);
    expect(await link.balanceOf(user.address)).to.equal(out);
  });

  it("ETH -> USDT -> USDe through two chained V3 pools: output matches the quoter", async function () {
    const { router, user, quoter } = await setup();
    const amountIn = ethers.parseEther("0.1");
    const afterFee = amountIn - (amountIn * 15n) / 10_000n;
    // WETH/USDT 0.05% + USDT/USDe 0.05% was the best pair on live Arbitrum
    // (2026-10-05). Quoting only that pair keeps this fast on a cold fork.
    const path = ethers.solidityPacked(["address", "uint24", "address", "uint24", "address"], [WETH, 500, USDT, 500, USDE]);
    const [out] = await quoter.quoteExactInput.staticCall(path, afterFee);
    const best = { out, path };
    expect(best.out).to.be.gt(0n);
    const usde = await ethers.getContractAt("IERC20", USDE);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    await router.connect(user).swapExactETHForTokensV3MultiHopWithFee(best.out, best.path, user.address, deadline, { value: amountIn });
    expect(await usde.balanceOf(user.address)).to.equal(best.out);
  });

  it("LINK -> native ETH through V3 (swap then unwrap WETH)", async function () {
    const { router, user, quoter } = await setup();
    const { fee } = await bestSingle(quoter, LINK, ethers.parseEther("0.1"));
    let deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    await router.connect(user).swapExactETHForTokensV3WithFee(0, LINK, fee, user.address, deadline, { value: ethers.parseEther("0.1") });
    const link = await ethers.getContractAt("IERC20", LINK);
    const bal = await link.balanceOf(user.address);
    await link.connect(user).approve(await router.getAddress(), bal);
    const before = await ethers.provider.getBalance(user.address);
    deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    const tx = await router.connect(user).swapExactTokensForETHV3WithFee(bal, 0, LINK, fee, user.address, deadline);
    const r = await tx.wait();
    const received = (await ethers.provider.getBalance(user.address)) - before + r!.gasUsed * r!.gasPrice;
    expect(received).to.be.gt(ethers.parseEther("0.098"));
  });
});
