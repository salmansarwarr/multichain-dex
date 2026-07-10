/**
 * Jupiter pays platform fees in whatever token comes out of the swap (see
 * jupiterService.ts) — it does NOT auto-convert fees to a single token.
 * That means the fee wallet needs a separate Associated Token Account
 * (ATA) for every distinct mint fees get collected in.
 *
 * This module is a thin, documented wrapper around @solana/spl-token's
 * own `getOrCreateAssociatedTokenAccount` — no custom on-chain logic here,
 * just our specific usage pattern (fee wallet as owner, one ATA per mint).
 */
import {
    getOrCreateAssociatedTokenAccount as splGetOrCreateAta,
    getAssociatedTokenAddress,
  } from "@solana/spl-token";
  import type { Connection, PublicKey, Signer } from "@solana/web3.js";
  
  export interface FeeAccountResult {
    /** The ATA's own address — this is what you pass as `feeAccount` to Jupiter. */
    address: PublicKey;
    /** Whether this call created the account (false if it already existed). */
    wasCreated: boolean;
  }
  
  /**
   * Get (or create, if missing) the fee wallet's ATA for a given mint.
   *
   * @param connection  RPC connection (devnet or mainnet-beta, caller's choice)
   * @param payer       Pays the rent for account creation if it doesn't exist yet.
   *                    Does NOT need to be the fee wallet itself — e.g. your
   *                    ops/deployer wallet can pay rent while the fee wallet
   *                    owns the resulting account.
   * @param feeWalletOwner  Public key of the wallet that should OWN the fee ATA.
   * @param mint        The SPL token mint fees will be collected in (i.e. the
   *                    swap's output mint for the pair(s) you're routing).
   */
  export async function getOrCreateFeeAccount(
    connection: Connection,
    payer: Signer,
    feeWalletOwner: PublicKey,
    mint: PublicKey
  ): Promise<FeeAccountResult> {
    const expectedAddress = await getAssociatedTokenAddress(mint, feeWalletOwner);
    const existingInfo = await connection.getAccountInfo(expectedAddress);
    const alreadyExisted = existingInfo !== null;
  
    const account = await splGetOrCreateAta(connection, payer, mint, feeWalletOwner);
  
    return {
      address: account.address,
      wasCreated: !alreadyExisted,
    };
  }