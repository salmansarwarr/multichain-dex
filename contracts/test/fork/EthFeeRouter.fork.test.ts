/**
 * Phase 2 validation gate — manual fork test.
 *
 * Forks Ethereum mainnet at a pinned block and executes a REAL WETH -> USDC
 * swap through EthFeeRouter against live Uniswap V2 liquidity, then
 * confirms the fee wallet's WETH balance increased by exactly 0.15% of
 * amountIn. Same rationale/caveats as the Phase 1 BSC fork test — see
 * that file's header comment and docs/testing-phase1.md for the general
 * pattern this follows.
 *
 * This sandbox's network egress allowlist does not include Ethereum RPC
 * providers, so this test has NOT been executed in this environment —
 * only written and reviewed. Run it for real on your machine/CI before
 * treating the Phase 2 gate as fully closed.
 *
 * Every address below was verified against a live block explorer search
 * before being written here (not transcribed from memory) — see the
 * Phase 2 chat notes if you want the verification trail.
 *
 * Usage:
 *   ETH_MAINNET_ARCHIVE_RPC_URL=https://your-archive-rpc \
 *   FORK_BLOCK_NUMBER=20000000 \
 *   RUN_FORK_TESTS=true \
 *   npx hardhat test test/fork/EthFeeRouter.fork.test.ts
 */
import { expect } from "chai";
import { ethers, network } from "hardhat";

const RUN_FORK_TESTS = process.env.RUN_FORK_TESTS === "true";
const ETH_MAINNET_ARCHIVE_RPC_URL = process.env.ETH_MAINNET_ARCHIVE_RPC_URL || "";
const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER
  ? parseInt(process.env.FORK_BLOCK_NUMBER, 10)
  : undefined;

// --- Real Ethereum mainnet addresses (verified against BscScan/Etherscan
// search results + ethers.getAddress() checksum before use) ---
const UNISWAP_V2_ROUTER02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
// Uniswap V3's original SwapRouter (struct params include `deadline`, the
// shape EthFeeRouter's IPancakeV3SwapRouter interface expects) and
// QuoterV2. Both ABIs verified against Sourcify's chain-1 records.
const UNISWAP_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNISWAP_V3_QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const MORPHO = "0x58D97B57BB95320F9a05dC918Aef65434969c2B2";
const USDE = "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3";

const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256,uint160[],uint32[],uint256)",
];

