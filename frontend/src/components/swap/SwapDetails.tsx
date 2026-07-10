import { useState } from 'react';

interface SwapDetailsProps {
  feeAmount: string | null;
  feeSymbol: string | null;
  minReceived: string | null;
  minReceivedSymbol: string | null;
  slippage: string;
  onSlippageChange: (val: string) => void;
}

export function SwapDetails({
  feeAmount,
  feeSymbol,
  minReceived,
  minReceivedSymbol,
  slippage,
  onSlippageChange,
}: SwapDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full mt-4 bg-surface-light border border-border rounded-2xl overflow-hidden transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-sm"
      >
        <span className="font-medium text-text-muted">Swap Details</span>
        <div className="flex items-center gap-2">
          {feeAmount && <span className="text-white">Fee: 0.15%</span>}
          <svg
            className={`w-4 h-4 text-text-muted transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3 text-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center text-text-muted">
            <span>Slippage Tolerance</span>
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-2 py-1">
              <input
                type="text"
                className="w-10 bg-transparent text-right focus:outline-none text-white"
                value={slippage}
                onChange={(e) => onSlippageChange(e.target.value.replace(/[^0-9.]/g, ''))}
              />
              <span>%</span>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-muted">Platform Fee (0.15%)</span>
            <span className="font-medium">
              {feeAmount ? `${feeAmount} ${feeSymbol}` : '-'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-muted">Minimum Received</span>
            <span className="font-medium">
              {minReceived ? `${minReceived} ${minReceivedSymbol}` : '-'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
