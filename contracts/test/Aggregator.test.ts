import { expect } from "chai";
import { ethers } from "hardhat";

const FEE_BPS = 15n;
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const fee = (x: bigint) => (x * FEE_BPS) / 10_000n;

for (const name of ["FeeRouter", "EthFeeRouter"]) {
  describe(`${name} — swapViaAggregatorWithFee`, function () {
    async function fixture() {
      const [owner, feeWallet, user, other] = await ethers.getSigners();
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const tokenIn = await ERC20.deploy("In", "IN", 18);
      const tokenOut = await ERC20.deploy("Out", "OUT", 18);
      const agg = await (await ethers.getContractFactory("MockAggregator")).deploy();
      await tokenOut.mint(await agg.getAddress(), ethers.parseEther("1000000"));
      await owner.sendTransaction({ to: await agg.getAddress(), value: ethers.parseEther("100") });

      const Router = await ethers.getContractFactory(name);
      const router: any = await Router.deploy(
        owner.address, ethers.ZeroAddress, ethers.ZeroAddress, await agg.getAddress(), feeWallet.address, FEE_BPS, owner.address
      );
      const r = await router.getAddress();
      await tokenIn.mint(user.address, ethers.parseEther("1000"));
      await tokenIn.connect(user).approve(r, ethers.MaxUint256);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      const call = (tIn: string, spend: bigint, tOut: string, out: bigint, to = r) =>
        agg.interface.encodeFunctionData("swap", [tIn, spend, tOut, out, to]);
      return { owner, feeWallet, user, other, tokenIn, tokenOut, agg, router, r, deadline, call };
    }

    it("allowlists the constructor's router; owner can add/remove, others can't", async function () {
      const { router, agg, owner, other } = await fixture();
      expect(await router.aggregatorRouters(await agg.getAddress())).to.equal(true);
      await expect(router.connect(other).setAggregatorRouter(other.address, true)).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
      await expect(router.connect(owner).setAggregatorRouter(await agg.getAddress(), false)).to.emit(router, "AggregatorRouterSet");
      expect(await router.aggregatorRouters(await agg.getAddress())).to.equal(false);
    });

    it("token -> token: takes exactly the fee, router spends exactly the rest, user gets the output", async function () {
      const { router, user, feeWallet, tokenIn, tokenOut, agg, deadline, call } = await fixture();
      const amountIn = ethers.parseEther("10");
      const after = amountIn - fee(amountIn);
      const out = ethers.parseEther("25");
      await expect(router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), amountIn, await tokenOut.getAddress(), out, await agg.getAddress(), call(await tokenIn.getAddress(), after, await tokenOut.getAddress(), out), user.address, deadline))
        .to.emit(router, "SwapExecuted").withArgs(user.address, await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, fee(amountIn));
      expect(await tokenIn.balanceOf(feeWallet.address)).to.equal(fee(amountIn));
      expect(await tokenIn.balanceOf(await agg.getAddress())).to.equal(after);
      expect(await tokenOut.balanceOf(user.address)).to.equal(out);
      expect(await tokenIn.balanceOf(await router.getAddress())).to.equal(0n);
      expect(await tokenIn.allowance(await router.getAddress(), await agg.getAddress())).to.equal(0n);
    });

    it("native -> token: fee taken off msg.value, rest forwarded as value", async function () {
      const { router, user, feeWallet, tokenOut, agg, deadline, call } = await fixture();
      const amountIn = ethers.parseEther("1");
      const after = amountIn - fee(amountIn);
      const before = await ethers.provider.getBalance(feeWallet.address);
      await router.connect(user).swapViaAggregatorWithFee(NATIVE, amountIn, await tokenOut.getAddress(), 1n, await agg.getAddress(), call(NATIVE, after, await tokenOut.getAddress(), 7n), user.address, deadline, { value: amountIn });
      expect((await ethers.provider.getBalance(feeWallet.address)) - before).to.equal(fee(amountIn));
      expect(await tokenOut.balanceOf(user.address)).to.equal(7n);
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0n);
    });

    it("token -> native: user receives native currency", async function () {
      const { router, user, other, tokenIn, agg, deadline, call } = await fixture();
      const amountIn = ethers.parseEther("10");
      const before = await ethers.provider.getBalance(other.address);
      await router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), amountIn, NATIVE, ethers.parseEther("2"), await agg.getAddress(), call(await tokenIn.getAddress(), amountIn - fee(amountIn), NATIVE, ethers.parseEther("2")), other.address, deadline);
      expect((await ethers.provider.getBalance(other.address)) - before).to.equal(ethers.parseEther("2"));
    });

    it("refunds whatever the router leaves unspent (token and native)", async function () {
      const { router, user, tokenIn, tokenOut, agg, deadline, call } = await fixture();
      const amountIn = ethers.parseEther("10");
      const after = amountIn - fee(amountIn);
      const balBefore = await tokenIn.balanceOf(user.address);
      await router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), amountIn, await tokenOut.getAddress(), 1n, await agg.getAddress(), call(await tokenIn.getAddress(), after - 3n, await tokenOut.getAddress(), 5n), user.address, deadline);
      expect(balBefore - (await tokenIn.balanceOf(user.address))).to.equal(amountIn - 3n);

      const v = ethers.parseEther("1");
      const tx = router.connect(user).swapViaAggregatorWithFee(NATIVE, v, await tokenOut.getAddress(), 1n, await agg.getAddress(), call(NATIVE, v / 2n, await tokenOut.getAddress(), 5n), user.address, deadline, { value: v });
      await expect(tx).to.changeEtherBalance(user, -(fee(v) + v / 2n));
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0n);
    });

    it("reverts with InsufficientOutput when the measured output is below amountOutMin", async function () {
      const { router, user, tokenIn, tokenOut, agg, deadline, call } = await fixture();
      const amountIn = ethers.parseEther("10");
      await expect(router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), amountIn, await tokenOut.getAddress(), 100n, await agg.getAddress(), call(await tokenIn.getAddress(), amountIn - fee(amountIn), await tokenOut.getAddress(), 99n), user.address, deadline))
        .to.be.revertedWithCustomError(router, "InsufficientOutput").withArgs(99n, 100n);
    });

    it("doesn't trust calldata that pays someone else: output must land in the router", async function () {
      const { router, user, other, tokenIn, tokenOut, agg, deadline, call } = await fixture();
      const amountIn = ethers.parseEther("10");
      await expect(router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), amountIn, await tokenOut.getAddress(), 1n, await agg.getAddress(), call(await tokenIn.getAddress(), amountIn - fee(amountIn), await tokenOut.getAddress(), 50n, other.address), user.address, deadline))
        .to.be.revertedWithCustomError(router, "InsufficientOutput").withArgs(0n, 1n);
    });

    it("pending fees held by the contract can't be swept into amountOut", async function () {
      const { router, owner, user, tokenIn, tokenOut, agg, r, deadline, call } = await fixture();
      await tokenOut.mint(r, ethers.parseEther("500"));
      const amountIn = ethers.parseEther("10");
      await router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), amountIn, await tokenOut.getAddress(), 1n, await agg.getAddress(), call(await tokenIn.getAddress(), amountIn - fee(amountIn), await tokenOut.getAddress(), 4n), user.address, deadline);
      expect(await tokenOut.balanceOf(user.address)).to.equal(4n);
      expect(await tokenOut.balanceOf(r)).to.equal(ethers.parseEther("500"));
      void owner;
    });

    it("rejects non-allowlisted routers, bad value, same token, and expired deadlines", async function () {
      const { router, user, other, tokenIn, tokenOut, agg, deadline, call } = await fixture();
      const tIn = await tokenIn.getAddress(), tOut = await tokenOut.getAddress(), a = await agg.getAddress();
      const d = call(tIn, 1n, tOut, 1n);
      await expect(router.connect(user).swapViaAggregatorWithFee(tIn, 10n, tOut, 0n, other.address, d, user.address, deadline)).to.be.revertedWithCustomError(router, "RouterNotAllowed");
      await expect(router.connect(user).swapViaAggregatorWithFee(tIn, 10n, tOut, 0n, a, d, user.address, deadline, { value: 1n })).to.be.revertedWithCustomError(router, "InvalidAggregatorSwap");
      await expect(router.connect(user).swapViaAggregatorWithFee(NATIVE, 10n, tOut, 0n, a, d, user.address, deadline, { value: 9n })).to.be.revertedWithCustomError(router, "InvalidAggregatorSwap");
      await expect(router.connect(user).swapViaAggregatorWithFee(tIn, 10n, tIn, 0n, a, d, user.address, deadline)).to.be.revertedWithCustomError(router, "InvalidAggregatorSwap");
      await expect(router.connect(user).swapViaAggregatorWithFee(tIn, 10n, tOut, 0n, a, d, user.address, 1)).to.be.revertedWithCustomError(router, "DeadlineExpired");
    });

    it("bubbles up the router's revert reason and respects pause()", async function () {
      const { router, owner, user, tokenIn, tokenOut, agg, deadline } = await fixture();
      const fail = agg.interface.encodeFunctionData("fail");
      await expect(router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), 10n, await tokenOut.getAddress(), 0n, await agg.getAddress(), fail, user.address, deadline)).to.be.revertedWith("aggregator: route failed");
      await router.connect(owner).pause();
      await expect(router.connect(user).swapViaAggregatorWithFee(await tokenIn.getAddress(), 10n, await tokenOut.getAddress(), 0n, await agg.getAddress(), fail, user.address, deadline)).to.be.revertedWithCustomError(router, "EnforcedPause");
    });
  });
}
