import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const FEE_BPS = 15n; // 0.15%
const BPS_DENOMINATOR = 10_000n;
const MAX_FEE_BPS = 100n; // 1%
const ONE_TOKEN = ethers.parseUnits("1", 18);

async function deployFixture() {
  const [owner, feeWallet, user, other] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokenIn = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  const tokenOut = await MockERC20.deploy("Test USDC", "tUSDC", 18);

  const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
  const mockRouter = await MockUniswapRouter.deploy();

  await tokenOut.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 18));
  await owner.sendTransaction({
    to: await mockRouter.getAddress(),
    value: ethers.parseEther("100"),
  });

  const EthFeeRouter = await ethers.getContractFactory("EthFeeRouter");
  const ethFeeRouter = await EthFeeRouter.deploy(
    await mockRouter.getAddress(),
    feeWallet.address,
    FEE_BPS,
    owner.address
  );

  await tokenIn.mint(user.address, ethers.parseUnits("1000", 18));
  await tokenIn.connect(user).approve(await ethFeeRouter.getAddress(), ethers.MaxUint256);

  return { owner, feeWallet, user, other, tokenIn, tokenOut, mockRouter, ethFeeRouter };
}

async function deflationaryFixture() {
  const base = await deployFixture();
  const { owner, mockRouter } = base;

  // 2% burned on every transfer — simulates a real deflationary/reflection token.
  const MockFeeOnTransferERC20 = await ethers.getContractFactory("MockFeeOnTransferERC20");
  const deflToken = await MockFeeOnTransferERC20.deploy("Deflationary Token", "DEFL", 200);

  await deflToken.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 18));
  // Router itself doesn't take the mint tax (from == address(0)), so it holds the full amount.

  return { ...base, deflToken };
}

function computeFee(amountIn: bigint, feeBps: bigint = FEE_BPS): { fee: bigint; afterFee: bigint } {
  const fee = (amountIn * feeBps) / BPS_DENOMINATOR;
  return { fee, afterFee: amountIn - fee };
}

