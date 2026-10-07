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

  // V3 mock router + wrapped-native mock, deployed alongside the V2 ones
  // on every fixture so both the existing V2 tests and the new V3 tests
  // (below) share one deployment path.
  const MockPancakeV3Router = await ethers.getContractFactory("MockPancakeV3Router");
  const mockV3Router = await MockPancakeV3Router.deploy();

  const MockWETH = await ethers.getContractFactory("MockWETH");
  const wrappedNative = await MockWETH.deploy();

  await tokenOut.mint(await mockV3Router.getAddress(), ethers.parseUnits("1000000", 18));
  await wrappedNative.mint(await mockV3Router.getAddress(), ethers.parseUnits("1000000", 18));
  // Funds the mock WETH's own balance so withdraw() (called by FeeRouter
  // when unwrapping a token->BNB V3 swap's output) has real ETH to pay out.
  await owner.sendTransaction({
    to: await wrappedNative.getAddress(),
    value: ethers.parseEther("100"),
  });

  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouter.deploy(
    await mockRouter.getAddress(),
    await mockV3Router.getAddress(),
    await wrappedNative.getAddress(),
    ethers.ZeroAddress,
    feeWallet.address,
    FEE_BPS,
    owner.address
  );

  // Fund the user with tokenIn and approve the FeeRouter.
  await tokenIn.mint(user.address, ethers.parseUnits("1000", 18));
  await tokenIn.connect(user).approve(await feeRouter.getAddress(), ethers.MaxUint256);
  await wrappedNative.connect(user).approve(await feeRouter.getAddress(), ethers.MaxUint256);

  return { owner, feeWallet, user, other, tokenIn, tokenOut, mockRouter, mockV3Router, wrappedNative, feeRouter };
}

