import {receiptCosts,summarizeCosts} from './costs.js';
import {formatSol} from './simulation.js';
const $=id=>document.getElementById(id),manual=new Map();
let patterns=[],currentRows=[];
const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;return node;};
const compact=value=>value?`${value.slice(0,6)}…${value.slice(-5)}`:'—';
function link(value,kind){const a=el('a',compact(value));a.href=`https://solscan.io/${kind}/${encodeURIComponent(value)}`;a.target='_blank';a.rel='noopener noreferrer';a.title=value;return a;}
const amount=value=>value==null?'Unavailable':`${formatSol(value)} SOL`;
export function setPatternTransactions(matches){
  patterns=matches.flatMap(match=>['front','middle','back'].map(leg=>({...match[leg],source:'Observed pattern',role:leg==='front'?'First':leg==='back'?'Reverse':'Middle',status:'Confirmed · successful'})));
  render();
}
export async function loadReceipt(signature,source='Receipt lookup'){
  if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))throw new Error('Enter a valid transaction signature.');
  let endpoint='Hosted RPC proxy';
  let response=await fetch(`/api/transaction?signature=${encodeURIComponent(signature)}`,{signal:AbortSignal.timeout(20000)});
  if([403,429].includes(response.status)){
    endpoint='Browser → PublicNode';
    response=await fetch('https://solana-rpc.publicnode.com',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:1}]})});
  }
  const body=await response.json();if(!response.ok||body.error)throw new Error(typeof body.error==='string'?body.error:body.error?.message||`RPC HTTP ${response.status}. Retry later.`);
  const tx=body.result;if(!tx?.meta)throw new Error('Receipt not available. It may be too recent or outside RPC history.');
  if(tx.transaction?.signatures?.[0]!==signature)throw new Error('RPC returned a different transaction.');
  const first=tx.transaction.message?.accountKeys?.[0],owner=typeof first==='string'?first:first?.pubkey;
  const row={signature,owner,slot:tx.slot,time:tx.blockTime?tx.blockTime*1000:null,source,endpoint,role:'Fee payer',side:null,
    status:tx.meta.err?'Confirmed · failed':'Confirmed · successful',...receiptCosts(tx,owner)};
  manual.delete(signature);manual.set(signature,row);if(manual.size>100)manual.delete(manual.keys().next().value);
  render();return row;
}
function render(){
  const entries=new Map(manual);
  for(const row of patterns)entries.set(row.signature,row);
  currentRows=[...entries.values()].sort((a,b)=>(b.slot??0)-(a.slot??0));
  const total=summarizeCosts(currentRows);
  $('ledger-count').textContent=String(total.count);
  $('ledger-fees').textContent=!total.count?'—':total.knownFees?amount(total.feesLamports):'Unavailable';
  $('ledger-coverage').textContent=total.count?`${total.knownFees}/${total.count} receipts with fee data${total.complete?'':' · partial total'}`:'Waiting for transaction receipts';
  $('ledger-export').disabled=!total.count;
  $('ledger-body').replaceChildren();
  for(const row of currentRows.slice(0,100)){
    const tr=el('tr'),tx=el('td');tx.append(link(row.signature,'tx'),el('small',`Slot ${row.slot??'—'} · ${row.time?new Date(row.time).toLocaleString():'Time unavailable'}`));
    const account=el('td');if(row.owner)account.append(link(row.owner,'account'));else account.append('—');account.append(el('small',row.role));
    const fee=el('td',amount(row.feeLamports));fee.append(el('small',`Payer: ${compact(row.feePayer)}`));
    const origin=el('td',`${row.source}${row.side?` · ${row.side.toUpperCase()}`:''}`);if(row.endpoint)origin.append(el('small',row.endpoint));
    tr.append(tx,origin,el('td',row.status),account,fee,el('td',amount(row.walletSolChangeLamports)),el('td','Unverified'));
    $('ledger-body').append(tr);
  }
  $('ledger-empty').hidden=!!total.count;
  $('ledger-scope').textContent=`${total.count>100?'Latest 100 rows shown. ':''}Unique transactions from retained pattern matches and manual receipts. No duplicate fee counting. Session only; reload clears this table.`;
}
$('receipt-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('receipt-load');button.disabled=true;$('receipt-status').textContent='Loading confirmed receipt…';
  try{await loadReceipt($('receipt-signature').value.trim());$('receipt-status').textContent='Receipt added. Network fee is shown below; P&L remains unverified.';}
  catch(error){$('receipt-status').textContent=error.message;}
  finally{button.disabled=false;}
});
$('ledger-export').addEventListener('click',()=>{
  const report={source:'confirmed-mainnet-receipts',exportedAt:new Date().toISOString(),summary:summarizeCosts(currentRows),transactions:currentRows,
    limitations:'SOL balance change includes transfers, rent and fees; it excludes SPL token valuation. It is not realized profit. Fee total excludes separately paid tips, DEX fees and other trading costs.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=el('a');a.href=url;a.download='flowwatch-transactions-costs.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
render();
