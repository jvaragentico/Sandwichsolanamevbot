import {simulateBundle,summarizeBundle} from './bundles.js';
import {loadReceipt} from './ledger-ui.js';
const $=id=>document.getElementById(id);
const node=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
let revision=0,controller;
for(const id of ['bundle-id','bundle-mode'])$(id).addEventListener('input',()=>{revision++;controller?.abort();$('bundle-results').replaceChildren();$('bundle-status').textContent='Inputs changed. Look up again.';});
$('bundle-lookup').addEventListener('submit',async event=>{
  event.preventDefault();const current=++revision;controller?.abort();controller=new AbortController();
  const id=$('bundle-id').value.trim().toLowerCase(),mode=$('bundle-mode').value;
  $('bundle-results').replaceChildren();
  if(!/^[a-f0-9]{64}$/.test(id)){$('bundle-status').textContent='Enter a 64-character hexadecimal bundle ID.';return;}
  $('bundle-status').textContent='Reading Jito mainnet status…';
  try{
    const reply=await fetch(`/api/bundle?id=${encodeURIComponent(id)}&mode=${mode}`,{signal:controller.signal});
    const data=await reply.json();if(current!==revision)return;
    if(!reply.ok)throw new Error(data.error||`Status lookup HTTP ${reply.status}`);
    const result=summarizeBundle(data.result,id,mode);
    $('bundle-status').textContent=result.status;
    $('bundle-results').append(node('p',`Checked ${new Date().toLocaleTimeString()} · Mainnet · ${mode==='inflight'?'Recent inflight history':'Receipt history'}`),node('p',result.note));
    if(Number.isSafeInteger(result.slot))$('bundle-results').append(node('p',`Reported slot: ${result.slot}`));
    for(const [index,sig] of result.transactions.entries()){
      const link=node('a',`Transaction ${index+1}: ${sig.slice(0,8)}…${sig.slice(-6)}`);link.href=`https://solscan.io/tx/${sig}`;link.target='_blank';link.rel='noopener noreferrer';
      const line=node('p','');line.append(link);$('bundle-results').append(line);
    }
    if(result.transactions.length){
      const button=node('button','Load transaction costs'),status=node('p','');button.type='button';button.className='receipt-button';
      button.addEventListener('click',async()=>{
        button.disabled=true;let loaded=0,failed=0;
        for(const signature of result.transactions){
          if(current!==revision)break;
          try{await loadReceipt(signature,'Bundle receipt');loaded++;}catch{failed++;}
          status.textContent=`${loaded} receipts added to Transactions & P&L. ${failed} unavailable.`;
          await new Promise(resolve=>setTimeout(resolve,400));
        }
        button.disabled=false;
      });
      $('bundle-results').append(button,status);
    }
  }catch(error){if(current===revision)$('bundle-status').textContent=`Lookup unavailable: ${error.message}. Retry later.`;}
});
function run(){try{
  const raw=$('bundle-slots').value.trim().split(',').map(x=>x.trim());
  if(raw.some(x=>!/^\d+$/.test(x)))throw new Error('Use comma-separated integer slots.');
  const result=simulateBundle({slots:raw.map(Number),failAt:Number($('bundle-fail').value)});
  $('bundle-sim-result').textContent=`${result.outcome}. ${result.committed} modeled commits. ${result.limitations}`;
}catch(error){$('bundle-sim-result').textContent=error.message;}}
$('bundle-sim').addEventListener('submit',event=>{event.preventDefault();run();});
$('bundle-sim').addEventListener('input',()=>{$('bundle-sim-result').textContent='Inputs changed. Run the rule model again.';});
run();