async function deflationaryFixture() {
  const base = await deployFixture();
  const { owner, mockRouter } = base;

  // 2% burned on every transfer — simulates a real deflationary/reflection
  // token (BSC has many of these, including Alfat's 6% transfer tax).
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

describe("FeeRouter", function () {
  describe("Deployment", function () {
    it("sets constructor params correctly", async function () {
      const { feeRouter, mockRouter, mockV3Router, wrappedNative, feeWallet, owner } = await loadFixture(deployFixture);
      expect(await feeRouter.pancakeRouter()).to.equal(await mockRouter.getAddress());
      expect(await feeRouter.v3Router()).to.equal(await mockV3Router.getAddress());
      expect(await feeRouter.wrappedNative()).to.equal(await wrappedNative.getAddress());
      expect(await feeRouter.feeWallet()).to.equal(feeWallet.address);
      expect(await feeRouter.feeBps()).to.equal(FEE_BPS);
      expect(await feeRouter.owner()).to.equal(owner.address);
    });

    it("reverts on zero-address router, fee wallet, or owner", async function () {
      const FeeRouter = await ethers.getContractFactory("FeeRouter");
      const [owner, feeWallet] = await ethers.getSigners();

      await expect(
        FeeRouter.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, feeWallet.address, FEE_BPS, owner.address)
      ).to.be.revertedWithCustomError(FeeRouter, "ZeroAddress");

      await expect(
        FeeRouter.deploy(owner.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, FEE_BPS, owner.address)
      ).to.be.revertedWithCustomError(FeeRouter, "ZeroAddress");
    });

    it("reverts if initial feeBps exceeds the hard cap", async function () {
      const FeeRouter = await ethers.getContractFactory("FeeRouter");
      const [owner, feeWallet] = await ethers.getSigners();

      await expect(
        FeeRouter.deploy(owner.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, feeWallet.address, MAX_FEE_BPS + 1n, owner.address)
      )
        .to.be.revertedWithCustomError(FeeRouter, "FeeExceedsCap")
        .withArgs(MAX_FEE_BPS + 1n, MAX_FEE_BPS);
    });

    it("allows deploying with V3 support disabled (zero v3Router/wrappedNative)", async function () {
      const FeeRouter = await ethers.getContractFactory("FeeRouter");
      const [owner, feeWallet] = await ethers.getSigners();

      const feeRouter = await FeeRouter.deploy(
        owner.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        feeWallet.address,
        FEE_BPS,
        owner.address
      );
      expect(await feeRouter.v3Router()).to.equal(ethers.ZeroAddress);
      expect(await feeRouter.wrappedNative()).to.equal(ethers.ZeroAddress);
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
    it("blocks a malicious fee wallet from re-entering, and the swap still succeeds with the fee held as pending", async function () {
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
      const { fee, afterFee } = computeFee(amountIn);

      // The reentrant call inside MaliciousFeeWallet.receive() still
      // reverts (nonReentrant holds — attacked() stays false), but that no
      // longer takes the whole swap down with it: the failed fee push is
      // now credited to the pending-fee ledger instead, and the user's
      // swap completes normally. This is the fix for the feeWallet-DoS
      // finding.
      const tx = feeRouter
        .connect(user)
        .swapExactETHForTokensWithFee(
          0,
          [await feeRouter.pancakeRouter(), await tokenOut.getAddress()],
          user.address,
          deadline,
          { value: amountIn }
        );

      await expect(tx)
        .to.emit(feeRouter, "FeeWalletTransferFailed")
        .withArgs(await attacker.getAddress(), fee);
      await expect(tx).to.emit(feeRouter, "SwapExecuted");

      expect(await attacker.attacked()).to.equal(false);
      expect(await feeRouter.pendingEthFeesByWallet(await attacker.getAddress())).to.equal(fee);
      expect(await feeRouter.totalPendingEthFees()).to.equal(fee);
      expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);
    });

    it("lets the address a fee accrued to withdraw it later even after feeWallet changes, redirecting to a chosen recipient", async function () {
      const { feeRouter, tokenOut, owner, user, other } = await loadFixture(deployFixture);

      const MaliciousFeeWallet = await ethers.getContractFactory("MaliciousFeeWallet");
      const attacker = await MaliciousFeeWallet.deploy(await feeRouter.getAddress());
      await feeRouter.connect(owner).setFeeWallet(await attacker.getAddress());
      await attacker.setAttackPath([await feeRouter.pancakeRouter(), await tokenOut.getAddress()]);

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
      const amountIn = ethers.parseEther("1");
      const { fee } = computeFee(amountIn);

      await feeRouter
        .connect(user)
        .swapExactETHForTokensWithFee(
          0,
          [await feeRouter.pancakeRouter(), await tokenOut.getAddress()],
          user.address,
          deadline,
          { value: amountIn }
        );
      expect(await feeRouter.pendingEthFeesByWallet(await attacker.getAddress())).to.equal(fee);

      // Owner now points feeWallet elsewhere entirely — this is the moment
      // the original bug would have stranded the accrued fee: `other`
      // becoming the *current* feeWallet must NOT give it access to fees
      // that accrued to the malicious contract before it.
      await feeRouter.connect(owner).setFeeWallet(other.address);
      expect(await feeRouter.pendingEthFeesByWallet(other.address)).to.equal(0);
      await expect(
        feeRouter.connect(other).withdrawPendingEthFees(other.address)
      ).to.be.revertedWithCustomError(feeRouter, "NothingToWithdraw");

      // The old feeWallet can still claim exactly what accrued to it,
      // redirected to any recipient it chooses (the blacklist-redirect
      // fix) — here, to `other`, proving the funds are genuinely
      // recoverable, not just correctly accounted for in a mapping.
      const balBefore = await ethers.provider.getBalance(other.address);
      const iface = feeRouter.interface;
      await attacker.execute(iface.encodeFunctionData("withdrawPendingEthFees", [other.address]));
      const balAfter = await ethers.provider.getBalance(other.address);

      expect(balAfter - balBefore).to.equal(fee);
      expect(await feeRouter.pendingEthFeesByWallet(await attacker.getAddress())).to.equal(0);
      expect(await feeRouter.totalPendingEthFees()).to.equal(0);
    });
  });

  describe("to == address(0) validation", function () {
    it("reverts swapExactTokensForTokensWithFee and swapExactETHForTokensWithFee when to is the zero address", async function () {
      const { feeRouter, tokenIn, tokenOut, user } = await loadFixture(deployFixture);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await expect(
        feeRouter
          .connect(user)
          .swapExactTokensForTokensWithFee(
            ONE_TOKEN,
            0,
            [await tokenIn.getAddress(), await tokenOut.getAddress()],
            ethers.ZeroAddress,
            deadline
          )
      ).to.be.revertedWithCustomError(feeRouter, "ZeroAddress");

      await expect(
        feeRouter
          .connect(user)
          .swapExactETHForTokensWithFee(
            0,
            [await feeRouter.pancakeRouter(), await tokenOut.getAddress()],
            ethers.ZeroAddress,
            deadline,
            { value: ethers.parseEther("1") }
          )
      ).to.be.revertedWithCustomError(feeRouter, "ZeroAddress");
    });
  });

  describe("Rescue functions", function () {
    it("lets the owner rescue tokens sent directly to the contract, but not pending fees", async function () {
      const { feeRouter, tokenIn, owner, other } = await loadFixture(deployFixture);

      // Simulate an accidental direct transfer, outside the swap flow.
      await tokenIn.mint(await feeRouter.getAddress(), ethers.parseUnits("5", 18));

      await expect(
        feeRouter.connect(other).rescueERC20(await tokenIn.getAddress(), ethers.parseUnits("5", 18), other.address)
      ).to.be.revertedWithCustomError(feeRouter, "OwnableUnauthorizedAccount");

      await feeRouter.connect(owner).rescueERC20(await tokenIn.getAddress(), ethers.parseUnits("5", 18), other.address);
      expect(await tokenIn.balanceOf(other.address)).to.equal(ethers.parseUnits("5", 18));

      // Can't rescue more than what's actually sitting there.
      await expect(
        feeRouter.connect(owner).rescueERC20(await tokenIn.getAddress(), 1, other.address)
      ).to.be.revertedWithCustomError(feeRouter, "InsufficientRescueBalance");
    });

    it("lets the owner rescue stray ETH but never touches pending fees", async function () {
      const { feeRouter, tokenOut, owner, user, other } = await loadFixture(deployFixture);

      // Accrue a pending fee via the malicious-feeWallet path.
      const MaliciousFeeWallet = await ethers.getContractFactory("MaliciousFeeWallet");
      const attacker = await MaliciousFeeWallet.deploy(await feeRouter.getAddress());
      await feeRouter.connect(owner).setFeeWallet(await attacker.getAddress());
      await attacker.setAttackPath([await feeRouter.pancakeRouter(), await tokenOut.getAddress()]);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
      const amountIn = ethers.parseEther("1");
      const { fee } = computeFee(amountIn);
      await feeRouter
        .connect(user)
        .swapExactETHForTokensWithFee(
          0,
          [await feeRouter.pancakeRouter(), await tokenOut.getAddress()],
          user.address,
          deadline,
          { value: amountIn }
        );

      // Also send some stray ETH directly.
      await owner.sendTransaction({ to: await feeRouter.getAddress(), value: ethers.parseEther("2") });

      // Only the stray 2 ETH is rescuable, not the pending fee.
      await expect(
        feeRouter.connect(owner).rescueETH(ethers.parseEther("2") + fee, other.address)
      ).to.be.revertedWithCustomError(feeRouter, "InsufficientRescueBalance");

      const balBefore = await ethers.provider.getBalance(other.address);
      await feeRouter.connect(owner).rescueETH(ethers.parseEther("2"), other.address);
      const balAfter = await ethers.provider.getBalance(other.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("2"));
      expect(await feeRouter.pendingEthFeesByWallet(await attacker.getAddress())).to.equal(fee);
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

  describe("Fee-on-transfer token handling", function () {
    it("computes the fee off actually-received tokenIn balance, not the nominal amountIn, when tokenIn is deflationary", async function () {
      const { feeRouter, deflToken, tokenOut, feeWallet, user } = await loadFixture(
        deflationaryFixture
      );

      await deflToken.mint(user.address, ethers.parseUnits("1000", 18));
      await deflToken.connect(user).approve(await feeRouter.getAddress(), ethers.MaxUint256);

      const amountIn = ethers.parseUnits("100", 18);
      // 2% transfer tax means the router only actually receives 98% of amountIn.
      const actualReceived = (amountIn * 9800n) / 10_000n;
      const { fee: expectedFee } = computeFee(actualReceived);

      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      const feeWalletBalBefore = await deflToken.balanceOf(feeWallet.address);

      const tx = await feeRouter
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
      // than it holds, since the extra 2% never arrived). This is exactly
      // the bug class that made Alfat (6% transfer tax) unsafe to list
      // before this fix.
      await expect(tx)
        .to.emit(feeRouter, "SwapExecuted")
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

      expect(await deflToken.balanceOf(await feeRouter.getAddress())).to.equal(0);
    });

    it("uses the SupportingFeeOnTransferTokens path correctly for a deflationary output token", async function () {
      const { feeRouter, tokenIn, mockRouter, user } = await loadFixture(deflationaryFixture);

      const MockFeeOnTransferERC20 = await ethers.getContractFactory("MockFeeOnTransferERC20");
      const deflOut = await MockFeeOnTransferERC20.deploy("Deflationary Out", "DOUT", 300); // 3% tax
      await deflOut.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 18));

      const amountIn = ONE_TOKEN * 50n;
      const { afterFee } = computeFee(amountIn);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      // afterFee tokens go into the mock router at a 1:1 rate, but the
      // 3% tax on deflOut means `user` receives less than `afterFee`.
      const expectedUserReceipt = (afterFee * 9700n) / 10_000n;

      await feeRouter
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

    it("uses the SupportingFeeOnTransferTokens path correctly when buying a deflationary token with native BNB", async function () {
      const { feeRouter, mockRouter, feeWallet, user } = await loadFixture(deflationaryFixture);

      // Simulates buying Alfat (6% transfer tax) with BNB — the exact flow
      // that made this entry point necessary.
      const MockFeeOnTransferERC20 = await ethers.getContractFactory("MockFeeOnTransferERC20");
      const alfatLike = await MockFeeOnTransferERC20.deploy("Alfat-like", "ALFAT", 600); // 6% tax
      await alfatLike.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 18));

      const swapAmount = ethers.parseEther("1");
      const { fee: expectedFee, afterFee } = computeFee(swapAmount);
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      // afterFee BNB buys `afterFee` ALFAT-like tokens at the mock's 1:1
      // rate, but the 6% tax on receipt means `user` gets less than that.
      const expectedUserReceipt = (afterFee * 9400n) / 10_000n;

      const feeWalletBalBefore = await ethers.provider.getBalance(feeWallet.address);

      await feeRouter
        .connect(user)
        .swapExactETHForTokensWithFeeSupportingFeeOnTransferTokens(
          0, // amountOutMin — real usage should compute this off-chain with slippage tolerance
          [await feeRouter.pancakeRouter(), await alfatLike.getAddress()],
          user.address,
          deadline,
          { value: swapAmount }
        );

      expect(await alfatLike.balanceOf(user.address)).to.equal(expectedUserReceipt);

      const feeWalletBalAfter = await ethers.provider.getBalance(feeWallet.address);
      expect(feeWalletBalAfter - feeWalletBalBefore).to.equal(expectedFee);
    });
  });

  describe("PancakeSwap V3 support", function () {
    // Packs a V3 path the same way the frontend would: token(20) . fee(3) . token(20) [...].
    function encodeV3Path(tokens: string[], fees: number[]): string {
      let path = tokens[0].toLowerCase();
      for (let i = 0; i < fees.length; i++) {
        path += fees[i].toString(16).padStart(6, "0") + tokens[i + 1].slice(2).toLowerCase();
      }
      return path;
    }

    async function deployV3DisabledFixture() {
      const base = await deployFixture();
      const { owner, mockRouter, feeWallet } = base;

      const FeeRouter = await ethers.getContractFactory("FeeRouter");
      const v3DisabledRouter = await FeeRouter.deploy(
        await mockRouter.getAddress(),
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        feeWallet.address,
        FEE_BPS,
        owner.address
      );
      return { ...base, v3DisabledRouter };
    }

    describe("Single-hop token -> token (exactInputSingle)", function () {
      it("skims the fee and swaps the remainder at the mock's rate", async function () {
        const { feeRouter, user, tokenIn, tokenOut } = await loadFixture(deployFixture);
        const amountIn = ONE_TOKEN;
        const { fee: expectedFee, afterFee } = computeFee(amountIn);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

        await expect(
          feeRouter
            .connect(user)
            .swapExactTokensForTokensV3WithFee(
              amountIn,
              0,
              await tokenIn.getAddress(),
              await tokenOut.getAddress(),
              500,
              user.address,
              deadline
            )
        )
          .to.emit(feeRouter, "SwapExecuted")
          .withArgs(user.address, await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, expectedFee);

        expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);
      });

      it("reverts with ZeroFeeTier on fee == 0", async function () {
        const { feeRouter, user, tokenIn, tokenOut } = await loadFixture(deployFixture);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

        await expect(
          feeRouter
            .connect(user)
            .swapExactTokensForTokensV3WithFee(
              ONE_TOKEN,
              0,
              await tokenIn.getAddress(),
              await tokenOut.getAddress(),
              0,
              user.address,
              deadline
            )
        ).to.be.revertedWithCustomError(feeRouter, "ZeroFeeTier");
      });

      it("reverts with V3RouterNotSet when deployed without a v3Router", async function () {
        const { v3DisabledRouter, user, tokenIn, tokenOut } = await loadFixture(deployV3DisabledFixture);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

        await tokenIn.mint(user.address, ONE_TOKEN);
        await tokenIn.connect(user).approve(await v3DisabledRouter.getAddress(), ethers.MaxUint256);

        await expect(
          v3DisabledRouter
            .connect(user)
            .swapExactTokensForTokensV3WithFee(
              ONE_TOKEN,
              0,
              await tokenIn.getAddress(),
              await tokenOut.getAddress(),
              500,
              user.address,
              deadline
            )
        ).to.be.revertedWithCustomError(v3DisabledRouter, "V3RouterNotSet");
      });

      it("respects pause()", async function () {
        const { feeRouter, owner, user, tokenIn, tokenOut } = await loadFixture(deployFixture);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
        await feeRouter.connect(owner).pause();

        await expect(
          feeRouter
            .connect(user)
            .swapExactTokensForTokensV3WithFee(
              ONE_TOKEN,
              0,
              await tokenIn.getAddress(),
              await tokenOut.getAddress(),
              500,
              user.address,
              deadline
            )
        ).to.be.revertedWithCustomError(feeRouter, "EnforcedPause");
      });
    });

    describe("Multi-hop token -> token (exactInput)", function () {
      it("decodes tokenIn/tokenOut from the path and swaps correctly", async function () {
        const { feeRouter, user, tokenIn, tokenOut, mockV3Router } = await loadFixture(deployFixture);
        const intermediate = await (await ethers.getContractFactory("MockERC20")).deploy("Mid", "MID", 18);
        await intermediate.mint(await mockV3Router.getAddress(), ethers.parseUnits("1000000", 18));

        const amountIn = ONE_TOKEN;
        const { fee: expectedFee, afterFee } = computeFee(amountIn);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
        const path = encodeV3Path(
          [await tokenIn.getAddress(), await intermediate.getAddress(), await tokenOut.getAddress()],
          [500, 500]
        );

        await expect(
          feeRouter.connect(user).swapExactTokensForTokensV3MultiHopWithFee(amountIn, 0, path, user.address, deadline)
        )
          .to.emit(feeRouter, "SwapExecuted")
          .withArgs(user.address, await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, expectedFee);

        expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);
      });

      it("reverts with InvalidV3Path on a malformed path length", async function () {
        const { feeRouter, user, tokenIn } = await loadFixture(deployFixture);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
        // 20 + 3 + 20 + 1 stray byte — not a valid packed path length.
        const badPath = encodeV3Path([await tokenIn.getAddress(), await tokenIn.getAddress()], [500]) + "00";

        await expect(
          feeRouter.connect(user).swapExactTokensForTokensV3MultiHopWithFee(ONE_TOKEN, 0, badPath, user.address, deadline)
        ).to.be.revertedWithCustomError(feeRouter, "InvalidV3Path");
      });
    });

    describe("Native BNB -> token (exactInputSingle, wrap-then-swap)", function () {
      it("skims the fee off msg.value, wraps the remainder, and delivers tokenOut", async function () {
        const { feeRouter, user, tokenOut } = await loadFixture(deployFixture);
        const amountIn = ethers.parseEther("1");
        const { afterFee } = computeFee(amountIn);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

        await feeRouter
          .connect(user)
          .swapExactETHForTokensV3WithFee(0, await tokenOut.getAddress(), 500, user.address, deadline, {
            value: amountIn,
          });

        expect(await tokenOut.balanceOf(user.address)).to.equal(afterFee);
      });

      it("reverts with WrappedNativeNotSet when v3Router is set but wrappedNative isn't", async function () {
        const { owner, mockRouter, mockV3Router, feeWallet, user, tokenOut } = await loadFixture(deployFixture);
        const FeeRouter = await ethers.getContractFactory("FeeRouter");
        const noWrappedNative = await FeeRouter.deploy(
          await mockRouter.getAddress(),
          await mockV3Router.getAddress(),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          feeWallet.address,
          FEE_BPS,
          owner.address
        );
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

        await expect(
          noWrappedNative
            .connect(user)
            .swapExactETHForTokensV3WithFee(0, await tokenOut.getAddress(), 500, user.address, deadline, {
              value: ethers.parseEther("1"),
            })
        ).to.be.revertedWithCustomError(noWrappedNative, "WrappedNativeNotSet");
      });
    });

    describe("Token -> native BNB (exactInputSingle, swap-then-unwrap)", function () {
      it("delivers native BNB to `to`, net of fee", async function () {
        const { feeRouter, user, tokenIn } = await loadFixture(deployFixture);
        const amountIn = ONE_TOKEN;
        const { afterFee } = computeFee(amountIn);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

        const balBefore = await ethers.provider.getBalance(user.address);
        const tx = await feeRouter
          .connect(user)
          .swapExactTokensForETHV3WithFee(amountIn, 0, await tokenIn.getAddress(), 500, user.address, deadline);
        const receipt = await tx.wait();
        const gasCost = receipt!.gasUsed * receipt!.gasPrice;
        const balAfter = await ethers.provider.getBalance(user.address);

        // Mock rate is 1:1, so BNB received should equal `afterFee` (in wei),
        // net of the gas this same tx spent.
        expect(balAfter - balBefore + gasCost).to.equal(afterFee);
      });
    });

    describe("Multi-hop native BNB paths — endpoint validation", function () {
      it("reverts with InvalidV3Path if a BNB->token multi-hop path doesn't start with wrappedNative", async function () {
        const { feeRouter, user, tokenIn, tokenOut } = await loadFixture(deployFixture);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
        // Wrong first token — should be `wrappedNative`, not `tokenIn`.
        const badPath = encodeV3Path([await tokenIn.getAddress(), await tokenOut.getAddress()], [500]);

        await expect(
          feeRouter.connect(user).swapExactETHForTokensV3MultiHopWithFee(0, badPath, user.address, deadline, {
            value: ethers.parseEther("1"),
          })
        ).to.be.revertedWithCustomError(feeRouter, "InvalidV3Path");
      });

      it("reverts with InvalidV3Path if a token->BNB multi-hop path doesn't end with wrappedNative", async function () {
        const { feeRouter, user, tokenIn, tokenOut } = await loadFixture(deployFixture);
        const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
        // Wrong last token — should be `wrappedNative`, not `tokenOut`.
        const badPath = encodeV3Path([await tokenIn.getAddress(), await tokenOut.getAddress()], [500]);

        await expect(
          feeRouter
            .connect(user)
            .swapExactTokensForETHV3MultiHopWithFee(ONE_TOKEN, 0, badPath, user.address, deadline)
        ).to.be.revertedWithCustomError(feeRouter, "InvalidV3Path");
      });
    });
  });
});