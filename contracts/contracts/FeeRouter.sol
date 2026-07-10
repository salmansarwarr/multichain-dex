// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPancakeRouter02} from "./interfaces/IPancakeRouter02.sol";

/// @title FeeRouter
/// @notice Thin wrapper around a PancakeSwap-compatible Router02. Skims a
/// configurable fee (in basis points, hard-capped) off the input amount,
/// forwards the fee to `feeWallet`, then executes the swap for the
/// remainder through the underlying router.
///
/// Custody note: this contract only ever briefly holds user funds within a
/// single transaction (pull -> skim fee -> approve remainder -> swap). It
/// never holds a standing balance by design, but `nonReentrant` and
/// `Pausable` are included as defense-in-depth since it's still a router
/// pattern touching third-party funds.
contract FeeRouter is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Fee is expressed in basis points out of 10_000 (e.g. 15 = 0.15%).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Hard ceiling on the owner's fee-adjustment power. Owner can
    /// never set a fee above 1%, regardless of intent.
    uint256 public constant MAX_FEE_BPS = 100;

    /// @notice The underlying PancakeSwap-compatible router this contract wraps.
    IPancakeRouter02 public immutable pancakeRouter;

    /// @notice Destination for skimmed fees.
    address public feeWallet;

    /// @notice Current fee, in basis points.
    uint256 public feeBps;

    event SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 feeAmount
    );
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event FeeWalletUpdated(address oldWallet, address newWallet);
    event FeeWalletTransferFailed(address indexed feeWallet, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error FeeExceedsCap(uint256 requested, uint256 max);
    error DeadlineExpired();
    error EmptyPath();
    error EthTransferFailed();

    /// @param _pancakeRouter Address of the PancakeSwap (or compatible fork) Router02.
    /// @param _feeWallet Address that receives skimmed fees.
    /// @param _feeBps Initial fee in basis points (e.g. 15 = 0.15%). Must be <= MAX_FEE_BPS.
    /// @param initialOwner Address to receive ownership (fee-adjustment rights).
    constructor(
        address _pancakeRouter,
        address _feeWallet,
        uint256 _feeBps,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_pancakeRouter == address(0) || _feeWallet == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }
        if (_feeBps > MAX_FEE_BPS) revert FeeExceedsCap(_feeBps, MAX_FEE_BPS);

        pancakeRouter = IPancakeRouter02(_pancakeRouter);
        feeWallet = _feeWallet;
        feeBps = _feeBps;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Update the fee. Hard-capped at MAX_FEE_BPS (1%) no matter what.
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeExceedsCap(newFeeBps, MAX_FEE_BPS);
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    /// @notice Update the fee destination wallet.
    function setFeeWallet(address newFeeWallet) external onlyOwner {
        if (newFeeWallet == address(0)) revert ZeroAddress();
        emit FeeWalletUpdated(feeWallet, newFeeWallet);
        feeWallet = newFeeWallet;
    }

    /// @notice Emergency stop — blocks both swap entry points.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Swaps
    // ---------------------------------------------------------------------

    /// @notice Swap an exact amount of `path[0]` for `path[last]`, taking a
    /// fee off `amountIn` before swapping the remainder.
    /// @dev Caller must have approved this contract for at least `amountIn`
    /// of `path[0]` beforehand.
    function swapExactTokensForTokensWithFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256[] memory amounts) {
        if (amountIn == 0) revert ZeroAmount();
        if (path.length < 2) revert EmptyPath();
        if (block.timestamp > deadline) revert DeadlineExpired();

        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        (uint256 feeAmount, uint256 amountAfterFee) = _computeFee(amountIn);

        if (feeAmount > 0) {
            IERC20(tokenIn).safeTransfer(feeWallet, feeAmount);
        }

        // forceApprove handles both zero-first-then-set tokens and normal
        // ERC20s uniformly, and resets any stale leftover allowance.
        IERC20(tokenIn).forceApprove(address(pancakeRouter), amountAfterFee);

        amounts = pancakeRouter.swapExactTokensForTokens(
            amountAfterFee,
            amountOutMin,
            path,
            to,
            deadline
        );

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, feeAmount);
    }

    /// @notice Swap an exact amount of native BNB (msg.value) for
    /// `path[last]`, taking a fee off msg.value before swapping the remainder.
    function swapExactETHForTokensWithFee(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256[] memory amounts) {
        if (msg.value == 0) revert ZeroAmount();
        if (path.length < 2) revert EmptyPath();
        if (block.timestamp > deadline) revert DeadlineExpired();

        address tokenOut = path[path.length - 1];

        (uint256 feeAmount, uint256 amountAfterFee) = _computeFee(msg.value);

        if (feeAmount > 0) {
            // feeWallet is owner-gated (setFeeWallet/onlyOwner), never attacker-supplied.
            // slither-disable-next-line arbitrary-send-eth
            (bool sent, ) = feeWallet.call{value: feeAmount}("");
            if (!sent) revert EthTransferFailed();
        }

        amounts = pancakeRouter.swapExactETHForTokens{value: amountAfterFee}(
            amountOutMin,
            path,
            to,
            deadline
        );

        emit SwapExecuted(msg.sender, address(0), tokenOut, msg.value, feeAmount);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _computeFee(uint256 amountIn) internal view returns (uint256 feeAmount, uint256 amountAfterFee) {
        feeAmount = (amountIn * feeBps) / BPS_DENOMINATOR;
        amountAfterFee = amountIn - feeAmount;
    }

    /// @dev Only meaningful if this contract is ever sent native BNB
    /// directly (e.g. leftover dust from a router refund path). Not part
    /// of the intended flow, but accepting rather than reverting avoids
    /// stuck funds. Emergency owner sweep intentionally omitted from
    /// Phase 1 scope — this holds no standing balance by design.
    receive() external payable {}
}
