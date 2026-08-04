// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";

/// @title EthFeeRouter
/// @notice Thin wrapper around Uniswap's Router02. Same fee-skim pattern as
/// BSC's FeeRouter, adapted for two Ethereum-specific realities:
///
/// 1. Gas cost: rather than reimplementing routing logic, this stays a
///    pure pass-through wrapper — the fee skim is the only added cost.
/// 2. Fee-on-transfer / deflationary tokens are common enough on Ethereum
///    that this contract measures actual received balance (not the
///    caller-supplied `amountIn`) before computing its own fee, and
///    exposes explicit *SupportingFeeOnTransferTokens variants that call
///    into Uniswap's equivalent functions (which don't return an
///    `amounts` array, since exact output can't be known in advance for
///    such tokens).
///
/// Custody note: identical to FeeRouter — briefly holds user funds within a
/// single transaction and does not carry a standing balance in the normal
/// case. The one exception is `pendingTokenFees`/`pendingEthFees`: if
/// pushing the fee to `feeWallet` ever fails (broken/reverting feeWallet),
/// the swap still completes for the user and the fee is held here instead,
/// claimable by `feeWallet` via `withdrawPendingTokenFees`/
/// `withdrawPendingEthFees` once fixed — see `_tryTransfer`.
contract EthFeeRouter is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_FEE_BPS = 100; // 1% hard cap

    IUniswapV2Router02 public immutable uniswapRouter;

    address public feeWallet;
    uint256 public feeBps;

    /// @notice ERC20 fees that failed to push to `feeWallet` and are
    /// waiting to be claimed via `withdrawPendingTokenFees`. Keyed by token.
    mapping(address => uint256) public pendingTokenFees;

    /// @notice Native ETH fees that failed to push to `feeWallet` and are
    /// waiting to be claimed via `withdrawPendingEthFees`.
    uint256 public pendingEthFees;

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
    event FeesWithdrawn(address indexed feeWallet, address indexed token, uint256 amount);
    event FundsRescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error FeeExceedsCap(uint256 requested, uint256 max);
    error DeadlineExpired();
    error EmptyPath();
    error EthTransferFailed();
    error NotFeeWallet();
    error NothingToWithdraw();
    error InsufficientRescueBalance();

    constructor(
        address _uniswapRouter,
        address _feeWallet,
        uint256 _feeBps,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_uniswapRouter == address(0) || _feeWallet == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }
        if (_feeBps > MAX_FEE_BPS) revert FeeExceedsCap(_feeBps, MAX_FEE_BPS);

        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        feeWallet = _feeWallet;
        feeBps = _feeBps;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeExceedsCap(newFeeBps, MAX_FEE_BPS);
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function setFeeWallet(address newFeeWallet) external onlyOwner {
        if (newFeeWallet == address(0)) revert ZeroAddress();
        emit FeeWalletUpdated(feeWallet, newFeeWallet);
        feeWallet = newFeeWallet;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Claim any ERC20 fees that failed to push automatically
    /// during a swap (see `_tryTransfer`). Callable only by the current
    /// `feeWallet`.
    function withdrawPendingTokenFees(address token) external nonReentrant {
        if (msg.sender != feeWallet) revert NotFeeWallet();
        uint256 amount = pendingTokenFees[token];
        if (amount == 0) revert NothingToWithdraw();
        pendingTokenFees[token] = 0;
        IERC20(token).safeTransfer(feeWallet, amount);
        emit FeesWithdrawn(feeWallet, token, amount);
    }

    /// @notice Same as above, for native ETH fees that failed to push.
    function withdrawPendingEthFees() external nonReentrant {
        if (msg.sender != feeWallet) revert NotFeeWallet();
        uint256 amount = pendingEthFees;
        if (amount == 0) revert NothingToWithdraw();
        pendingEthFees = 0;
        // feeWallet is owner-gated (setFeeWallet/onlyOwner), never attacker-supplied.
        // slither-disable-next-line arbitrary-send-eth
        (bool sent, ) = feeWallet.call{value: amount}("");
        if (!sent) revert EthTransferFailed();
        emit FeesWithdrawn(feeWallet, address(0), amount);
    }

    /// @notice Recover ERC20 tokens sent to this contract outside the
    /// normal swap flow (direct transfer, airdrop, etc). Cannot touch
    /// anything owed to feeWallet as a pending fee — only the excess.
    function rescueERC20(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 available = IERC20(token).balanceOf(address(this)) - pendingTokenFees[token];
        if (amount > available) revert InsufficientRescueBalance();
        IERC20(token).safeTransfer(to, amount);
        emit FundsRescued(token, to, amount);
    }

    /// @notice Same as above, for native ETH.
    function rescueETH(uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 available = address(this).balance - pendingEthFees;
        if (amount > available) revert InsufficientRescueBalance();
        // slither-disable-next-line arbitrary-send-eth
        (bool sent, ) = to.call{value: amount}("");
        if (!sent) revert EthTransferFailed();
        emit FundsRescued(address(0), to, amount);
    }

    // ---------------------------------------------------------------------
    // Swaps — standard ERC20s
    // ---------------------------------------------------------------------

    /// @notice Swap an exact amount of `path[0]` for `path[last]`. Fee is
    /// computed off the amount *actually received* (balance-delta), not the
    /// caller-supplied `amountIn` — this keeps the fee correct even if
    /// `path[0]` itself takes a transfer cut, without requiring the caller
    /// to use the FeeOnTransfer variant just for the input leg.
    function swapExactTokensForTokensWithFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256[] memory amounts) {
        if (to == address(0)) revert ZeroAddress();

        (address tokenIn, address tokenOut, uint256 received, uint256 feeAmount, uint256 amountAfterFee) =
            _pullAndSkimFee(amountIn, path, deadline);

        IERC20(tokenIn).forceApprove(address(uniswapRouter), amountAfterFee);

        amounts = uniswapRouter.swapExactTokensForTokens(amountAfterFee, amountOutMin, path, to, deadline);

        IERC20(tokenIn).forceApprove(address(uniswapRouter), 0);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, received, feeAmount);
    }

    /// @notice Same as above, but for output tokens that also take a
    /// transfer cut (deflationary/reflection tokens). Uniswap's
    /// SupportingFeeOnTransferTokens variant doesn't return amounts, so
    /// slippage protection relies entirely on `amountOutMin`.
    function swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();

        (address tokenIn, address tokenOut, uint256 received, uint256 feeAmount, uint256 amountAfterFee) =
            _pullAndSkimFee(amountIn, path, deadline);

        IERC20(tokenIn).forceApprove(address(uniswapRouter), amountAfterFee);

        uniswapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountAfterFee,
            amountOutMin,
            path,
            to,
            deadline
        );

        IERC20(tokenIn).forceApprove(address(uniswapRouter), 0);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, received, feeAmount);
    }

    // ---------------------------------------------------------------------
    // Swaps — native ETH
    // ---------------------------------------------------------------------

    function swapExactETHForTokensWithFee(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256[] memory amounts) {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        if (path.length < 2) revert EmptyPath();
        if (block.timestamp > deadline) revert DeadlineExpired();

        address tokenOut = path[path.length - 1];
        (uint256 feeAmount, uint256 amountAfterFee) = _computeFee(msg.value);

        if (feeAmount > 0) {
            // feeWallet is owner-gated (setFeeWallet/onlyOwner), never attacker-supplied.
            // slither-disable-next-line arbitrary-send-eth
            (bool sent, ) = feeWallet.call{value: feeAmount}("");
            if (!sent) {
                pendingEthFees += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }

        amounts = uniswapRouter.swapExactETHForTokens{value: amountAfterFee}(amountOutMin, path, to, deadline);

        emit SwapExecuted(msg.sender, address(0), tokenOut, msg.value, feeAmount);
    }

    function swapExactETHForTokensWithFeeSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        if (path.length < 2) revert EmptyPath();
        if (block.timestamp > deadline) revert DeadlineExpired();

        address tokenOut = path[path.length - 1];
        (uint256 feeAmount, uint256 amountAfterFee) = _computeFee(msg.value);

        if (feeAmount > 0) {
            // feeWallet is owner-gated (setFeeWallet/onlyOwner), never attacker-supplied.
            // slither-disable-next-line arbitrary-send-eth
            (bool sent, ) = feeWallet.call{value: feeAmount}("");
            if (!sent) {
                pendingEthFees += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }

        uniswapRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value: amountAfterFee}(
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

    /// @dev Pulls `amountIn` of `path[0]` from the caller, measuring the
    /// actual balance delta (so a deflationary `path[0]` doesn't cause us
    /// to skim a fee off, or approve, more than we actually hold), then
    /// skims the fee off that real received amount.
    /// @dev Not compatible with rebasing tokens (e.g. AMPL, stETH-style) as
    /// `path[0]` — a rebase landing between the two `balanceOf` reads below
    /// could underflow the delta and revert, or skew the measured amount.
    /// Only standard ERC20 and fee-on-transfer ERC20 tokens are supported.
    function _pullAndSkimFee(
        uint256 amountIn,
        address[] calldata path,
        uint256 deadline
    )
        internal
        returns (
            address tokenIn,
            address tokenOut,
            uint256 received,
            uint256 feeAmount,
            uint256 amountAfterFee
        )
    {
        if (amountIn == 0) revert ZeroAmount();
        if (path.length < 2) revert EmptyPath();
        if (block.timestamp > deadline) revert DeadlineExpired();

        tokenIn = path[0];
        tokenOut = path[path.length - 1];

        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        received = IERC20(tokenIn).balanceOf(address(this)) - balanceBefore;

        // Plain zero-check on a same-tx balance delta, not equality against
        // a manipulable expected amount — any nonzero receipt is accepted.
        // slither-disable-next-line incorrect-equality
        if (received == 0) revert ZeroAmount();

        (feeAmount, amountAfterFee) = _computeFee(received);

        if (feeAmount > 0) {
            if (!_tryTransfer(IERC20(tokenIn), feeWallet, feeAmount)) {
                pendingTokenFees[tokenIn] += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }
    }

    function _computeFee(uint256 amountIn) internal view returns (uint256 feeAmount, uint256 amountAfterFee) {
        feeAmount = (amountIn * feeBps) / BPS_DENOMINATOR;
        amountAfterFee = amountIn - feeAmount;
    }

    /// @dev Non-reverting transfer attempt, so a broken/malicious feeWallet
    /// degrades to "fee held here, claimable later" instead of blocking the
    /// user's swap outright (see contract-level custody note). Mirrors
    /// SafeERC20's own success check (call succeeded AND return data is
    /// either empty or decodes to true) rather than using SafeERC20.safeTransfer
    /// directly, since that reverts on failure and can't be caught this way.
    function _tryTransfer(IERC20 token, address to, uint256 amount) private returns (bool success) {
        (bool callSuccess, bytes memory data) = address(token).call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        success = callSuccess && (data.length == 0 || abi.decode(data, (bool)));
    }

    /// @dev Only meaningful if this contract is ever sent native ETH
    /// directly (e.g. leftover dust from a router refund path). Not part
    /// of the intended flow, but accepting rather than reverting avoids
    /// stuck funds — recoverable via `rescueETH`.
    receive() external payable {}
}
