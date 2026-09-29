// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface for the canonical wrapped-native token (WBNB on
/// BSC, WETH on Ethereum/Arbitrum). Both are the standard WETH9 shape:
/// `deposit()` wraps `msg.value` 1:1 into ERC20 balance, `withdraw(uint256)`
/// burns ERC20 balance and sends native currency back 1:1. FeeRouter uses
/// this to move BNB in/out of PancakeSwap V3 pools itself (see
/// swapExactETHForTokensV3WithFee / swapExactTokensForETHV3WithFee) rather
/// than relying on the V3 SwapRouter's own (differently-shaped, and not
/// worth depending on for a contract holding real user funds) native-token
/// handling.
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
