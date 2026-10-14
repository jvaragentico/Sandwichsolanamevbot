// Do not turn missing or rounded RPC values into financial amounts.
export function lamports(value){
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return BigInt(value);
  if(typeof value==='string'&&/^\d{1,30}$/.test(value))return BigInt(value);
  return null;
}
export function receiptCosts(receipt,owner){
  const meta=receipt?.meta,keys=receipt?.transaction?.message?.accountKeys??[];
  const addresses=keys.map(key=>typeof key==='string'?key:key.pubkey);
  const fee=lamports(meta?.fee),index=addresses.indexOf(owner);
  const before=index<0?null:lamports(meta?.preBalances?.[index]);
  const after=index<0?null:lamports(meta?.postBalances?.[index]);
  return {feeLamports:fee?.toString()??null,feePayer:addresses[0]??null,
    walletSolChangeLamports:before!==null&&after!==null?(after-before).toString():null};
}
export function summarizeCosts(rows){
  const unique=[...new Map(rows.map(row=>[row.signature,row])).values()];
  let fees=0n,known=0;
  for(const row of unique){const fee=lamports(row.feeLamports);if(fee!==null){fees+=fee;known++;}}
  return {count:unique.length,knownFees:known,feesLamports:fees.toString(),complete:known===unique.length,realizedPnl:null};
}
