// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Deliberately simplified Uniswap V2 Router02 mock for
/// EthFeeRouter unit tests — same rationale as MockPancakeRouter in
/// Phase 1. Includes the FeeOnTransfer-supporting variants so the
/// deflationary-token test path can be exercised in isolation from real
/// Uniswap pool mechanics (covered separately by the mainnet-fork test).
contract MockUniswapRouter {
    using SafeERC20 for IERC20;

    uint256 public rate = 1e18; // output-per-input, scaled by 1e18
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
        require(!shouldRevert, "MockUniswapRouter: forced revert");
        require(block.timestamp <= deadline, "MockUniswapRouter: EXPIRED");

        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= amountOutMin, "MockUniswapRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;

        emit MockSwap(to, amountIn, amountOut);
    }

    /// @dev Measures actual received balance (post any transfer tax on
    /// tokenIn) before computing the swap output, exactly like a real
    /// Uniswap pool would settle on the actual amount it received.
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        require(!shouldRevert, "MockUniswapRouter: forced revert");
        require(block.timestamp <= deadline, "MockUniswapRouter: EXPIRED");

        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = IERC20(tokenIn).balanceOf(address(this)) - balanceBefore;

        uint256 amountOut = (received * rate) / 1e18;
        require(amountOut >= amountOutMin, "MockUniswapRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).safeTransfer(to, amountOut);

        emit MockSwap(to, received, amountOut);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        require(!shouldRevert, "MockUniswapRouter: forced revert");
        require(block.timestamp <= deadline, "MockUniswapRouter: EXPIRED");

        address tokenOut = path[path.length - 1];
        uint256 amountIn = msg.value;

        uint256 amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= amountOutMin, "MockUniswapRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;

        emit MockSwap(to, amountIn, amountOut);
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        require(!shouldRevert, "MockUniswapRouter: forced revert");
        require(block.timestamp <= deadline, "MockUniswapRouter: EXPIRED");

        address tokenOut = path[path.length - 1];
        uint256 amountIn = msg.value;

        uint256 amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= amountOutMin, "MockUniswapRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).safeTransfer(to, amountOut);

        emit MockSwap(to, amountIn, amountOut);
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = (amountIn * rate) / 1e18;
    }

    receive() external payable {}
}
