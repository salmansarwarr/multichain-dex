/**
 * deploy-arbitrum-sepolia.ts
 *
 * Deploys EthFeeRouter to Arbitrum Sepolia (chain ID 421614).
 *
 * Important: unlike BSC Testnet (real PancakeSwap deployment) and Sepolia
 * (real Uniswap V2 Router02 deployment), there is no official Uniswap-V2-
 * compatible DEX with testnet liquidity confirmed live on Arbitrum Sepolia
 * at the time of writing (verified directly on-chain: eth_getCode against
 * the Arbitrum One SushiSwap/Uniswap router addresses returns empty bytecode
 * on Arbitrum Sepolia — they simply aren't deployed there).
 *
 * So, exactly as flagged in docs/implementation-plan.md Phase 3 ("...or a
 * test router on Arbitrum Sepolia"), this script deploys a self-contained
 * test AMM first:
 *   1. Two mintable MockERC20 test tokens (tWETH, tUSDC)
 *   2. MockUniswapRouter, seeded with tUSDC so swaps have somewhere to pull
 *      output liquidity from
 *   3. EthFeeRouter pointed at that mock router
 *
 * This still exercises the exact same EthFeeRouter.sol contract code that
 * runs on Ethereum/Arbitrum mainnet — only the router it wraps is a test
 * double, same as any other testnet fixture.
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in contracts/.env (throwaway dev wallet)
 *   - Deployer funded with Arbitrum Sepolia ETH (faucet: https://faucet.quicknode.com/arbitrum/sepolia)
 *   - ARB_FEE_WALLET_ADDRESS set in contracts/.env
 *
 * Usage:
 *   npx hardhat run scripts/deploy-arbitrum-sepolia.ts --network arbitrumSepolia
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Fee in basis points: 15 = 0.15%
const FEE_BPS = 15;

// Seed liquidity: 10,000,000,000 tUSDC (6 decimals) held by the mock router.
const SEED_TUSDC = 10_000_000_000n * 10n ** 6n;

async function main() {
  const networkName = network.name;
  if (networkName !== "arbitrumSepolia") {
    throw new Error(
      `Wrong network: expected "arbitrumSepolia", got "${networkName}". ` +
        `Run with --network arbitrumSepolia`
    );
  }

  const feeWallet = process.env.ARB_FEE_WALLET_ADDRESS;
  if (!feeWallet) {
    throw new Error(
      "ARB_FEE_WALLET_ADDRESS is not set in .env. " +
        "Set it to the address that should receive the 0.15% fee on Arbitrum."
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("\n=== EthFeeRouter — Arbitrum Sepolia Deployment ===");
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} Arbitrum Sepolia ETH`);
  console.log(`Network  : ${networkName} (chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Fee wallet: ${feeWallet}`);
  console.log(`Fee bps  : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log("");

  // --- 1. Test tokens ---
  console.log("Deploying MockERC20 tWETH (18 decimals)...");
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const tWETH = await MockERC20Factory.deploy("Test Wrapped ETH", "tWETH", 18);
  await tWETH.waitForDeployment();
  console.log(`  tWETH    : ${await tWETH.getAddress()}`);

  console.log("Deploying MockERC20 tUSDC (6 decimals)...");
  const tUSDC = await MockERC20Factory.deploy("Test USD Coin", "tUSDC", 6);
  await tUSDC.waitForDeployment();
  console.log(`  tUSDC    : ${await tUSDC.getAddress()}`);

  // --- 2. Mock router, seeded with tUSDC liquidity ---
  console.log("Deploying MockUniswapRouter...");
  const MockUniswapRouterFactory = await ethers.getContractFactory("MockUniswapRouter");
  const mockRouter = await MockUniswapRouterFactory.deploy();
  await mockRouter.waitForDeployment();
  const mockRouterAddress = await mockRouter.getAddress();
  console.log(`  Router   : ${mockRouterAddress}`);

  console.log(`Seeding router with ${ethers.formatUnits(SEED_TUSDC, 6)} tUSDC...`);
  const seedTx = await tUSDC.mint(mockRouterAddress, SEED_TUSDC);
  await seedTx.wait();

  // --- 3. EthFeeRouter, pointed at the mock router ---
  console.log("\nDeploying EthFeeRouter...");
  const EthFeeRouterFactory = await ethers.getContractFactory("EthFeeRouter");
  const ethFeeRouter = await EthFeeRouterFactory.deploy(
    mockRouterAddress,
    feeWallet,
    FEE_BPS,
    deployer.address // initialOwner
  );

  console.log(`Tx hash  : ${ethFeeRouter.deploymentTransaction()?.hash}`);
  console.log("Waiting for confirmations (5)...");
  try {
    await ethFeeRouter.deploymentTransaction()?.wait(5);
  } catch (waitErr: any) {
    // See deploy-bsc-mainnet.ts's matching catch block for the full
    // explanation — some RPC responses return `"to": ""` instead of
    // `"to": null` on a contract-creation receipt, which ethers v6's
    // strict parser rejects while polling for confirmations. Not a failed
    // deployment; `contractAddress` below needs no RPC round-trip.
    console.warn(
      `\n⚠️  Couldn't confirm via wait() — likely an RPC/ethers formatting bug, not a failed deployment. Details: ${waitErr.shortMessage || waitErr.message}\n` +
        "Continuing to write the deployment record; verify the tx hash below on Arbiscan.\n"
    );
  }

  const contractAddress = await ethFeeRouter.getAddress();
  const deployTxHash = ethFeeRouter.deploymentTransaction()?.hash ?? "";

  console.log("\n✅ EthFeeRouter deployed!");
  console.log(`Address  : ${contractAddress}`);
  console.log(`Tx hash  : ${deployTxHash}`);

  // --- Persist deployment record ---
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const record = {
    network: "arbitrumSepolia",
    chainId: 421614,
    contract: "EthFeeRouter",
    address: contractAddress,
    deployTxHash,
    deployedAt: new Date().toISOString(),
    constructorArgs: {
      uniswapRouter: mockRouterAddress,
      feeWallet,
      feeBps: FEE_BPS,
      initialOwner: deployer.address,
    },
    mocks: {
      note:
        "No official Uniswap-V2-compatible DEX confirmed live on Arbitrum Sepolia " +
        "(verified via eth_getCode). These test fixtures stand in for it.",
      mockRouter: mockRouterAddress,
      tWETH: await tWETH.getAddress(),
      tUSDC: await tUSDC.getAddress(),
    },
  };

  const outputPath = path.join(deploymentsDir, "arbitrum-sepolia.json");
  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved to: ${outputPath}`);

  console.log("\n--- Next steps ---");
  console.log("1. Verify source:  npx hardhat run scripts/verify-arbitrum-sepolia.ts --network arbitrumSepolia");
  console.log("2. Smoke test:     npx hardhat run scripts/smoke-test-arbitrum-sepolia.ts --network arbitrumSepolia");
  console.log(`3. Explorer:       https://sepolia.arbiscan.io/address/${contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
