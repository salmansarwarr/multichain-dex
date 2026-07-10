const {expect} = require('chai');
const {ethers} = require('hardhat');
const {loadFixture} = require('@nomicfoundation/hardhat-toolbox/network-helpers')

const FEE_BPS = 15n; // 0.15%
const BPS_DENOMINATOR = 10_000n;
const MAX_FEE_BPS = 100n; // 1%
const ONE_TOKEN = ethers.parseUnits("1", 18);

async function deployFixture() {
  const [owner, feeWallet, user, other] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokenIn = await MockERC20.deploy("Wrapped BNB", "WBNB", 18);
  const tokenOut = await MockERC20.deploy("Test USD", "tBUSD", 18);

  const MockPancakeRouter = await ethers.getContractFactory("MockPancakeRouter");
  const mockRouter = await MockPancakeRouter.deploy();

  // Fund the mock router so it can pay out swaps 1:1.
  await tokenOut.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 18));
  await owner.sendTransaction({
    to: await mockRouter.getAddress(),
    value: ethers.parseEther("100"),
  });

  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouter.deploy(
    await mockRouter.getAddress(),
    feeWallet.address,
    FEE_BPS,
    owner.address
  );

  // Fund the user with tokenIn and approve the FeeRouter.
  await tokenIn.mint(user.address, ethers.parseUnits("1000", 18));
  await tokenIn.connect(user).approve(await feeRouter.getAddress(), ethers.MaxUint256);

  return { owner, feeWallet, user, other, tokenIn, tokenOut, mockRouter, feeRouter };
}

function computeFee(amountIn: bigint, feeBps: bigint = FEE_BPS): { fee: bigint; afterFee: bigint } {
  const fee = (amountIn * feeBps) / BPS_DENOMINATOR;
  return { fee, afterFee: amountIn - fee };
}

