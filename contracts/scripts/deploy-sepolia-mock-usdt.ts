/**
 * deploy-sepolia-mock-usdt.ts
 *
 * Ethereum Sepolia has no confirmed-liquid official USDT test token against
 * our deployed Uniswap V2 Router02 (0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008)
 * — checked several known Sepolia "USDT" faucet tokens on-chain via
 * factory.getPair(WETH, candidate) and none had a pool. Unlike Arbitrum
 * Sepolia (our own mock router, seed by minting directly into it), this is
 * the REAL Uniswap V2 factory, so there's no shortcut: this script deploys
 * a mock USDT and creates a genuine WETH/USDT pair by calling the real
 * router's addLiquidityETH with real Sepolia ETH.
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY funded with Sepolia ETH (need gas + the ETH side
 *     of the liquidity seed, see SEED_ETH below)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-sepolia-mock-usdt.ts --network sepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";

// Seed liquidity: 10,000 tUSDT (6 decimals) against 0.01 Sepolia ETH
// (deployer had ~0.065 ETH available at time of writing — leaves headroom
// for gas on this + other scripts).
const SEED_TUSDT = 10_000n * 10n ** 6n;
const SEED_ETH = ethers.parseEther("0.01");

const ROUTER_ABI = [
  "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
  "function WETH() external view returns (address)",
];

async function main() {
  const networkName = network.name;
  if (networkName !== "sepolia") {
    throw new Error(`Wrong network: expected "sepolia", got "${networkName}". Run with --network sepolia`);
  }

  const [deployer] = await ethers.getSigners();
  console.log("\n=== Mock USDT + WETH/USDT pool — Ethereum Sepolia ===");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} Sepolia ETH`);

  const router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI, deployer);
  const weth = await router.WETH();
  console.log(`Router  : ${UNISWAP_ROUTER}`);
  console.log(`WETH()  : ${weth}`);

  console.log("\nDeploying MockERC20 tUSDT (6 decimals)...");
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const tUSDT = await MockERC20Factory.deploy("Test Tether USD", "tUSDT", 6);
  await tUSDT.waitForDeployment();
  const tUSDTAddress = await tUSDT.getAddress();
  console.log(`  tUSDT  : ${tUSDTAddress}`);

  console.log(`\nMinting ${ethers.formatUnits(SEED_TUSDT, 6)} tUSDT to self...`);
  const mintTx = await tUSDT.mint(deployer.address, SEED_TUSDT);
  await mintTx.wait();

  console.log(`Approving router for ${ethers.formatUnits(SEED_TUSDT, 6)} tUSDT...`);
  const approveTx = await tUSDT.approve(UNISWAP_ROUTER, SEED_TUSDT);
  await approveTx.wait();

  console.log(`\nAdding liquidity: ${ethers.formatUnits(SEED_TUSDT, 6)} tUSDT + ${ethers.formatEther(SEED_ETH)} ETH...`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const addLiqTx = await router.addLiquidityETH(
    tUSDTAddress,
    SEED_TUSDT,
    0, // amountTokenMin — first liquidity provision, no existing price to slip against
    0, // amountETHMin
    deployer.address,
    deadline,
    { value: SEED_ETH }
  );
  const receipt = await addLiqTx.wait();
  console.log(`Tx hash: ${receipt?.hash}`);
  console.log("\n✅ WETH/tUSDT pool created and seeded.");

  // --- Persist alongside the real deployment record ---
  const recordPath = path.join(__dirname, "../deployments/sepolia.json");
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  record.mocks = record.mocks || {};
  record.mocks.tUSDT = tUSDTAddress;
  record.mocks.tUSDTNote =
    "No official Sepolia USDT with existing WETH liquidity found (checked on-chain via factory.getPair against several known faucet USDT tokens). Deployed our own mock and seeded a real WETH/tUSDT pair via addLiquidityETH on the actual Uniswap V2 router — this one is NOT a mock router like Arbitrum Sepolia's, it's the real Sepolia Uniswap deployment.";
  record.mocks.tUSDTAddedAt = new Date().toISOString();
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  console.log(`Deployment record updated: ${recordPath}`);
  console.log(`Explorer: https://sepolia.etherscan.io/address/${tUSDTAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
