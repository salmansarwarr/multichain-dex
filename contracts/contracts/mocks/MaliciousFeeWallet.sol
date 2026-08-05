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

    /// @notice Test-only generic executor, so tests can drive this contract
    /// to call arbitrary functions on `target` as itself — e.g. claiming a
    /// pending fee that accrued to this address while it was feeWallet,
    /// after feeWallet has since moved on. Not part of the attack surface
    /// under test; just a way to act "as" this address from a test script.
    function execute(bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = address(target).call(data);
        require(ok, "execute failed");
        return ret;
    }
}