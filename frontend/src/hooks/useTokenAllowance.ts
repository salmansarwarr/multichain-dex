import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { Address } from 'viem';
import { ERC20ABI } from '../abis/ERC20';
import { NATIVE_TOKEN_ADDRESS } from '../data/tokens';
import { useEffect, useState } from 'react';

export function useTokenAllowance(
  tokenAddress: string | undefined,
  spenderAddress: Address | undefined,
  amount: bigint | undefined
) {
  const { address } = useAccount();
  const isNative = !tokenAddress || tokenAddress === NATIVE_TOKEN_ADDRESS;
  const [needsApproval, setNeedsApproval] = useState(false);

  const { data: allowance, refetch } = useReadContract({
    address: isNative ? undefined : (tokenAddress as Address),
    abi: ERC20ABI,
    functionName: 'allowance',
    args: address && spenderAddress ? [address, spenderAddress] : undefined,
    query: {
      enabled: !isNative && !!address && !!spenderAddress,
    }
  });

  useEffect(() => {
    if (isNative || !amount) {
      setNeedsApproval(false);
      return;
    }
    if (allowance !== undefined) {
      setNeedsApproval(allowance < amount);
    }
  }, [allowance, amount, isNative]);

  const { writeContractAsync, isPending: isWritePending, data: hash, error: writeError } = useWriteContract();

  const { isLoading: isTxPending, isSuccess, error: txError } = useWaitForTransactionReceipt({
    hash,
  });

  const approve = async () => {
    if (isNative || !tokenAddress || !spenderAddress) return;
    
    // Max Uint256
    const maxAllowance = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
    
    await writeContractAsync({
      address: tokenAddress as Address,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [spenderAddress, maxAllowance],
    });
  };

  useEffect(() => {
    if (isSuccess) {
      refetch();
    }
  }, [isSuccess, refetch]);

  return {
    needsApproval,
    approve,
    approving: isWritePending || isTxPending,
    error: writeError || txError,
  };
}
