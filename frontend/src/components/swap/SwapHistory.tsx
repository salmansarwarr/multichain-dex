import { useSwapHistory } from '@/hooks/useSwapHistory';
import { formatUnits } from 'viem';

// Block-explorer hostname per chain — was previously a two-way "97 vs
// everything else" check that mislabeled Arbitrum (and BSC/ETH mainnet)
// transactions with a Sepolia Etherscan link.
const EXPLORER_HOST: Record<number, string> = {
  97: 'testnet.bscscan.com',       // BSC Testnet
  56: 'bscscan.com',               // BSC Mainnet
  11155111: 'sepolia.etherscan.io', // Ethereum Sepolia
  1: 'etherscan.io',               // Ethereum Mainnet
  421614: 'sepolia.arbiscan.io',   // Arbitrum Sepolia
  42161: 'arbiscan.io',            // Arbitrum One
};

export function SwapHistory({ chainId }: { chainId: number | undefined }) {
  const { history, loading } = useSwapHistory(chainId);

  if (!chainId || loading || history.length === 0) return null;

  const explorerHost = EXPLORER_HOST[chainId];

  return (
    <div className="w-full max-w-[480px] mx-auto mt-6 glass-card p-6">
      <h3 className="font-bold text-lg mb-4">Recent Swaps</h3>
      <div className="space-y-3">
        {history.slice(0, 5).map((tx, i) => (
          <div key={`${tx.transactionHash}-${i}`} className="flex justify-between items-center bg-surface-light border border-border rounded-xl p-3 text-sm">
            <div className="flex flex-col">
              <span className="font-medium">
                Swap 
              </span>
              {explorerHost ? (
                <a
                  href={`https://${explorerHost}/tx/${tx.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline mt-1 truncate max-w-[150px]"
                >
                  {tx.transactionHash}
                </a>
              ) : (
                <span className="text-xs text-text-muted mt-1 truncate max-w-[150px]">
                  {tx.transactionHash}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-text-muted text-xs">Fee Paid</span>
              <span className="font-medium text-green-400">
                {/* Simplified format, ideally use token decimals */}
                {formatUnits(tx.feeAmount, 18)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
