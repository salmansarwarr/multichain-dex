// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPancakeV3SwapRouter} from "../interfaces/IPancakeV3SwapRouter.sol";

/// @notice Deliberately simplified V3 router mock for FeeRouter's V3 unit
/// tests — same spirit as MockPancakeRouter (mocks/MockPankcakeRouter.sol)
/// for the V2 functions: a configurable fixed exchange rate, paid out from
/// its own pre-funded balance, isolating FeeRouter's own logic (fee skim,
/// approval handling, path decoding, event emission, guards) from real V3
/// pool/tick/concentrated-liquidity mechanics.
contract MockPancakeV3Router is IPancakeV3SwapRouter {
    using SafeERC20 for IERC20;

    /// @notice Exchange rate expressed as output-per-input, scaled by 1e18.
    uint256 public rate = 1e18;

    bool public shouldRevert;

    event MockV3Swap(address indexed recipient, uint256 amountIn, uint256 amountOut);

    function setRate(uint256 newRate) external {
        rate = newRate;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        require(!shouldRevert, "MockPancakeV3Router: forced revert");
        require(block.timestamp <= params.deadline, "MockPancakeV3Router: EXPIRED");

        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        amountOut = (params.amountIn * rate) / 1e18;
        require(amountOut >= params.amountOutMinimum, "MockPancakeV3Router: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);

        emit MockV3Swap(params.recipient, params.amountIn, amountOut);
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut) {
        require(!shouldRevert, "MockPancakeV3Router: forced revert");
        require(block.timestamp <= params.deadline, "MockPancakeV3Router: EXPIRED");
        require(params.path.length >= 43, "MockPancakeV3Router: INVALID_PATH");

        address tokenIn = address(bytes20(params.path[0:20]));
        address tokenOut = address(bytes20(params.path[params.path.length - 20:params.path.length]));

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        amountOut = (params.amountIn * rate) / 1e18;
        require(amountOut >= params.amountOutMinimum, "MockPancakeV3Router: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).safeTransfer(params.recipient, amountOut);

        emit MockV3Swap(params.recipient, params.amountIn, amountOut);
    }
}
