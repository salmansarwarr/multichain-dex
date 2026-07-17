import { SwapState } from '@/hooks/useSwap';

interface SwapButtonProps {
  isConnected: boolean;
  isWrongNetwork?: boolean;
  needsApproval: boolean;
  hasInsufficientBalance: boolean;
  isBelowMin?: boolean;
  isAboveMax?: boolean;
  minAmountLabel?: string;
  maxAmountLabel?: string;
  swapState: SwapState;
  approving: boolean;
  onConnect: () => void;
  onSwitchNetwork?: () => void;
  onApprove: () => void;
  onSwap: () => void;
  disabled?: boolean;
}

export function SwapButton({
  isConnected,
  isWrongNetwork,
  needsApproval,
  hasInsufficientBalance,
  isBelowMin,
  isAboveMax,
  minAmountLabel,
  maxAmountLabel,
  swapState,
  approving,
  onConnect,
  onSwitchNetwork,
  onApprove,
  onSwap,
  disabled
}: SwapButtonProps) {
  if (!isConnected) {
    return (
      <button
        onClick={onConnect}
        className="w-full mt-4 bg-primary hover:bg-primary-hover text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
      >
        Connect Wallet
      </button>
    );
  }

  if (isWrongNetwork && onSwitchNetwork) {
    return (
      <button
        onClick={onSwitchNetwork}
        className="w-full mt-4 bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold py-4 rounded-xl transition-all border border-red-500/50"
      >
        Switch Network
      </button>
    );
  }

  if (hasInsufficientBalance) {
    return (
      <button
        disabled
        className="w-full mt-4 bg-surface-light text-text-muted font-bold py-4 rounded-xl cursor-not-allowed border border-border"
      >
        Insufficient Balance
      </button>
    );
  }

  if (isBelowMin) {
    return (
      <button
        disabled
        className="w-full mt-4 bg-surface-light text-text-muted font-bold py-4 rounded-xl cursor-not-allowed border border-border"
      >
        {minAmountLabel ? `Minimum swap is ${minAmountLabel}` : 'Below minimum swap amount'}
      </button>
    );
  }

  if (isAboveMax) {
    return (
      <button
        disabled
        className="w-full mt-4 bg-surface-light text-text-muted font-bold py-4 rounded-xl cursor-not-allowed border border-border"
      >
        {maxAmountLabel ? `Maximum swap is ${maxAmountLabel}` : 'Above maximum swap amount'}
      </button>
    );
  }

  if (needsApproval) {
    return (
      <button
        onClick={onApprove}
        disabled={approving || disabled}
        className="w-full mt-4 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-light disabled:text-text-muted disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all"
      >
        {approving ? 'Approving...' : 'Approve Token'}
      </button>
    );
  }

  const isSwapping = swapState === 'SWAPPING';

  return (
    <button
      onClick={onSwap}
      disabled={isSwapping || disabled}
      className={`w-full mt-4 font-bold py-4 rounded-xl transition-all ${
        isSwapping || disabled
          ? 'bg-surface-light text-text-muted cursor-not-allowed border border-border'
          : 'bg-primary hover:bg-primary-hover text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]'
      }`}
    >
      {isSwapping ? 'Swapping...' : 'Swap'}
    </button>
  );
}
