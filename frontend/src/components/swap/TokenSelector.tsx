import { useState, useMemo } from 'react';
import { Token } from '@/data/tokens';

interface TokenSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: Token[];
  onSelect: (token: Token) => void;
}

export function TokenSelector({ isOpen, onClose, tokens, onSelect }: TokenSelectorProps) {
  const [search, setSearch] = useState('');

  const filteredTokens = useMemo(() => {
    if (!search) return tokens;
    const lowerSearch = search.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(lowerSearch) ||
        t.name.toLowerCase().includes(lowerSearch) ||
        t.address.toLowerCase().includes(lowerSearch)
    );
  }, [tokens, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h3 className="font-bold text-lg">Select a token</h3>
          <button onClick={onClose} className="p-2 text-text-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <input
            type="text"
            placeholder="Search by name or paste address"
            className="w-full bg-surface-light border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-white placeholder-text-muted"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-y-auto max-h-[60vh] pb-4">
          {filteredTokens.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">No tokens found</div>
          ) : (
            filteredTokens.map((token) => (
              <button
                key={token.address}
                onClick={() => {
                  onSelect(token);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-purple-500/80 flex items-center justify-center text-white font-bold shrink-0">
                  {token.symbol[0]}
                </div>
                <div>
                  <div className="font-bold text-white">{token.symbol}</div>
                  <div className="text-xs text-text-muted">{token.name}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
