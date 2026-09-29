// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal WETH9-shaped mock (deposit/withdraw 1:1 against native
/// currency), standing in for WBNB/WETH in FeeRouter's V3 unit tests. Also
/// mintable directly, so tests can fund a user/mock-router with "wrapped
/// native" balance without first sending it real ETH through deposit().
contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Mock Native", "mWNATIVE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "MockWETH: ETH_SEND_FAILED");
    }

    // Funds this contract so withdraw() has native currency to pay out
    // even when the caller minted (rather than deposited) their balance.
    receive() external payable {}
}
