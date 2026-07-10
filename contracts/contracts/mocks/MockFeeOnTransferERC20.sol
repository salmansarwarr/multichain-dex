// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only ERC20 that burns a configurable percentage on every
/// transfer (simulating real-world deflationary/reflection tokens common
/// on both BSC and Ethereum). Used to prove EthFeeRouter measures actual
/// received balance rather than trusting the nominal transfer amount.
contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public transferFeeBps; // e.g. 200 = 2% burned per transfer

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 transferFeeBps_
    ) ERC20(name_, symbol_) {
        transferFeeBps = transferFeeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTransferFeeBps(uint256 newFeeBps) external {
        transferFeeBps = newFeeBps;
    }

    function _update(address from, address to, uint256 value) internal override {
        // Mint (from == address(0)) and burn (to == address(0)) pass through
        // untaxed — only genuine transfers between accounts take the cut,
        // matching how real deflationary tokens behave.
        if (from == address(0) || to == address(0) || transferFeeBps == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * transferFeeBps) / 10_000;
        uint256 sendAmount = value - fee;

        super._update(from, to, sendAmount);
        if (fee > 0) {
            super._update(from, address(0), fee); // burn the fee portion
        }
    }
}