describe("FeeRouter", function () {
  describe("Deployment", function () {
    it("sets constructor params correctly", async function () {
      const { feeRouter, mockRouter, feeWallet, owner } = await loadFixture(deployFixture);
      expect(await feeRouter.pancakeRouter()).to.equal(await mockRouter.getAddress());
      expect(await feeRouter.feeWallet()).to.equal(feeWallet.address);
      expect(await feeRouter.feeBps()).to.equal(FEE_BPS);
      expect(await feeRouter.owner()).to.equal(owner.address);
    });

    it("reverts on zero-address router, fee wallet, or owner", async function () {
      const FeeRouter = await ethers.getContractFactory("FeeRouter");
      const [owner, feeWallet] = await ethers.getSigners();

      await expect(
        FeeRouter.deploy(ethers.ZeroAddress, feeWallet.address, FEE_BPS, owner.address)
      ).to.be.revertedWithCustomError(FeeRouter, "ZeroAddress");

      await expect(
        FeeRouter.deploy(owner.address, ethers.ZeroAddress, FEE_BPS, owner.address)
      ).to.be.revertedWithCustomError(FeeRouter, "ZeroAddress");
    });

    it("reverts if initial feeBps exceeds the hard cap", async function () {
      const FeeRouter = await ethers.getContractFactory("FeeRouter");
      const [owner, feeWallet] = await ethers.getSigners();

      await expect(
        FeeRouter.deploy(owner.address, feeWallet.address, MAX_FEE_BPS + 1n, owner.address)
      )
        .to.be.revertedWithCustomError(FeeRouter, "FeeExceedsCap")
        .withArgs(MAX_FEE_BPS + 1n, MAX_FEE_BPS);
    });
  });

  describe("Normal ERC20 swap", function () {
    it("skims exactly the configured fee and forwards the remainder to the router", async function () {
      const { feeRouter, tokenIn, tokenOut, feeWallet, user } = await loadFixture(deployFixture);

      const amountIn = ONE_TOKEN * 100n; // 100 tokens
      const { fee, afterFee } = computeFee(amountIn);

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      const feeWalletBalBefore = await tokenIn.balanceOf(feeWallet.address);

      const tx = await feeRouter
        .connect(user)
        .swapExactTokensForTokensWithFee(
          amountIn,
          afterFee, // amountOutMin — mock router is 1:1 so afterFee is achievable
          [await tokenIn.getAddress(), await tokenOut.getAddress()],
          user.address,
          deadline
        );

      await expect(tx)
        .to.emit(feeRouter, "SwapExecuted")
        .withArgs(
          user.address,
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          fee
        );

      const feeWalletBalAfter = await tokenIn.balanceOf(feeWallet.address);
      expect(feeWalletBalAfter - feeWalletBalBefore).to.equal(fee);

      // Mock router is 1:1, so user should receive exactly `afterFee` of tokenOut.
      expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);

      // FeeRouter should hold zero standing balance of either token afterward.
      expect(await tokenIn.balanceOf(await feeRouter.getAddress())).to.equal(0);
      expect(await tokenOut.balanceOf(await feeRouter.getAddress())).to.equal(0);
    });
  });

  describe("Fee-on-BNB (native) swap", function () {
    it("skims exactly the configured fee from msg.value before swapping", async function () {
      const { feeRouter, tokenOut, feeWallet, user } = await loadFixture(deployFixture);

      const amountIn = ethers.parseEther("2");
      const { fee, afterFee } = computeFee(amountIn);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      const feeWalletBalBefore = await ethers.provider.getBalance(feeWallet.address);

      const tx = await feeRouter
        .connect(user)
        .swapExactETHForTokensWithFee(
          afterFee,
          [await feeRouter.pancakeRouter(), await tokenOut.getAddress()], // path[0] unused for ETH leg by mock, real router expects WBNB
          user.address,
          deadline,
          { value: amountIn }
        );

      await expect(tx).to.emit(feeRouter, "SwapExecuted");

      const feeWalletBalAfter = await ethers.provider.getBalance(feeWallet.address);
      expect(feeWalletBalAfter - feeWalletBalBefore).to.equal(fee);

      expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);
      expect(await ethers.provider.getBalance(await feeRouter.getAddress())).to.equal(0);
    });
  });

  describe("Zero-amount revert", function () {
    it("reverts swapExactTokensForTokensWithFee with amountIn == 0", async function () {
      const { feeRouter, tokenIn, tokenOut, user } = await loadFixture(deployFixture);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        feeRouter
          .connect(user)
          .swapExactTokensForTokensWithFee(
            0,
            0,
            [await tokenIn.getAddress(), await tokenOut.getAddress()],
            user.address,
            deadline
          )
      ).to.be.revertedWithCustomError(feeRouter, "ZeroAmount");
    });

    it("reverts swapExactETHForTokensWithFee with msg.value == 0", async function () {
      const { feeRouter, tokenOut, user } = await loadFixture(deployFixture);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        feeRouter
          .connect(user)
          .swapExactETHForTokensWithFee(
            0,
            [await feeRouter.pancakeRouter(), await tokenOut.getAddress()],
            user.address,
            deadline,
            { value: 0 }
          )
      ).to.be.revertedWithCustomError(feeRouter, "ZeroAmount");
    });
  });

  describe("Fee-cap revert", function () {
    it("reverts setFeeBps above MAX_FEE_BPS", async function () {
      const { feeRouter, owner } = await loadFixture(deployFixture);

      await expect(feeRouter.connect(owner).setFeeBps(MAX_FEE_BPS + 1n))
        .to.be.revertedWithCustomError(feeRouter, "FeeExceedsCap")
        .withArgs(MAX_FEE_BPS + 1n, MAX_FEE_BPS);
    });

    it("allows setFeeBps at exactly MAX_FEE_BPS", async function () {
      const { feeRouter, owner } = await loadFixture(deployFixture);
      await expect(feeRouter.connect(owner).setFeeBps(MAX_FEE_BPS))
        .to.emit(feeRouter, "FeeUpdated")
        .withArgs(FEE_BPS, MAX_FEE_BPS);
      expect(await feeRouter.feeBps()).to.equal(MAX_FEE_BPS);
    });

    it("reverts setFeeBps and setFeeWallet from a non-owner account", async function () {
      const { feeRouter, other, feeWallet } = await loadFixture(deployFixture);

      await expect(feeRouter.connect(other).setFeeBps(50)).to.be.revertedWithCustomError(
        feeRouter,
        "OwnableUnauthorizedAccount"
      );

      await expect(
        feeRouter.connect(other).setFeeWallet(feeWallet.address)
      ).to.be.revertedWithCustomError(feeRouter, "OwnableUnauthorizedAccount");
    });
  });

  describe("Reentrancy attempt", function () {
    it("blocks a malicious fee wallet from re-entering swapExactETHForTokensWithFee", async function () {
      const { feeRouter, tokenOut, owner, user } = await loadFixture(deployFixture);

      const MaliciousFeeWallet = await ethers.getContractFactory("MaliciousFeeWallet");
      const attacker = await MaliciousFeeWallet.deploy(await feeRouter.getAddress());

      await feeRouter.connect(owner).setFeeWallet(await attacker.getAddress());
      await attacker.setAttackPath([
        await feeRouter.pancakeRouter(),
        await tokenOut.getAddress(),
      ]);

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
      const amountIn = ethers.parseEther("1");

      // The outer swap itself must revert: the reentrant call inside
      // MaliciousFeeWallet.receive() reverts, which unwinds the raw `.call`
      // in FeeRouter — since we check `sent` and revert with
      // EthTransferFailed, the whole tx reverts, proving the guard held.
      await expect(
        feeRouter
          .connect(user)
          .swapExactETHForTokensWithFee(
            0,
            [await feeRouter.pancakeRouter(), await tokenOut.getAddress()],
            user.address,
            deadline,
            { value: amountIn }
          )
      ).to.be.reverted;

      expect(await attacker.attacked()).to.equal(false);
    });
  });

  describe("Paused-state revert", function () {
    it("blocks both swap entry points while paused, and non-owner cannot pause", async function () {
      const { feeRouter, tokenIn, tokenOut, owner, user, other } = await loadFixture(deployFixture);

      await expect(feeRouter.connect(other).pause()).to.be.revertedWithCustomError(
        feeRouter,
        "OwnableUnauthorizedAccount"
      );

      await feeRouter.connect(owner).pause();

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        feeRouter
          .connect(user)
          .swapExactTokensForTokensWithFee(
            ONE_TOKEN,
            0,
            [await tokenIn.getAddress(), await tokenOut.getAddress()],
            user.address,
            deadline
          )
      ).to.be.revertedWithCustomError(feeRouter, "EnforcedPause");

      await expect(
        feeRouter
          .connect(user)
          .swapExactETHForTokensWithFee(
            0,
            [await feeRouter.pancakeRouter(), await tokenOut.getAddress()],
            user.address,
            deadline,
            { value: ethers.parseEther("1") }
          )
      ).to.be.revertedWithCustomError(feeRouter, "EnforcedPause");

      // Unpause restores normal operation.
      await feeRouter.connect(owner).unpause();
      await expect(
        feeRouter
          .connect(user)
          .swapExactTokensForTokensWithFee(
            ONE_TOKEN,
            0,
            [await tokenIn.getAddress(), await tokenOut.getAddress()],
            user.address,
            deadline
          )
      ).to.not.be.reverted;
    });
  });
});