// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFeeRouterForAttack {
    function swapExactETHForTokensWithFee(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}

/// @notice Simulates a malicious fee wallet that attempts to re-enter
/// FeeRouter.swapExactETHForTokensWithFee the moment it receives its fee
/// payout via the raw `.call{value: feeAmount}("")`. Used only to prove
/// the `nonReentrant` guard blocks this — must never succeed.
contract MaliciousFeeWallet {
    IFeeRouterForAttack public immutable target;
    address[] public attackPath;
    bool public attacked;

    constructor(address target_) {
        target = IFeeRouterForAttack(target_);
    }

    function setAttackPath(address[] calldata path) external {
        attackPath = path;
    }

    receive() external payable {
        if (!attacked && attackPath.length >= 2) {
            attacked = true;
            // Re-entrant call attempt — must revert due to nonReentrant.
            target.swapExactETHForTokensWithFee{value: 0}(
                0,
                attackPath,
                address(this),
                block.timestamp + 300
            );
        }
    }
}