// Minimal WETH ABI — wrap native ETH ourselves rather than depending on a
// whale address (whale balances drift; wrapping our own ETH doesn't).
const WETH_ABI = [
  "function deposit() payable",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const describeOrSkip = RUN_FORK_TESTS ? describe : describe.skip;

describeOrSkip("EthFeeRouter — Ethereum mainnet fork (Phase 2 manual gate)", function () {
  this.timeout(120_000);

  before(async function () {
    if (!ETH_MAINNET_ARCHIVE_RPC_URL) {
      throw new Error(
        "ETH_MAINNET_ARCHIVE_RPC_URL is required to run the fork test. " +
          "See the header comment in this file for usage."
      );
    }

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: ETH_MAINNET_ARCHIVE_RPC_URL,
            blockNumber: FORK_BLOCK_NUMBER,
          },
        },
      ],
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("executes a real WETH -> USDC swap and confirms fee wallet gets exactly 0.15%", async function () {
    const [deployer, feeWallet, user] = await ethers.getSigners();

    const amountIn = ethers.parseEther("5"); // 5 WETH

    await network.provider.request({
      method: "hardhat_setBalance",
      params: [user.address, ethers.toQuantity(ethers.parseEther("10"))],
    });

    const weth = new ethers.Contract(WETH, WETH_ABI, user);
    await weth.deposit({ value: amountIn });

    const usdc = await ethers.getContractAt("IERC20", USDC);

    const EthFeeRouter = await ethers.getContractFactory("EthFeeRouter");
    const ethFeeRouter = await EthFeeRouter.deploy(
      UNISWAP_V2_ROUTER02,
      UNISWAP_V3_SWAP_ROUTER,
      WETH,
      ethers.ZeroAddress,
      feeWallet.address,
      15, // 0.15%
      deployer.address
    );

    await weth.approve(await ethFeeRouter.getAddress(), amountIn);

    const feeWalletWethBefore = await weth.balanceOf(feeWallet.address);
    const userUsdcBefore = await usdc.balanceOf(user.address);

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

    await ethFeeRouter
      .connect(user)
      .swapExactTokensForTokensWithFee(
        amountIn,
        0, // no slippage protection needed for this smoke test
        [WETH, USDC],
        user.address,
        deadline
      );

    const feeWalletWethAfter = await weth.balanceOf(feeWallet.address);
    const userUsdcAfter = await usdc.balanceOf(user.address);

    const expectedFee = (amountIn * 15n) / 10_000n;

    expect(feeWalletWethAfter - feeWalletWethBefore).to.equal(expectedFee);
    expect(userUsdcAfter).to.be.gt(userUsdcBefore); // real swap actually executed against live liquidity
  });

  async function deployV3Router() {
    const [deployer, feeWallet, user] = await ethers.getSigners();
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [user.address, ethers.toQuantity(ethers.parseEther("10"))],
    });
    const EthFeeRouter = await ethers.getContractFactory("EthFeeRouter");
    const ethFeeRouter = await EthFeeRouter.deploy(
      UNISWAP_V2_ROUTER02,
      UNISWAP_V3_SWAP_ROUTER,
      WETH,
      ethers.ZeroAddress,
      feeWallet.address,
      15,
      deployer.address
    );
    const quoter = new ethers.Contract(UNISWAP_V3_QUOTER_V2, QUOTER_ABI, user);
    return { ethFeeRouter, feeWallet, user, quoter };
  }

  it("ETH -> MORPHO through a single Uniswap V3 pool: exact 0.15% fee, output matches the quoter", async function () {
    const { ethFeeRouter, feeWallet, user, quoter } = await deployV3Router();
    const amountIn = ethers.parseEther("1");
    const afterFee = amountIn - (amountIn * 15n) / 10_000n;
    const [quoted] = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: WETH, tokenOut: MORPHO, amountIn: afterFee, fee: 3000, sqrtPriceLimitX96: 0,
    });
    const morpho = await ethers.getContractAt("IERC20", MORPHO);
    const feeWalletEthBefore = await ethers.provider.getBalance(feeWallet.address);

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    await ethFeeRouter.connect(user).swapExactETHForTokensV3WithFee(quoted, MORPHO, 3000, user.address, deadline, { value: amountIn });

    expect((await ethers.provider.getBalance(feeWallet.address)) - feeWalletEthBefore).to.equal((amountIn * 15n) / 10_000n);
    expect(await morpho.balanceOf(user.address)).to.equal(quoted);
  });

  it("ETH -> USDC -> USDe through two chained Uniswap V3 pools: output matches the quoter", async function () {
    const { ethFeeRouter, user, quoter } = await deployV3Router();
    const amountIn = ethers.parseEther("1");
    const afterFee = amountIn - (amountIn * 15n) / 10_000n;
    const path = ethers.solidityPacked(["address", "uint24", "address", "uint24", "address"], [WETH, 500, USDC, 100, USDE]);
    const [quoted] = await quoter.quoteExactInput.staticCall(path, afterFee);
    const usde = await ethers.getContractAt("IERC20", USDE);

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    await ethFeeRouter.connect(user).swapExactETHForTokensV3MultiHopWithFee(quoted, path, user.address, deadline, { value: amountIn });

    expect(await usde.balanceOf(user.address)).to.equal(quoted);
  });

  it("MORPHO -> native ETH through Uniswap V3 (swap then unwrap WETH): user receives native ETH", async function () {
    const { ethFeeRouter, user } = await deployV3Router();
    let deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    await ethFeeRouter.connect(user).swapExactETHForTokensV3WithFee(0, MORPHO, 3000, user.address, deadline, { value: ethers.parseEther("1") });
    const morpho = await ethers.getContractAt("IERC20", MORPHO);
    const bal = await morpho.balanceOf(user.address);
    await morpho.connect(user).approve(await ethFeeRouter.getAddress(), bal);

    const ethBefore = await ethers.provider.getBalance(user.address);
    deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;
    const tx = await ethFeeRouter.connect(user).swapExactTokensForETHV3WithFee(bal, 0, MORPHO, 3000, user.address, deadline);
    const r = await tx.wait();
    const received = (await ethers.provider.getBalance(user.address)) - ethBefore + r!.gasUsed * r!.gasPrice;
    // Round trip through a 0.3% pool twice plus our fee twice: well over 0.95 ETH back.
    expect(received).to.be.gt(ethers.parseEther("0.95"));
  });
});
