import { createPublicClient, http, parseEther, formatUnits, parseAbi, encodePacked } from 'viem';
import { arbitrum } from 'viem/chains';
import fs from 'fs';
const c = createPublicClient({ chain: arbitrum, transport: http(process.env.RPC) });
const { tokens, prices } = JSON.parse(fs.readFileSync(process.env.S + '/arb_ref.json'));
const V2 = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', Q = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const WETH = await c.readContract({ address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', abi: parseAbi(['function WETH9() view returns (address)']), functionName: 'WETH9' });
const v2weth = await c.readContract({ address: V2, abi: parseAbi(['function WETH() view returns (address)']), functionName: 'WETH' });
console.log('WETH (V3 router):', WETH, '| WETH (V2 router):', v2weth);
const MIDS = Object.fromEntries(tokens.filter(t => ['USDC', 'USDT'].includes(t.sym)).map(t => [t.sym, t.addr]));
const qabi = [{ name: 'quoteExactInputSingle', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'p', type: 'tuple', components: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'fee', type: 'uint24' }, { name: 'sqrtPriceLimitX96', type: 'uint160' }] }], outputs: [{ type: 'uint256' }, { type: 'uint160' }, { type: 'uint32' }, { type: 'uint256' }] }, { name: 'quoteExactInput', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'path', type: 'bytes' }, { name: 'amountIn', type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint160[]' }, { type: 'uint32[]' }, { type: 'uint256' }] }];
const F = [100, 500, 3000, 10000];
const amt = parseEther('0.1') * 9985n / 10000n;
const eth = +prices[WETH.toLowerCase()];
const sim = (fn, a) => c.simulateContract({ address: Q, abi: qabi, functionName: fn, args: a }).then(r => r.result[0]).catch(() => 0n);
const pct = (o, dec, mkt) => o ? ((+formatUnits(o, dec) / mkt - 1) * 100).toFixed(2) + '%' : 'none';
for (const t of tokens) {
  const dec = Number(await c.readContract({ address: t.addr, abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals' }));
  let v2 = 0n;
  for (const p of [[WETH, t.addr], ...Object.values(MIDS).filter(m => m !== t.addr).map(m => [WETH, m, t.addr])]) { const o = await c.readContract({ address: V2, abi: parseAbi(['function getAmountsOut(uint,address[]) view returns (uint[])']), functionName: 'getAmountsOut', args: [amt, p] }).then(r => r.at(-1)).catch(() => 0n); if (o > v2) v2 = o; }
  let v3 = 0n, how = '';
  for (const f of F) { const o = await sim('quoteExactInputSingle', [{ tokenIn: WETH, tokenOut: t.addr, amountIn: amt, fee: f, sqrtPriceLimitX96: 0n }]); if (o > v3) { v3 = o; how = 'direct ' + f / 10000 + '%'; } }
  for (const [k, m] of Object.entries(MIDS)) { if (m === t.addr) continue; for (const f1 of F) for (const f2 of F) { const o = await sim('quoteExactInput', [encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [WETH, f1, m, f2, t.addr]), amt]); if (o > v3) { v3 = o; how = 'via ' + k; } } }
  const mkt = 0.1 * eth / +prices[t.addr];
  console.log(`${t.sym.padEnd(7)} V2 (today) ${pct(v2, dec, mkt).padStart(9)} | V3 ${pct(v3, dec, mkt).padStart(9)} ${how}`);
}
