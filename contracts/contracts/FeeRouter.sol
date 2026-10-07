// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPancakeRouter02} from "./interfaces/IPancakeRouter02.sol";
import {IPancakeV3SwapRouter} from "./interfaces/IPancakeV3SwapRouter.sol";
import {IWETH} from "./interfaces/IWETH.sol";

/// @title FeeRouter
/// @notice Thin wrapper around a PancakeSwap-compatible Router02, *and*
/// (added 2026-09-29) PancakeSwap's V3 SwapRouter. Skims a configurable fee
/// (in basis points, hard-capped) off the input amount, forwards the fee to
/// `feeWallet`, then executes the swap for the remainder through whichever
/// underlying router the caller's chosen function targets.
///
/// V3 addition, background: a live token-list audit (2026-09-28/29) found
/// several BSC tokens (KITE, APE, WLFI, PENGU, PENDLE, NIGHT, ZRO, BONK,
/// MemeCore) with real, active liquidity on PancakeSwap V3 but none on V2
/// — the original pancakeRouter (V2-only) genuinely could not reach that
/// liquidity, no matter how the frontend routed a quote. The V3 functions
/// below close that gap. V2 support is kept as-is (same functions, same
/// behavior) for every pair that was already working.
///
/// Custody note: this contract briefly holds user funds within a single
/// transaction (pull -> skim fee -> approve remainder -> swap), and does
/// not carry a standing balance in the normal case. The one exception is
/// the pending-fee ledger: if pushing the fee to `feeWallet` ever fails
/// (broken/reverting feeWallet), the swap still completes for the user and
/// the fee is credited to *whichever address was feeWallet at the time* —
/// see `SafeERC20.trySafeTransfer`. Pending fees are tracked per-address
/// (`pendingTokenFeesByWallet`/`pendingEthFeesByWallet`), not against
/// "the current feeWallet", specifically so that changing `feeWallet` later
/// can never strand or redirect fees that already accrued to someone else —
/// each address can only ever claim (via `withdrawPendingTokenFees`/
/// `withdrawPendingEthFees`, to a recipient of their choosing, e.g. if the
/// original address is later blacklisted by the token itself) exactly what
/// accrued to it while it was feeWallet.
contract FeeRouter is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Fee is expressed in basis points out of 10_000 (e.g. 15 = 0.15%).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Hard ceiling on the owner's fee-adjustment power. Owner can
    /// never set a fee above 1%, regardless of intent.
    uint256 public constant MAX_FEE_BPS = 100;

    /// @notice Gas stipend for the feeWallet native-token push in the ETH/BNB
    /// swap paths. Bounds a malicious or broken feeWallet (owner-settable) to
    /// a fixed worst case instead of letting it consume the whole tx's gas —
    /// enough for a plain receive() or a simple multisig/vault fallback; a
    /// wallet that needs more than this degrades to the pending-fee ledger
    /// via the existing `!sent` fallback rather than reverting the swap.
    uint256 private constant FEE_WALLET_CALL_GAS_LIMIT = 30_000;

    /// @notice The underlying PancakeSwap-compatible V2 router this contract wraps.
    IPancakeRouter02 public immutable pancakeRouter;

    /// @notice PancakeSwap's V3 SwapRouter, for the V3-specific functions
    /// below. May be the zero address (V3 functions then revert with
    /// `V3RouterNotSet`) — kept nullable rather than mandatory so this same
    /// contract shape stays deployable on a chain/testnet where no V3
    /// deployment exists yet, same spirit as the rest of this codebase's
    /// per-chain conditionals (see frontend's useEvmQuote.ts chain branches).
    IPancakeV3SwapRouter public immutable v3Router;

    /// @notice The chain's canonical wrapped-native token (WBNB on BSC, WETH
    /// on Ethereum/Arbitrum). Only needed by the V3 native-BNB functions,
    /// to wrap/unwrap BNB ourselves around a V3 pool rather than depend on
    /// the V3 router's own native-token handling — see IWETH.sol. May be
    /// the zero address (those functions then revert with
    /// `WrappedNativeNotSet`); the V2 native functions don't need this at
    /// all, since pancakeRouter already handles WBNB wrapping internally.
    IWETH public immutable wrappedNative;

    /// @notice Sentinel aggregator APIs use for the chain's native currency
    /// (ETH/BNB) in `swapViaAggregatorWithFee`'s tokenIn/tokenOut.
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice DEX-aggregator routers `swapViaAggregatorWithFee` may call
    /// (e.g. KyberSwap's MetaAggregationRouterV2). Owner-managed allowlist;
    /// the router is never trusted for the result — see that function.
    mapping(address => bool) public aggregatorRouters;

    /// @notice Destination for skimmed fees.
    address public feeWallet;

    /// @notice Current fee, in basis points.
    uint256 public feeBps;

    /// @notice ERC20 fees that failed to push to `feeWallet` and are
    /// waiting to be claimed. Keyed by [the address that was feeWallet when
    /// the fee accrued][token] — NOT by the current feeWallet, so a later
    /// `setFeeWallet` call can't strand or redirect what's already owed.
    mapping(address => mapping(address => uint256)) public pendingTokenFeesByWallet;

    /// @notice Native BNB fees that failed to push, same per-wallet model.
    mapping(address => uint256) public pendingEthFeesByWallet;

    /// @notice Running total of `pendingTokenFeesByWallet` across every
    /// address, per token — used so `rescueERC20` can never touch fees
    /// owed to anyone, past or present feeWallet.
    mapping(address => uint256) public totalPendingTokenFees;

    /// @notice Same as above, for ETH.
    uint256 public totalPendingEthFees;

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
    event FeesWithdrawn(address indexed claimant, address indexed token, address recipient, uint256 amount);
    event FundsRescued(address indexed token, address indexed to, uint256 amount);
    event AggregatorRouterSet(address indexed router, bool allowed);

    error ZeroAmount();
    error ZeroAddress();
    error FeeExceedsCap(uint256 requested, uint256 max);
    error DeadlineExpired();
    error EmptyPath();
    error EthTransferFailed();
    error NothingToWithdraw();
    error InsufficientRescueBalance();
    error V3RouterNotSet();
    error WrappedNativeNotSet();
    error InvalidV3Path();
    error ZeroFeeTier();
    error RouterNotAllowed();
    error InvalidAggregatorSwap();
    error InsufficientOutput(uint256 received, uint256 minimum);

    /// @param _pancakeRouter Address of the PancakeSwap (or compatible fork) Router02.
    /// @param _v3Router Address of PancakeSwap's V3 SwapRouter, or the zero
    /// address to deploy without V3 support (all *V3* functions then revert).
    /// @param _wrappedNative Address of the chain's wrapped-native token
    /// (WBNB/WETH), or the zero address if V3's native-BNB functions won't
    /// be used. Not required for `_v3Router`'s token<->token functions.
    /// @param _feeWallet Address that receives skimmed fees.
    /// @param _feeBps Initial fee in basis points (e.g. 15 = 0.15%). Must be <= MAX_FEE_BPS.
    /// @param initialOwner Address to receive ownership (fee-adjustment rights).
    constructor(
        address _pancakeRouter,
        address _v3Router,
        address _wrappedNative,
        address _aggregatorRouter,
        address _feeWallet,
        uint256 _feeBps,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_pancakeRouter == address(0) || _feeWallet == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }
        if (_feeBps > MAX_FEE_BPS) revert FeeExceedsCap(_feeBps, MAX_FEE_BPS);

        pancakeRouter = IPancakeRouter02(_pancakeRouter);
        v3Router = IPancakeV3SwapRouter(_v3Router);
        wrappedNative = IWETH(_wrappedNative);
        if (_aggregatorRouter != address(0)) {
            aggregatorRouters[_aggregatorRouter] = true;
            emit AggregatorRouterSet(_aggregatorRouter, true);
        }
        feeWallet = _feeWallet;
        feeBps = _feeBps;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Update the fee. Hard-capped at MAX_FEE_BPS (1%) no matter what.
    /// @dev A fee change can land between a user signing a swap and it being
    /// mined, so the user's realized fee can differ from what they saw in
    /// the frontend at signing time — reviewed and accepted: the owner is a
    /// trusted role (same trust boundary as pause()/rescue*()), the change
    /// is capped at 1% regardless, and is visible on-chain via `FeeUpdated`
    /// before it's mined. No per-call `maxFeeBps` guard or timelock by
    /// design choice.
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeExceedsCap(newFeeBps, MAX_FEE_BPS);
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    /// @notice Update the fee destination wallet.
    /// @notice Allow or disallow a DEX-aggregator router for
    /// `swapViaAggregatorWithFee`.
    function setAggregatorRouter(address router, bool allowed) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        aggregatorRouters[router] = allowed;
        emit AggregatorRouterSet(router, allowed);
    }

    function setFeeWallet(address newFeeWallet) external onlyOwner {
        if (newFeeWallet == address(0)) revert ZeroAddress();
        emit FeeWalletUpdated(feeWallet, newFeeWallet);
        feeWallet = newFeeWallet;
    }

    /// @notice Emergency stop — blocks both swap entry points.
    /// @dev No auto-expiry or third-party override on the pause: it's meant
    /// to be a real, unbounded circuit breaker (same model as Uniswap/
    /// PancakeSwap's own emergency mechanisms), not a soft delay. A
    /// time-boxed auto-unpause was considered and rejected — it would let
    /// whoever compromised the owner key just wait out the timer and
    /// re-exploit, trading a liveness risk for a recurring security one.
    /// `withdrawPendingTokenFees`/`withdrawPendingEthFees` are intentionally
    /// NOT gated by `whenNotPaused`, so a pause can never trap funds already
    /// owed to someone. Reviewed and accepted; owner is a trusted role.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Claim ERC20 fees that failed to push automatically during a
    /// swap while `msg.sender` was feeWallet (see `SafeERC20.trySafeTransfer`) — works
    /// regardless of whether `msg.sender` is still the *current* feeWallet,
    /// so a `setFeeWallet` call can never strand what was already accrued.
    /// `recipient` lets a claimant redirect the payout (e.g. the address
    /// that accrued the fee has since been blacklisted by the token itself).
    function withdrawPendingTokenFees(address token, address recipient) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (recipient == address(0)) revert ZeroAddress();
        uint256 amount = pendingTokenFeesByWallet[msg.sender][token];
        if (amount == 0) revert NothingToWithdraw();
        pendingTokenFeesByWallet[msg.sender][token] = 0;
        totalPendingTokenFees[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit FeesWithdrawn(msg.sender, token, recipient, amount);
    }

    /// @notice Same as above, for native BNB fees that failed to push.
    function withdrawPendingEthFees(address payable recipient) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 amount = pendingEthFeesByWallet[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingEthFeesByWallet[msg.sender] = 0;
        totalPendingEthFees -= amount;
        // recipient is chosen by msg.sender for their own accrued balance,
        // not attacker-supplied in any way that affects other users' funds.
        // slither-disable-next-line arbitrary-send-eth
        (bool sent, ) = recipient.call{value: amount}("");
        if (!sent) revert EthTransferFailed();
        emit FeesWithdrawn(msg.sender, address(0), recipient, amount);
    }

    /// @notice Recover ERC20 tokens sent to this contract outside the
    /// normal swap flow (direct transfer, airdrop, etc). Cannot touch
    /// anything owed to anyone (past or present feeWallet) as a pending
    /// fee — only the excess.
    function rescueERC20(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 available = IERC20(token).balanceOf(address(this)) - totalPendingTokenFees[token];
        if (amount > available) revert InsufficientRescueBalance();
        IERC20(token).safeTransfer(to, amount);
        emit FundsRescued(token, to, amount);
    }

    /// @notice Same as above, for native BNB.
    function rescueETH(uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 available = address(this).balance - totalPendingEthFees;
        if (amount > available) revert InsufficientRescueBalance();
        // slither-disable-next-line arbitrary-send-eth
        (bool sent, ) = to.call{value: amount}("");
        if (!sent) revert EthTransferFailed();
        emit FundsRescued(address(0), to, amount);
    }

    // ---------------------------------------------------------------------
    // Swaps
    // ---------------------------------------------------------------------

    /// @notice Swap an exact amount of `path[0]` for `path[last]`, taking a
    /// fee off `amountIn` before swapping the remainder. Fee is computed off
    /// the amount *actually received* (balance-delta), not the caller-supplied
    /// `amountIn` — keeps the *fee* correct even if `path[0]` itself takes a
    /// transfer cut (common on BSC's many tax/reflection tokens).
    /// @dev Caller must have approved this contract for at least `amountIn`
    /// of `path[0]` beforehand.
    /// @dev WARNING: this does NOT mean the swap itself supports a
    /// fee-on-transfer `path[0]`. `pancakeRouter.swapExactTokensForTokens`
    /// pulls exactly `amountAfterFee` from this contract and expects the
    /// pair to receive that full amount — a taxed `path[0]` means the pair
    /// receives less than expected and the swap reverts (safely — no funds
    /// lost, the whole tx unwinds). Use
    /// `swapExactTokensForTokensWithFeeSupportingFeeOnTransferTokens`
    /// instead for a `path[0]` with `isFeeOnTransfer` set (see
    /// `frontend/src/data/tokens.ts`) — the frontend already does this by
    /// checking both `tokenIn.isFeeOnTransfer` and `tokenOut.isFeeOnTransfer`.
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

        IERC20(tokenIn).forceApprove(address(pancakeRouter), amountAfterFee);

        amounts = pancakeRouter.swapExactTokensForTokens(
            amountAfterFee,
            amountOutMin,
            path,
            to,
            deadline
        );

        IERC20(tokenIn).forceApprove(address(pancakeRouter), 0);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, received, feeAmount);
    }

    /// @notice Same as above, but for output tokens that also take a
    /// transfer cut (tax/reflection tokens — e.g. Alfat's 6% transfer tax).
    /// PancakeSwap's SupportingFeeOnTransferTokens variant doesn't return
    /// amounts, so slippage protection relies entirely on `amountOutMin`.
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

        IERC20(tokenIn).forceApprove(address(pancakeRouter), amountAfterFee);

        pancakeRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountAfterFee,
            amountOutMin,
            path,
            to,
            deadline
        );

        IERC20(tokenIn).forceApprove(address(pancakeRouter), 0);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, received, feeAmount);
    }

    /// @notice Swap an exact amount of native BNB (msg.value) for
    /// `path[last]`, taking a fee off msg.value before swapping the remainder.
    function swapExactETHForTokensWithFee(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256[] memory amounts) {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        if (path.length < 2) revert EmptyPath();
        if (path[0] == address(0) || path[path.length - 1] == address(0)) revert ZeroAddress();
        // Deadline vs. block.timestamp is the same pattern PancakeSwap/Uniswap
        // routers use themselves; a miner's few-second timestamp leeway can't
        // extend a stale, already-agreed-price swap in any way that matters —
        // reviewed and accepted, not swapped for a block-number check.
        if (block.timestamp > deadline) revert DeadlineExpired();

        address tokenOut = path[path.length - 1];

        (uint256 feeAmount, uint256 amountAfterFee) = _computeFee(msg.value);

        if (feeAmount > 0) {
            // feeWallet is owner-gated (setFeeWallet/onlyOwner), never attacker-supplied.
            // Gas-capped so a feeWallet with an expensive/looping fallback can't
            // consume the whole tx's gas and force the swap to revert — it just
            // falls through to the pending-fee ledger below, same as any other
            // failed push.
            // slither-disable-next-line arbitrary-send-eth
            (bool sent, ) = feeWallet.call{value: feeAmount, gas: FEE_WALLET_CALL_GAS_LIMIT}("");
            // Reached only when the call above already failed — its entire
            // execution (including any reentrant attempt) reverted, so
            // there's nothing left for a "reentering" callee to have done;
            // the state written here can't be observed mid-flight. Slither
            // still flags this pattern generically as reentrancy-benign —
            // reviewed and accepted, see the security review doc.
            if (!sent) {
                pendingEthFeesByWallet[feeWallet] += feeAmount;
                totalPendingEthFees += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }

        amounts = pancakeRouter.swapExactETHForTokens{value: amountAfterFee}(
            amountOutMin,
            path,
            to,
            deadline
        );

        emit SwapExecuted(msg.sender, address(0), tokenOut, msg.value, feeAmount);
    }

    /// @notice Same as above, but for buying a tax/reflection output token
    /// with native BNB (e.g. BNB -> Alfat, which charges a 6% transfer tax).
    /// The plain swapExactETHForTokens can revert or misbehave against a
    /// taxed output token — this calls PancakeSwap's own
    /// SupportingFeeOnTransferTokens variant instead.
    function swapExactETHForTokensWithFeeSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        if (path.length < 2) revert EmptyPath();
        if (path[0] == address(0) || path[path.length - 1] == address(0)) revert ZeroAddress();
        // Deadline vs. block.timestamp is the same pattern PancakeSwap/Uniswap
        // routers use themselves; a miner's few-second timestamp leeway can't
        // extend a stale, already-agreed-price swap in any way that matters —
        // reviewed and accepted, not swapped for a block-number check.
        if (block.timestamp > deadline) revert DeadlineExpired();

        address tokenOut = path[path.length - 1];

        (uint256 feeAmount, uint256 amountAfterFee) = _computeFee(msg.value);

        if (feeAmount > 0) {
            // feeWallet is owner-gated (setFeeWallet/onlyOwner), never attacker-supplied.
            // Gas-capped so a feeWallet with an expensive/looping fallback can't
            // consume the whole tx's gas and force the swap to revert — it just
            // falls through to the pending-fee ledger below, same as any other
            // failed push.
            // slither-disable-next-line arbitrary-send-eth
            (bool sent, ) = feeWallet.call{value: feeAmount, gas: FEE_WALLET_CALL_GAS_LIMIT}("");
            // Reached only when the call above already failed — its entire
            // execution (including any reentrant attempt) reverted, so
            // there's nothing left for a "reentering" callee to have done;
            // the state written here can't be observed mid-flight. Slither
            // still flags this pattern generically as reentrancy-benign —
            // reviewed and accepted, see the security review doc.
            if (!sent) {
                pendingEthFeesByWallet[feeWallet] += feeAmount;
                totalPendingEthFees += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }

        pancakeRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value: amountAfterFee}(
            amountOutMin,
            path,
            to,
            deadline
        );

        emit SwapExecuted(msg.sender, address(0), tokenOut, msg.value, feeAmount);
    }

    // ---------------------------------------------------------------------
    // Swaps — PancakeSwap V3
    // ---------------------------------------------------------------------
    //
    // No SupportingFeeOnTransferTokens variants here, unlike the V2
    // functions above: exactInputSingle/exactInput already settle on
    // whatever the pool actually receives/pays out (bounded by
    // `amountOutMinimum`), so a taxed tokenIn or tokenOut doesn't need a
    // separate code path the way V2's fixed-amount accounting did.

    /// @notice Swap an exact amount of `tokenIn` for `tokenOut` through a
    /// single PancakeSwap V3 pool, taking a fee off `amountIn` first.
    /// @param fee The pool's fee tier (e.g. 500 = 0.05%, 2500 = 0.25%,
    /// 10000 = 1%) — whichever tier the frontend's quote found liquidity
    /// in. Caller-supplied, like V2's `path`; protected by `amountOutMin`,
    /// not validated against a fee-tier whitelist here.
    function swapExactTokensForTokensV3WithFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (address(v3Router) == address(0)) revert V3RouterNotSet();
        if (to == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (fee == 0) revert ZeroFeeTier();

        (uint256 received, uint256 feeAmount, uint256 amountAfterFee) =
            _pullAndSkimFeeToken(amountIn, tokenIn, deadline);

        IERC20(tokenIn).forceApprove(address(v3Router), amountAfterFee);

        amountOut = v3Router.exactInputSingle(
            IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: to,
                deadline: deadline,
                amountIn: amountAfterFee,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(tokenIn).forceApprove(address(v3Router), 0);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, received, feeAmount);
    }

    /// @notice Same as above, routed through 2+ chained V3 pools via a
    /// pre-encoded path (see `IPancakeV3SwapRouter.ExactInputParams`).
    /// `tokenIn`/`tokenOut` are decoded from `v3Path` itself (its first and
    /// last 20 bytes) rather than taken as separate params, so they can
    /// never disagree with what the path actually swaps.
    function swapExactTokensForTokensV3MultiHopWithFee(
        uint256 amountIn,
        uint256 amountOutMin,
        bytes calldata v3Path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (address(v3Router) == address(0)) revert V3RouterNotSet();
        if (to == address(0)) revert ZeroAddress();
        _validateV3MultiHopPath(v3Path);

        address tokenIn = _decodeFirstToken(v3Path);
        address tokenOut = _decodeLastToken(v3Path);

        (uint256 received, uint256 feeAmount, uint256 amountAfterFee) =
            _pullAndSkimFeeToken(amountIn, tokenIn, deadline);

        IERC20(tokenIn).forceApprove(address(v3Router), amountAfterFee);

        amountOut = v3Router.exactInput(
            IPancakeV3SwapRouter.ExactInputParams({
                path: v3Path,
                recipient: to,
                deadline: deadline,
                amountIn: amountAfterFee,
                amountOutMinimum: amountOutMin
            })
        );

        IERC20(tokenIn).forceApprove(address(v3Router), 0);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, received, feeAmount);
    }

    /// @notice Swap exact native BNB (msg.value) for `tokenOut` through a
    /// single V3 pool, taking a fee off msg.value first. Wraps the
    /// post-fee BNB to `wrappedNative` itself rather than relying on the
    /// V3 router's own native-token handling.
    function swapExactETHForTokensV3WithFee(
        uint256 amountOutMin,
        address tokenOut,
        uint24 fee,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (address(v3Router) == address(0)) revert V3RouterNotSet();
        if (address(wrappedNative) == address(0)) revert WrappedNativeNotSet();
        if (to == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (fee == 0) revert ZeroFeeTier();
        if (msg.value == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert DeadlineExpired();

        (uint256 feeAmount, uint256 amountAfterFee) = _sendEthFeeOrQueue(msg.value);

        wrappedNative.deposit{value: amountAfterFee}();
        IERC20(address(wrappedNative)).forceApprove(address(v3Router), amountAfterFee);

        amountOut = v3Router.exactInputSingle(
            IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(wrappedNative),
                tokenOut: tokenOut,
                fee: fee,
                recipient: to,
                deadline: deadline,
                amountIn: amountAfterFee,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(address(wrappedNative)).forceApprove(address(v3Router), 0);

        emit SwapExecuted(msg.sender, address(0), tokenOut, msg.value, feeAmount);
    }

    /// @notice Same as above, routed through 2+ chained V3 pools. `v3Path`
    /// must start with `wrappedNative` — checked, since that's what this
    /// function actually swaps in.
    function swapExactETHForTokensV3MultiHopWithFee(
        uint256 amountOutMin,
        bytes calldata v3Path,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (address(v3Router) == address(0)) revert V3RouterNotSet();
        if (address(wrappedNative) == address(0)) revert WrappedNativeNotSet();
        if (to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert DeadlineExpired();
        _validateV3MultiHopPath(v3Path);
        if (_decodeFirstToken(v3Path) != address(wrappedNative)) revert InvalidV3Path();

        address tokenOut = _decodeLastToken(v3Path);

        (uint256 feeAmount, uint256 amountAfterFee) = _sendEthFeeOrQueue(msg.value);

        wrappedNative.deposit{value: amountAfterFee}();
        IERC20(address(wrappedNative)).forceApprove(address(v3Router), amountAfterFee);

        amountOut = v3Router.exactInput(
            IPancakeV3SwapRouter.ExactInputParams({
                path: v3Path,
                recipient: to,
                deadline: deadline,
                amountIn: amountAfterFee,
                amountOutMinimum: amountOutMin
            })
        );

        IERC20(address(wrappedNative)).forceApprove(address(v3Router), 0);

        emit SwapExecuted(msg.sender, address(0), tokenOut, msg.value, feeAmount);
    }

    /// @notice Swap exact `tokenIn` for native BNB through a single V3
    /// pool, taking a fee off `amountIn` first. The V3 router pays the
    /// swap's output to this contract (as WBNB, an ERC20 — it has no
    /// concept of "send this recipient native currency", same reason
    /// Uniswap V3's own periphery needs a separate unwrap step for
    /// ETH-out swaps), which then unwraps and forwards it to `to`.
    function swapExactTokensForETHV3WithFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        uint24 fee,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (address(v3Router) == address(0)) revert V3RouterNotSet();
        if (address(wrappedNative) == address(0)) revert WrappedNativeNotSet();
        if (to == address(0)) revert ZeroAddress();
        if (fee == 0) revert ZeroFeeTier();

        (uint256 received, uint256 feeAmount, uint256 amountAfterFee) =
            _pullAndSkimFeeToken(amountIn, tokenIn, deadline);

        IERC20(tokenIn).forceApprove(address(v3Router), amountAfterFee);

        amountOut = v3Router.exactInputSingle(
            IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: address(wrappedNative),
                fee: fee,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountAfterFee,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(tokenIn).forceApprove(address(v3Router), 0);

        wrappedNative.withdraw(amountOut);
        // recipient (`to`) is the swap's own caller-chosen destination, same
        // trust level as V2's `to` param — not attacker-supplied in any way
        // that affects other users' funds.
        // slither-disable-next-line arbitrary-send-eth
        (bool sent, ) = to.call{value: amountOut}("");
        if (!sent) revert EthTransferFailed();

        emit SwapExecuted(msg.sender, tokenIn, address(0), received, feeAmount);
    }

    /// @notice Same as above, routed through 2+ chained V3 pools. `v3Path`
    /// must end with `wrappedNative` — checked, since that's what this
    /// function actually unwraps and pays out.
    function swapExactTokensForETHV3MultiHopWithFee(
        uint256 amountIn,
        uint256 amountOutMin,
        bytes calldata v3Path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (address(v3Router) == address(0)) revert V3RouterNotSet();
        if (address(wrappedNative) == address(0)) revert WrappedNativeNotSet();
        if (to == address(0)) revert ZeroAddress();
        _validateV3MultiHopPath(v3Path);
        if (_decodeLastToken(v3Path) != address(wrappedNative)) revert InvalidV3Path();

        address tokenIn = _decodeFirstToken(v3Path);

        (uint256 received, uint256 feeAmount, uint256 amountAfterFee) =
            _pullAndSkimFeeToken(amountIn, tokenIn, deadline);

        IERC20(tokenIn).forceApprove(address(v3Router), amountAfterFee);

        amountOut = v3Router.exactInput(
            IPancakeV3SwapRouter.ExactInputParams({
                path: v3Path,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountAfterFee,
                amountOutMinimum: amountOutMin
            })
        );

        IERC20(tokenIn).forceApprove(address(v3Router), 0);

        wrappedNative.withdraw(amountOut);
        // slither-disable-next-line arbitrary-send-eth
        (bool sent, ) = to.call{value: amountOut}("");
        if (!sent) revert EthTransferFailed();

        emit SwapExecuted(msg.sender, tokenIn, address(0), received, feeAmount);
    }

    // ---------------------------------------------------------------------
    // Swaps — DEX aggregator (added 2026-10-07)
    // ---------------------------------------------------------------------

    /// @notice Take the fee off `amountIn`, then execute a swap whose route
    /// was built off-chain by a DEX aggregator (e.g. KyberSwap), reaching
    /// venues the fixed V2/V3 functions above can't (Uniswap V4, PancakeSwap
    /// Infinity, Curve, Camelot, ...). `data` must be built with this
    /// contract as both sender and recipient, for `amountIn` minus the fee.
    /// @dev The router is allowlisted but its result is not trusted: the
    /// output is measured as this contract's own `tokenOut` balance delta,
    /// checked against `amountOutMin`, and only then forwarded to `to`. The
    /// router can only take what this call approves (or sends as value),
    /// and any input it leaves unspent is refunded to the caller.
    /// `tokenIn`/`tokenOut` use NATIVE_TOKEN for ETH/BNB.
    function swapViaAggregatorWithFee(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOutMin,
        address router,
        bytes calldata data,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (!aggregatorRouters[router]) revert RouterNotAllowed();
        if (to == address(0) || tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert InvalidAggregatorSwap();
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (tokenIn == NATIVE_TOKEN ? msg.value != amountIn : msg.value != 0) revert InvalidAggregatorSwap();

        uint256 amountAfterFee = _skimAggregatorFee(tokenIn, amountIn, tokenOut, deadline);
        amountOut = _runAggregator(tokenIn, tokenOut, router, data, amountAfterFee);
        if (amountOut < amountOutMin) revert InsufficientOutput(amountOut, amountOutMin);
        _sendOut(tokenOut, to, amountOut);
    }

    /// @dev Fee step for `swapViaAggregatorWithFee`, reusing the V3 helpers'
    /// pull/skim logic. Emits SwapExecuted here (the event carries no output
    /// amount; the whole tx reverts if the swap itself fails).
    function _skimAggregatorFee(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 deadline
    ) internal returns (uint256 amountAfterFee) {
        uint256 received;
        uint256 feeAmount;
        if (tokenIn == NATIVE_TOKEN) {
            if (amountIn == 0) revert ZeroAmount();
            received = amountIn;
            (feeAmount, amountAfterFee) = _sendEthFeeOrQueue(amountIn);
        } else {
            (received, feeAmount, amountAfterFee) = _pullAndSkimFeeToken(amountIn, tokenIn, deadline);
        }
        emit SwapExecuted(
            msg.sender,
            tokenIn == NATIVE_TOKEN ? address(0) : tokenIn,
            tokenOut == NATIVE_TOKEN ? address(0) : tokenOut,
            received,
            feeAmount
        );
    }

    /// @dev Calls the allowlisted router with exactly `amountAfterFee` of
    /// tokenIn available to it, refunds whatever it leaves unspent to the
    /// caller, and returns the measured tokenOut received by this contract.
    function _runAggregator(
        address tokenIn,
        address tokenOut,
        address router,
        bytes calldata data,
        uint256 amountAfterFee
    ) internal returns (uint256 amountOut) {
        bool nativeIn = tokenIn == NATIVE_TOKEN;
        if (!nativeIn) IERC20(tokenIn).forceApprove(router, amountAfterFee);

        uint256 inBefore = _selfBalance(tokenIn);
        uint256 outBefore = _selfBalance(tokenOut);

        // Router is owner-allowlisted; everything it does is bounded by the
        // approval/value above and checked by the balance deltas below.
        // slither-disable-next-line arbitrary-send-eth,low-level-calls
        (bool ok, bytes memory ret) = router.call{value: nativeIn ? amountAfterFee : 0}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }

        if (!nativeIn) IERC20(tokenIn).forceApprove(router, 0);

        uint256 spent = inBefore - _selfBalance(tokenIn);
        if (spent < amountAfterFee) _sendOut(tokenIn, msg.sender, amountAfterFee - spent);

        amountOut = _selfBalance(tokenOut) - outBefore;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Pulls `amountIn` of `path[0]` from the caller, measuring the
    /// actual balance delta (so a tax/deflationary `path[0]` doesn't cause us
    /// to skim a fee off, or approve, more than we actually hold), then
    /// skims the fee off that real received amount.
    /// @dev Not compatible with rebasing tokens (e.g. AMPL, stETH-style) as
    /// `path[0]` — a rebase landing between the two `balanceOf` reads below
    /// could underflow the delta and revert, or skew the measured amount.
    /// Only standard ERC20 and fee-on-transfer ERC20 tokens are supported.
    /// @dev `path[0]` is caller-supplied and can be any contract, including
    /// one that lies about its own `balanceOf`/`transferFrom` — but that
    /// only lets a caller misreport accounting for tokens *it* controls
    /// within its *own* call. `received`, `feeAmount`, and the router
    /// approval are all scoped to this single transaction and this single
    /// token's self-consistent (if fabricated) view of its own balances;
    /// there's no shared state here a malicious token can use to move real
    /// value out of what other users hold in other tokens. Reviewed and
    /// accepted — not a cross-user vulnerability.
    /// @dev If `path[0]` is itself fee-on-transfer, the fee push below to
    /// `feeWallet` is *also* taxed by the token on that transfer, so
    /// feeWallet receives `feeAmount` minus the token's own cut — not a bug
    /// introduced here, this is the same token tax applying twice to two
    /// separate transfers of the same token, and has been true (and
    /// covered by the "Fee-on-transfer token handling" tests) since this
    /// function's original version.
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
        if (path[0] == address(0) || path[path.length - 1] == address(0)) revert ZeroAddress();
        // See swapExactETHForTokensWithFee: deadline-vs-block.timestamp is the
        // standard router pattern, reviewed and accepted.
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
            // trySafeTransfer (not the custom hand-rolled attempt this used
            // to be) bounds the return-data copy from the token's transfer()
            // call to 32 bytes via assembly — an arbitrary/malicious token
            // can't force this to copy an unbounded amount of return data
            // into memory as a gas-griefing vector. Non-reverting on
            // failure, so a broken/malicious feeWallet degrades to "fee
            // held here, claimable later" instead of blocking the user's
            // swap outright (see contract-level custody note).
            if (!IERC20(tokenIn).trySafeTransfer(feeWallet, feeAmount)) {
                pendingTokenFeesByWallet[feeWallet][tokenIn] += feeAmount;
                totalPendingTokenFees[tokenIn] += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }
    }

    function _computeFee(uint256 amountIn) internal view returns (uint256 feeAmount, uint256 amountAfterFee) {
        feeAmount = (amountIn * feeBps) / BPS_DENOMINATOR;
        amountAfterFee = amountIn - feeAmount;
    }

    /// @dev V3 equivalent of `_pullAndSkimFee`, for the V3 functions above —
    /// they take a single `tokenIn` rather than a `path`, since a V3 path
    /// (when used at all) is a packed-bytes encoding decoded separately by
    /// `_decodeFirstToken`/`_decodeLastToken`. Same pull-then-skim
    /// mechanics and same tax-tolerant balance-delta measurement as
    /// `_pullAndSkimFee` — kept as a separate function rather than a shared
    /// one so neither the proven V2 path nor this one risks a regression
    /// from being refactored to fit the other's shape.
    function _pullAndSkimFeeToken(
        uint256 amountIn,
        address tokenIn,
        uint256 deadline
    ) internal returns (uint256 received, uint256 feeAmount, uint256 amountAfterFee) {
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert DeadlineExpired();

        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        received = IERC20(tokenIn).balanceOf(address(this)) - balanceBefore;

        // slither-disable-next-line incorrect-equality
        if (received == 0) revert ZeroAmount();

        (feeAmount, amountAfterFee) = _computeFee(received);

        if (feeAmount > 0) {
            if (!IERC20(tokenIn).trySafeTransfer(feeWallet, feeAmount)) {
                pendingTokenFeesByWallet[feeWallet][tokenIn] += feeAmount;
                totalPendingTokenFees[tokenIn] += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }
    }

    /// @dev Shared native-BNB fee push for the two V3 *ETH* functions —
    /// same gas-capped push / pending-ledger-fallback pattern as the V2 ETH
    /// functions above, factored out here since both V3 ETH functions need
    /// it identically (the V2 ones are left as-is, each already correct and
    /// independently tested; no benefit to retrofitting them onto this).
    function _sendEthFeeOrQueue(uint256 amountIn) internal returns (uint256 feeAmount, uint256 amountAfterFee) {
        (feeAmount, amountAfterFee) = _computeFee(amountIn);

        if (feeAmount > 0) {
            // slither-disable-next-line arbitrary-send-eth
            (bool sent, ) = feeWallet.call{value: feeAmount, gas: FEE_WALLET_CALL_GAS_LIMIT}("");
            if (!sent) {
                pendingEthFeesByWallet[feeWallet] += feeAmount;
                totalPendingEthFees += feeAmount;
                emit FeeWalletTransferFailed(feeWallet, feeAmount);
            }
        }
    }

    /// @dev A packed V3 path is `token(20) . fee(3) . token(20) [. fee(3) .
    /// token(20) ...]` — valid multi-hop lengths are 43, 66, 89, ... i.e.
    /// `20 + 23*hops` for `hops >= 1`.
    function _validateV3MultiHopPath(bytes calldata v3Path) internal pure {
        if (v3Path.length < 43) revert InvalidV3Path();
        if ((v3Path.length - 20) % 23 != 0) revert InvalidV3Path();
    }

    function _decodeFirstToken(bytes calldata v3Path) internal pure returns (address token) {
        token = address(bytes20(v3Path[0:20]));
    }

    function _decodeLastToken(bytes calldata v3Path) internal pure returns (address token) {
        token = address(bytes20(v3Path[v3Path.length - 20:v3Path.length]));
    }

    function _selfBalance(address token) internal view returns (uint256) {
        return token == NATIVE_TOKEN ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    function _sendOut(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == NATIVE_TOKEN) {
            // slither-disable-next-line arbitrary-send-eth
            (bool sent, ) = to.call{value: amount}("");
            if (!sent) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @dev Only meaningful if this contract is ever sent native BNB
    /// directly (e.g. leftover dust from a router refund path). Not part
    /// of the intended flow, but accepting rather than reverting avoids
    /// stuck funds — recoverable via `rescueETH`.
    receive() external payable {}
}
