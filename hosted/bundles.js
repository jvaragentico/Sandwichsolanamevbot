// Read-only presentation and local rule modeling; no transaction construction.
export function simulateBundle({slots,failAt=0}) {
  if (!Array.isArray(slots)||slots.length<1||slots.length>5) throw new Error('Enter one to five transaction slots.');
  if (slots.some(x=>!Number.isSafeInteger(x)||x<0)) throw new Error('Slots must be nonnegative integers.');
  if (!Number.isInteger(failAt)||failAt<0||failAt>slots.length) throw new Error('Failure position must be 0 or a transaction position in this bundle.');
  const sameSlot=new Set(slots).size===1;
  const outcome=!sameSlot?'Rejected: crosses slot boundaries':failAt?'Modeled rollback: no transactions committed':'Modeled atomic success';
  return {source:'synthetic-local',network:'none',slots,failAt,outcome,committed:sameSlot&&!failAt?slots.length:0,
    limitations:'Rule model only. No Solana VM execution, signatures, account state, auction, fees or profitability tested.'};
}

export function summarizeBundle(result,id,mode) {
  const rows=result?.value;
  if (result!==null && !Array.isArray(rows)) throw new Error('Unexpected Jito response.');
  const row=rows?.find(item=>item?.bundle_id===id);
  if(!row)return {status:'Unknown / outside available history',slot:null,transactions:[],note:'Not found does not prove failure or non-execution.'};
  if(mode==='inflight') {
    if(!['Pending','Failed','Landed','Invalid'].includes(row.status))throw new Error('Unknown Jito status.');
    return {status:row.status==='Invalid'?'Unknown / outside five-minute history':`Jito reports ${row.status}`,slot:row.landed_slot??null,transactions:[],note:'Recent status only. Use receipt history for transaction links. Profit is unverified.'};
  }
  const confirmation=row.confirmation_status??row.confirmationStatus;
  const ok=row.err===null || (row.err&&Object.keys(row.err).length===1&&Object.hasOwn(row.err,'Ok')&&row.err.Ok===null);
  return {status:ok?`Receipt reported · ${['processed','confirmed','finalized'].includes(confirmation)?confirmation:'confirmation unknown'}`:'Receipt reports an error or unknown result',
    slot:row.slot??null,transactions:(Array.isArray(row.transactions)?row.transactions:[]).filter(sig=>typeof sig==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(sig)).slice(0,5),
    note:ok?'Jito receipt data; wallet balances and realized profit have not been reconciled.':`Receipt error: ${JSON.stringify(row.err??'unavailable')}`};
}
