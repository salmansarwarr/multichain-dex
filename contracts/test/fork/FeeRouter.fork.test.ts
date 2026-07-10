/**
 * Phase 1 validation gate — manual fork test.
 *
 * Forks BSC mainnet at a pinned block and executes a REAL WBNB -> BUSD
 * swap through FeeRouter against live PancakeSwap V2 liquidity, then
 * confirms the fee wallet's WBNB balance increased by exactly 0.15% of
 * amountIn.
 *
 * WHY THIS IS SEPARATE FROM THE MAIN UNIT TEST SUITE:
 * This test needs a real archive-capable BSC RPC endpoint (Alchemy,
 * QuickNode, Ankr, etc. — the free public RPCs are usually not
 * archive-enabled for older blocks). It's also inherently non-deterministic
 * if you don't pin a block, and slow/costly to run on every commit. So it's
 * gated behind env vars and excluded from the default `npm test` run.
 *
 * This sandbox's network egress allowlist does not include BSC RPC
 * providers, so this test has NOT been executed in this environment —
 * only written and reviewed. Run it for real on your machine/CI before
 * treating the Phase 1 gate as fully closed.
 *
 * Usage:
 *   BSC_MAINNET_ARCHIVE_RPC_URL=https://your-archive-rpc \
 *   FORK_BLOCK_NUMBER=40000000 \
 *   RUN_FORK_TESTS=true \
 *   npx hardhat test test/fork/FeeRouter.fork.test.ts
 */
import { expect } from "chai";
import { ethers, network } from "hardhat";

const RUN_FORK_TESTS = process.env.RUN_FORK_TESTS === "true";
const BSC_MAINNET_ARCHIVE_RPC_URL = process.env.BSC_MAINNET_ARCHIVE_RPC_URL || "";
const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER
  ? parseInt(process.env.FORK_BLOCK_NUMBER, 10)
  : undefined;

// --- Real BSC mainnet addresses ---
const PANCAKE_ROUTER_V2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const BUSD = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";

// Minimal WBNB ABI — just enough to wrap native BNB into WBNB ourselves.
// This avoids depending on any specific whale address holding WBNB at the
// pinned block (whale balances drift over time and are fragile to hardcode).
const WBNB_ABI = [
  "function deposit() payable",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const describeOrSkip = RUN_FORK_TESTS ? describe : describe.skip;

describeOrSkip("FeeRouter — BSC mainnet fork (Phase 1 manual gate)", function () {
  this.timeout(120_000);

  before(async function () {
    if (!BSC_MAINNET_ARCHIVE_RPC_URL) {
      throw new Error(
        "BSC_MAINNET_ARCHIVE_RPC_URL is required to run the fork test. " +
          "See the header comment in this file for usage."
      );
    }

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: BSC_MAINNET_ARCHIVE_RPC_URL,
            blockNumber: FORK_BLOCK_NUMBER,
          },
        },
      ],
    });
  });

  after(async function () {
    // Reset back to a clean, non-forked network so this test doesn't leak
    // fork state into whatever runs after it in the same process.
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("executes a real WBNB -> BUSD swap and confirms fee wallet gets exactly 0.15%", async function () {
    const [deployer, feeWallet, user] = await ethers.getSigners();

    const amountIn = ethers.parseEther("10"); // 10 WBNB

    // Give the test user plenty of native BNB on the forked network, then
    // wrap it into real WBNB via WBNB's own deposit() — no whale/impersonation
    // needed, so this test doesn't rot as on-chain balances change.
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [user.address, ethers.toQuantity(ethers.parseEther("20"))],
    });

    const wbnb = new ethers.Contract(WBNB, WBNB_ABI, user);
    await wbnb.deposit({ value: amountIn });

    const busd = await ethers.getContractAt("IERC20", BUSD);

    const FeeRouter = await ethers.getContractFactory("FeeRouter");
    const feeRouter = await FeeRouter.deploy(
      PANCAKE_ROUTER_V2,
      feeWallet.address,
      15, // 0.15%
      deployer.address
    );

    await wbnb.approve(await feeRouter.getAddress(), amountIn);

    const feeWalletWbnbBefore = await wbnb.balanceOf(feeWallet.address);
    const userBusdBefore = await busd.balanceOf(user.address);

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

    await feeRouter
      .connect(user)
      .swapExactTokensForTokensWithFee(
        amountIn,
        0, // no slippage protection needed for this smoke test
        [WBNB, BUSD],
        user.address,
        deadline
      );

    const feeWalletWbnbAfter = await wbnb.balanceOf(feeWallet.address);
    const userBusdAfter = await busd.balanceOf(user.address);

    const expectedFee = (amountIn * 15n) / 10_000n;

    expect(feeWalletWbnbAfter - feeWalletWbnbBefore).to.equal(expectedFee);
    expect(userBusdAfter).to.be.gt(userBusdBefore); // real swap actually executed against live liquidity
  });
});