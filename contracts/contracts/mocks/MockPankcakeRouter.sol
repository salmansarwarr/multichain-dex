// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Deliberately simplified router mock for FeeRouter unit tests.
/// Not a real AMM — it applies a configurable fixed exchange rate and pays
/// out from its own pre-funded balance. This isolates FeeRouter's own
/// logic (fee skim, approval handling, event emission, guards) from real
/// PancakeSwap pool mechanics, which are covered separately by the
/// mainnet-fork test.
contract MockPancakeRouter {
    using SafeERC20 for IERC20;

    /// @notice Exchange rate expressed as output-per-input, scaled by 1e18.
    /// Default 1e18 == 1:1. Settable per test case.
    uint256 public rate = 1e18;

    bool public shouldRevert;

    event MockSwap(address indexed to, uint256 amountIn, uint256 amountOut);

    function setRate(uint256 newRate) external {
        rate = newRate;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(!shouldRevert, "MockPancakeRouter: forced revert");
        require(block.timestamp <= deadline, "MockPancakeRouter: EXPIRED");
        require(path.length >= 2, "MockPancakeRouter: INVALID_PATH");

        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= amountOutMin, "MockPancakeRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;

        emit MockSwap(to, amountIn, amountOut);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        require(!shouldRevert, "MockPancakeRouter: forced revert");
        require(block.timestamp <= deadline, "MockPancakeRouter: EXPIRED");
        require(path.length >= 2, "MockPancakeRouter: INVALID_PATH");

        address tokenOut = path[path.length - 1];
        uint256 amountIn = msg.value;

        uint256 amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= amountOutMin, "MockPancakeRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;

        emit MockSwap(to, amountIn, amountOut);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(!shouldRevert, "MockPancakeRouter: forced revert");
        require(block.timestamp <= deadline, "MockPancakeRouter: EXPIRED");

        address tokenIn = path[0];
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= amountOutMin, "MockPancakeRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        (bool sent, ) = to.call{value: amountOut}("");
        require(sent, "MockPancakeRouter: ETH_SEND_FAILED");

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = (amountIn * rate) / 1e18;
    }

    // Allows the test harness to fund this mock with native BNB so it can
    // pay out swapExactTokensForETH.
    receive() external payable {}
}