describe("EthFeeRouter", function () {
  describe("Deployment", function () {
    it("sets constructor params correctly", async function () {
      const { ethFeeRouter, mockRouter, feeWallet, owner } = await loadFixture(deployFixture);
      expect(await ethFeeRouter.uniswapRouter()).to.equal(await mockRouter.getAddress());
      expect(await ethFeeRouter.feeWallet()).to.equal(feeWallet.address);
      expect(await ethFeeRouter.feeBps()).to.equal(FEE_BPS);
      expect(await ethFeeRouter.owner()).to.equal(owner.address);
    });

    it("reverts on zero-address router, fee wallet, or owner", async function () {
      const EthFeeRouter = await ethers.getContractFactory("EthFeeRouter");
      const [owner, feeWallet] = await ethers.getSigners();

      await expect(
        EthFeeRouter.deploy(ethers.ZeroAddress, feeWallet.address, FEE_BPS, owner.address)
      ).to.be.revertedWithCustomError(EthFeeRouter, "ZeroAddress");
    });

    it("reverts if initial feeBps exceeds the hard cap", async function () {
      const EthFeeRouter = await ethers.getContractFactory("EthFeeRouter");
      const [owner, feeWallet] = await ethers.getSigners();

      await expect(
        EthFeeRouter.deploy(owner.address, feeWallet.address, MAX_FEE_BPS + 1n, owner.address)
      )
        .to.be.revertedWithCustomError(EthFeeRouter, "FeeExceedsCap")
        .withArgs(MAX_FEE_BPS + 1n, MAX_FEE_BPS);
    });
  });

  describe("Normal ERC20 swap", function () {
    it("skims exactly the configured fee and forwards the remainder to the router", async function () {
      const { ethFeeRouter, tokenIn, tokenOut, feeWallet, user } = await loadFixture(deployFixture);

      const amountIn = ONE_TOKEN * 100n;
      const { fee, afterFee } = computeFee(amountIn);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      const feeWalletBalBefore = await tokenIn.balanceOf(feeWallet.address);

      const tx = await ethFeeRouter
        .connect(user)
        .swapExactTokensForTokensWithFee(
          amountIn,
          afterFee,
          [await tokenIn.getAddress(), await tokenOut.getAddress()],
          user.address,
          deadline
        );

      await expect(tx)
        .to.emit(ethFeeRouter, "SwapExecuted")
        .withArgs(user.address, await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, fee);

      expect((await tokenIn.balanceOf(feeWallet.address)) - feeWalletBalBefore).to.equal(fee);
      expect(await ethFeeRouter.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await tokenIn.balanceOf(await ethFeeRouter.getAddress())).to.equal(0);
      expect(await tokenOut.balanceOf(await ethFeeRouter.getAddress())).to.equal(0);
    });
  });

  describe("Fee-on-ETH (native) swap", function () {
    it("skims exactly the configured fee from msg.value before swapping", async function () {
      const { ethFeeRouter, tokenOut, feeWallet, user } = await loadFixture(deployFixture);

      const amountIn = ethers.parseEther("2");
      const { fee, afterFee } = computeFee(amountIn);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      const feeWalletBalBefore = await ethers.provider.getBalance(feeWallet.address);

      const tx = await ethFeeRouter
        .connect(user)
        .swapExactETHForTokensWithFee(
          afterFee,
          [await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()],
          user.address,
          deadline,
          { value: amountIn }
        );

      await expect(tx).to.emit(ethFeeRouter, "SwapExecuted");
      expect((await ethers.provider.getBalance(feeWallet.address)) - feeWalletBalBefore).to.equal(fee);
      expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);
    });
  });

  describe("Zero-amount revert", function () {
    it("reverts swapExactTokensForTokensWithFee with amountIn == 0", async function () {
      const { ethFeeRouter, tokenIn, tokenOut, user } = await loadFixture(deployFixture);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        ethFeeRouter
          .connect(user)
          .swapExactTokensForTokensWithFee(
            0,
            0,
            [await tokenIn.getAddress(), await tokenOut.getAddress()],
            user.address,
            deadline
          )
      ).to.be.revertedWithCustomError(ethFeeRouter, "ZeroAmount");
    });

    it("reverts swapExactETHForTokensWithFee with msg.value == 0", async function () {
      const { ethFeeRouter, tokenOut, user } = await loadFixture(deployFixture);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        ethFeeRouter
          .connect(user)
          .swapExactETHForTokensWithFee(
            0,
            [await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()],
            user.address,
            deadline,
            { value: 0 }
          )
      ).to.be.revertedWithCustomError(ethFeeRouter, "ZeroAmount");
    });
  });

  describe("Fee-cap revert", function () {
    it("reverts setFeeBps above MAX_FEE_BPS", async function () {
      const { ethFeeRouter, owner } = await loadFixture(deployFixture);
      await expect(ethFeeRouter.connect(owner).setFeeBps(MAX_FEE_BPS + 1n))
        .to.be.revertedWithCustomError(ethFeeRouter, "FeeExceedsCap")
        .withArgs(MAX_FEE_BPS + 1n, MAX_FEE_BPS);
    });

    it("reverts setFeeBps and setFeeWallet from a non-owner account", async function () {
      const { ethFeeRouter, other, feeWallet } = await loadFixture(deployFixture);

      await expect(ethFeeRouter.connect(other).setFeeBps(50)).to.be.revertedWithCustomError(
        ethFeeRouter,
        "OwnableUnauthorizedAccount"
      );
      await expect(
        ethFeeRouter.connect(other).setFeeWallet(feeWallet.address)
      ).to.be.revertedWithCustomError(ethFeeRouter, "OwnableUnauthorizedAccount");
    });
  });

  describe("Paused-state revert", function () {
    it("blocks both swap entry points while paused, and non-owner cannot pause", async function () {
      const { ethFeeRouter, tokenIn, tokenOut, owner, user, other } = await loadFixture(deployFixture);

      await expect(ethFeeRouter.connect(other).pause()).to.be.revertedWithCustomError(
        ethFeeRouter,
        "OwnableUnauthorizedAccount"
      );

      await ethFeeRouter.connect(owner).pause();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        ethFeeRouter
          .connect(user)
          .swapExactTokensForTokensWithFee(
            ONE_TOKEN,
            0,
            [await tokenIn.getAddress(), await tokenOut.getAddress()],
            user.address,
            deadline
          )
      ).to.be.revertedWithCustomError(ethFeeRouter, "EnforcedPause");

      await expect(
        ethFeeRouter
          .connect(user)
          .swapExactETHForTokensWithFee(
            0,
            [await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()],
            user.address,
            deadline,
            { value: ethers.parseEther("1") }
          )
      ).to.be.revertedWithCustomError(ethFeeRouter, "EnforcedPause");

      await ethFeeRouter.connect(owner).unpause();
      await expect(
        ethFeeRouter
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

  describe("Fee-on-transfer token handling (Phase 2 gate item)", function () {
    it("computes the fee off actually-received tokenIn balance, not the nominal amountIn, when tokenIn is deflationary", async function () {
      const { ethFeeRouter, deflToken, tokenOut, feeWallet, owner, user } = await loadFixture(
        deflationaryFixture
      );

      await deflToken.mint(user.address, ethers.parseUnits("1000", 18));
      await deflToken.connect(user).approve(await ethFeeRouter.getAddress(), ethers.MaxUint256);

      const amountIn = ethers.parseUnits("100", 18);
      // 2% transfer tax means the router only actually receives 98% of amountIn.
      const actualReceived = (amountIn * 9800n) / 10_000n;
      const { fee: expectedFee, afterFee: expectedAfterFee } = computeFee(actualReceived);

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      const feeWalletBalBefore = await deflToken.balanceOf(feeWallet.address);

      const tx = await ethFeeRouter
        .connect(user)
        .swapExactTokensForTokensWithFee(
          amountIn,
          0,
          [await deflToken.getAddress(), await tokenOut.getAddress()],
          user.address,
          deadline
        );

      // Fee is computed off the ~98 tokens actually received, not the
      // nominal 100 — if the contract trusted amountIn naively, the fee
      // here would be wrong (and it could even attempt to transfer more
      // than it holds, since the extra 2% never arrived).
      await expect(tx)
        .to.emit(ethFeeRouter, "SwapExecuted")
        .withArgs(
          user.address,
          await deflToken.getAddress(),
          await tokenOut.getAddress(),
          actualReceived,
          expectedFee
        );

      const feeWalletBalAfter = await deflToken.balanceOf(feeWallet.address);
      // The fee wallet itself also takes the 2% tax on the transfer it receives.
      const expectedFeeWalletDelta = (expectedFee * 9800n) / 10_000n;
      expect(feeWalletBalAfter - feeWalletBalBefore).to.equal(expectedFeeWalletDelta);

      expect(await deflToken.balanceOf(await ethFeeRouter.getAddress())).to.equal(0);
    });

    it("uses the SupportingFeeOnTransferTokens path correctly for a deflationary output token", async function () {
      const { ethFeeRouter, tokenIn, mockRouter, feeWallet, owner, user } = await loadFixture(
        deflationaryFixture
      );

      const MockFeeOnTransferERC20 = await ethers.getContractFactory("MockFeeOnTransferERC20");
      const deflOut = await MockFeeOnTransferERC20.deploy("Deflationary Out", "DOUT", 300); // 3% tax
      await deflOut.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 18));

      const amountIn = ONE_TOKEN * 50n;
      const { afterFee } = computeFee(amountIn);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      // afterFee tokens go into the mock router at a 1:1 rate, but the
      // 3% tax on deflOut means `user` receives less than `afterFee`.
      const expectedUserReceipt = (afterFee * 9700n) / 10_000n;

      await ethFeeRouter
        .connect(user)
        .swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens(
          amountIn,
          0, // amountOutMin — real usage should compute this off-chain with slippage tolerance
          [await tokenIn.getAddress(), await deflOut.getAddress()],
          user.address,
          deadline
        );

      expect(await deflOut.balanceOf(user.address)).to.equal(expectedUserReceipt);
    });
  });

  describe("feeWallet DoS fix — swap succeeds even when feeWallet can't receive", function () {
    it("credits the pending-fee ledger instead of blocking the swap when feeWallet reverts", async function () {
      const { ethFeeRouter, tokenOut, owner, user } = await loadFixture(deployFixture);

      const MaliciousFeeWallet = await ethers.getContractFactory("MaliciousFeeWallet");
      const attacker = await MaliciousFeeWallet.deploy(await ethFeeRouter.getAddress());
      await ethFeeRouter.connect(owner).setFeeWallet(await attacker.getAddress());
      await attacker.setAttackPath([await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()]);

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
      const amountIn = ethers.parseEther("1");
      const { fee, afterFee } = computeFee(amountIn);

      const tx = ethFeeRouter
        .connect(user)
        .swapExactETHForTokensWithFee(
          0,
          [await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()],
          user.address,
          deadline,
          { value: amountIn }
        );

      await expect(tx)
        .to.emit(ethFeeRouter, "FeeWalletTransferFailed")
        .withArgs(await attacker.getAddress(), fee);
      await expect(tx).to.emit(ethFeeRouter, "SwapExecuted");

      expect(await attacker.attacked()).to.equal(false);
      expect(await ethFeeRouter.pendingEthFeesByWallet(await attacker.getAddress())).to.equal(fee);
      expect(await ethFeeRouter.totalPendingEthFees()).to.equal(fee);
      expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);
    });

    it("lets the address a fee accrued to withdraw it later even after feeWallet changes, redirecting to a chosen recipient", async function () {
      const { ethFeeRouter, tokenOut, owner, user, other } = await loadFixture(deployFixture);

      const MaliciousFeeWallet = await ethers.getContractFactory("MaliciousFeeWallet");
      const attacker = await MaliciousFeeWallet.deploy(await ethFeeRouter.getAddress());
      await ethFeeRouter.connect(owner).setFeeWallet(await attacker.getAddress());
      await attacker.setAttackPath([await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()]);

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
      const amountIn = ethers.parseEther("1");
      const { fee } = computeFee(amountIn);

      await ethFeeRouter
        .connect(user)
        .swapExactETHForTokensWithFee(
          0,
          [await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()],
          user.address,
          deadline,
          { value: amountIn }
        );

      // Owner moves feeWallet elsewhere — the new feeWallet must not
      // inherit fees that accrued to the old one.
      await ethFeeRouter.connect(owner).setFeeWallet(other.address);
      expect(await ethFeeRouter.pendingEthFeesByWallet(other.address)).to.equal(0);
      await expect(
        ethFeeRouter.connect(other).withdrawPendingEthFees(other.address)
      ).to.be.revertedWithCustomError(ethFeeRouter, "NothingToWithdraw");

      // The old feeWallet can still claim what accrued to it, redirected
      // to any recipient (the blacklist-redirect fix).
      const balBefore = await ethers.provider.getBalance(other.address);
      const iface = ethFeeRouter.interface;
      await attacker.execute(iface.encodeFunctionData("withdrawPendingEthFees", [other.address]));
      const balAfter = await ethers.provider.getBalance(other.address);

      expect(balAfter - balBefore).to.equal(fee);
      expect(await ethFeeRouter.pendingEthFeesByWallet(await attacker.getAddress())).to.equal(0);
      expect(await ethFeeRouter.totalPendingEthFees()).to.equal(0);
    });
  });

  describe("to == address(0) validation", function () {
    it("reverts swapExactTokensForTokensWithFee and swapExactETHForTokensWithFee when to is the zero address", async function () {
      const { ethFeeRouter, tokenIn, tokenOut, user } = await loadFixture(deployFixture);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        ethFeeRouter
          .connect(user)
          .swapExactTokensForTokensWithFee(
            ONE_TOKEN,
            0,
            [await tokenIn.getAddress(), await tokenOut.getAddress()],
            ethers.ZeroAddress,
            deadline
          )
      ).to.be.revertedWithCustomError(ethFeeRouter, "ZeroAddress");

      await expect(
        ethFeeRouter
          .connect(user)
          .swapExactETHForTokensWithFee(
            0,
            [await ethFeeRouter.uniswapRouter(), await tokenOut.getAddress()],
            ethers.ZeroAddress,
            deadline,
            { value: ethers.parseEther("1") }
          )
      ).to.be.revertedWithCustomError(ethFeeRouter, "ZeroAddress");
    });
  });

  describe("Rescue functions", function () {
    it("lets the owner rescue tokens sent directly to the contract, but not pending fees", async function () {
      const { ethFeeRouter, tokenIn, owner, other } = await loadFixture(deployFixture);

      await tokenIn.mint(await ethFeeRouter.getAddress(), ethers.parseUnits("5", 18));

      await expect(
        ethFeeRouter
          .connect(other)
          .rescueERC20(await tokenIn.getAddress(), ethers.parseUnits("5", 18), other.address)
      ).to.be.revertedWithCustomError(ethFeeRouter, "OwnableUnauthorizedAccount");

      await ethFeeRouter
        .connect(owner)
        .rescueERC20(await tokenIn.getAddress(), ethers.parseUnits("5", 18), other.address);
      expect(await tokenIn.balanceOf(other.address)).to.equal(ethers.parseUnits("5", 18));

      await expect(
        ethFeeRouter.connect(owner).rescueERC20(await tokenIn.getAddress(), 1, other.address)
      ).to.be.revertedWithCustomError(ethFeeRouter, "InsufficientRescueBalance");
    });
  });
});
