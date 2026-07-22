import { Token } from '@/data/tokens';
import { useState } from 'react';
import { TokenSelector } from './TokenSelector';
import { TokenIcon } from './TokenIcon';

interface TokenAmountInputProps {
  label: string;
  amount: string;
  onAmountChange?: (value: string) => void;
  token: Token | null;
  onTokenSelect?: (token: Token) => void;
  tokens: Token[];
  disabled?: boolean;
  loading?: boolean;
  balance?: string;
  onMax?: () => void;
  chainId?: number;
}

export function TokenAmountInput({
  label,
  amount,
  onAmountChange,
  token,
  onTokenSelect,
  tokens,
  disabled = false,
  loading = false,
  balance,
  onMax,
  chainId,
}: TokenAmountInputProps) {
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  return (
    <>
      <div className="bg-surface-light border border-border rounded-2xl p-4 transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-text-muted">{label}</span>
          {balance !== undefined && (
            <div className="text-xs text-text-muted flex items-center gap-2">
              <span>Balance: {balance}</span>
              {onMax && (
                <button onClick={onMax} className="text-primary hover:text-primary-hover font-medium">
                  MAX
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <input
            type="text"
            className="w-full bg-transparent text-3xl font-bold focus:outline-none text-white placeholder-text-muted/30"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              // Only allow numbers and one decimal point
              const val = e.target.value.replace(/[^0-9.]/g, '');
              const parts = val.split('.');
              if (parts.length > 2) return;
              onAmountChange?.(val);
            }}
            disabled={disabled}
          />

          {loading ? (
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2 shrink-0"></div>
          ) : null}

          {onTokenSelect ? (
            <button
              onClick={() => setIsSelectorOpen(true)}
              className="shrink-0 flex items-center gap-2 bg-surface hover:bg-white/10 border border-border px-3 py-1.5 rounded-xl font-bold transition-colors"
            >
              {token ? (
                <>
                  <TokenIcon token={token} className="w-6 h-6 text-xs" />
                  <span>{token.symbol}</span>
                </>
              ) : (
                <span>Select Token</span>
              )}
              <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 font-bold">
              {token && (
                <>
                  <TokenIcon token={token} className="w-6 h-6 text-xs" />
                  <span>{token.symbol}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {onTokenSelect && (
        <TokenSelector
          isOpen={isSelectorOpen}
          onClose={() => setIsSelectorOpen(false)}
          tokens={tokens}
          onSelect={onTokenSelect}
          chainId={chainId}
        />
      )}
    </>
  );
}
