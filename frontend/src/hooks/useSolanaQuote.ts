import { useState, useEffect } from 'react';
import { contracts } from '../config/contracts';

export function useSolanaQuote(
  inputMint: string | undefined,
  outputMint: string | undefined,
  amount: bigint | undefined // raw units
) {
  const [quote, setQuote] = useState<any>(null); // Store full quote response
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchQuote() {
      if (!inputMint || !outputMint || !amount || amount === 0n) {
        setQuote(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = new URL('https://quote-api.jup.ag/v6/quote');
        url.searchParams.append('inputMint', inputMint);
        url.searchParams.append('outputMint', outputMint);
        url.searchParams.append('amount', amount.toString());
        url.searchParams.append('slippageBps', '50'); // 0.5% default for quote
        
        // Fee account configuration
        if (contracts.solana.feeWallet) {
          url.searchParams.append('platformFeeBps', contracts.solana.feeBps.toString());
          // Jupiter requires feeAccount to be passed during /swap, but sometimes requires it in quote depending on mode.
          // Standard v6 API docs say fee is passed here.
        }

        const res = await fetch(url.toString());
        const data = await res.json();

        if (data.error) {
          throw new Error(data.error);
        }

        if (active) {
          setQuote(data);
        }
      } catch (err: any) {
        if (active) {
          console.error("Jupiter quote error:", err);
          setError(err.message || "Failed to fetch Jupiter quote");
          setQuote(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(fetchQuote, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inputMint, outputMint, amount]);

  return { quote, quoteAmountOut: quote ? BigInt(quote.outAmount) : null, loading, error };
}
