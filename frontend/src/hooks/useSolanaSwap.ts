import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { contracts } from '../config/contracts';

export type SwapState = 'IDLE' | 'SWAPPING' | 'SUCCESS' | 'ERROR';

export function useSolanaSwap() {
  const [state, setState] = useState<SwapState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const execute = async (quoteResponse: any) => {
    if (!publicKey || !signTransaction) {
      setError("Wallet not connected");
      setState('ERROR');
      return;
    }

    setState('SWAPPING');
    setError(null);
    setTxHash(null);

    try {
      // 1. Get serialized transaction from Jupiter API
      const swapRequestBody = {
        quoteResponse,
        userPublicKey: publicKey.toString(),
        wrapAndUnwrapSol: true,
        feeAccount: contracts.solana.feeWallet || undefined,
      };

      const res = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapRequestBody)
      });

      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const { swapTransaction } = data;

      if (!swapTransaction) {
        throw new Error("No swap transaction returned");
      }

      // 2. Deserialize transaction
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // 3. Sign transaction
      const signedTransaction = await signTransaction(transaction);

      // 4. Execute transaction
      const rawTransaction = signedTransaction.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
      });

      setTxHash(txid);

      // 5. Confirm transaction
      const latestBlockHash = await connection.getLatestBlockhash();
      const confirmation = await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid
      });

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
      }

      setState('SUCCESS');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Swap execution failed');
      setState('ERROR');
    }
  };

  const reset = () => {
    setState('IDLE');
    setError(null);
    setTxHash(null);
  };

  return { state, execute, txHash, error, reset };
}
