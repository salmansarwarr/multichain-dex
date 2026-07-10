import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEVNET_URL = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
const USDC_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

async function main() {
  const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyStr) {
    throw new Error('SOLANA_PRIVATE_KEY not found in ../.env');
  }
  
  // Try to parse private key (JSON array)
  let secretKey;
  try {
     secretKey = Uint8Array.from(JSON.parse(privateKeyStr));
  } catch (e) {
     throw new Error("Failed to parse SOLANA_PRIVATE_KEY. Make sure it's a JSON array of bytes.");
  }
  
  const payer = Keypair.fromSecretKey(secretKey);
  const connection = new Connection(DEVNET_URL, 'confirmed');

  const feeWalletStr = process.env.NEXT_PUBLIC_SOLANA_FEE_WALLET_ADDRESS;
  if (!feeWalletStr) {
     throw new Error("NEXT_PUBLIC_SOLANA_FEE_WALLET_ADDRESS not set in ../.env");
  }
  const feeWallet = new PublicKey(feeWalletStr);

  console.log('Connecting to devnet...');
  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Fee Wallet:', feeWallet.toBase58());
  console.log('Token Mint (USDC):', USDC_DEVNET.toBase58());

  try {
    const feeAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer, // payer
      USDC_DEVNET, // mint
      feeWallet // owner
    );

    console.log('\nSuccess!');
    console.log('Fee Wallet ATA for USDC:', feeAta.address.toBase58());
  } catch (error) {
    console.error('\nError creating ATA:', error);
  }
}

main().catch(console.error);
