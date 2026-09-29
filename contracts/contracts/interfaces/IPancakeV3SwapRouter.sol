// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for PancakeSwap's V3 SwapRouter (identical ABI
/// shape to Uniswap V3's periphery ISwapRouter — PancakeSwap's V3 periphery
/// is a direct fork). Only the two functions FeeRouter actually calls are
/// declared here, matching the style of IPancakeRouter02.
///
/// Unlike the V2 router, this interface has no separate "SupportingFeeOnTransferTokens"
/// variant: exactInput/exactInputSingle already settle on however much the
/// pool actually received/paid out, bounded by `amountOutMinimum` — see
/// FeeRouter.sol's V3 swap functions for how that interacts with a taxed
/// tokenIn/tokenOut.
interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Single-hop swap through one fee-tier pool.
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    struct ExactInputParams {
        // Encoded as tokenIn (20 bytes) . fee (3 bytes) . token1 (20 bytes)
        // [. fee . token2 ...] — PancakeSwap/Uniswap V3's packed multi-hop
        // path format, built by FeeRouter._encodeV3Path.
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    /// @notice Multi-hop swap through 2+ fee-tier pools chained via `path`.
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}
