// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Test stand-in for a DEX-aggregator router: pulls `spend` of tokenIn
/// from the caller (or takes msg.value), pays `amountOut` of tokenOut to
/// `recipient`. Lets tests model under-spending and short-paying.
contract MockAggregator {
    address constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function swap(address tokenIn, uint256 spend, address tokenOut, uint256 amountOut, address recipient) external payable {
        if (tokenIn == NATIVE) {
            if (msg.value > spend) {
                (bool ok, ) = msg.sender.call{value: msg.value - spend}("");
                require(ok, "refund failed");
            }
        } else {
            IERC20(tokenIn).transferFrom(msg.sender, address(this), spend);
        }
        if (tokenOut == NATIVE) {
            (bool ok, ) = recipient.call{value: amountOut}("");
            require(ok, "eth out failed");
        } else {
            IERC20(tokenOut).transfer(recipient, amountOut);
        }
    }

    function fail() external pure {
        revert("aggregator: route failed");
    }

    receive() external payable {}
}
