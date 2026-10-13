import { runSimulation, assessProfitability } from './simulation.js';

const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
let report=null;
function run(){
  try{
    const simulation=runSimulation({scenario:$('sim-scenario').value,venue:$('sim-venue').value,
      gap:Number($('sim-gap').value),maxSlots:Number($('sim-window').value)});
    const accounting=assessProfitability(Object.fromEntries([
      ...['entry','exit','fees','tips','other'].map(key=>[key,$(`sim-${key}`).value]),
      ['closed',$('sim-closed').checked],['costsComplete',$('sim-costs').checked],
    ]));
    report={...simulation,accounting,generatedAt:new Date().toISOString()};
    $('sim-result').textContent=simulation.status;
    $('sim-explanation').textContent=simulation.explanation;
    $('sim-count').textContent=`${simulation.trades.length} decoded trades · ${simulation.matches.length} pattern matches · ${simulation.coverage}`;
    $('sim-timeline').replaceChildren();
    for(const leg of simulation.legs){
      const card=node('article','','sim-leg');
      card.append(node('small',`SIMULATED SLOT ${leg.slot} · #${leg.transactionIndex+1}`),
        node('h3',`${leg.role} · ${leg.side.toUpperCase()}`),node('p',leg.wallet),
        node('p',`${leg.pool.startsWith('P')?'Pool P':'Pool Q'} · 1 test token`),
        node('span',leg.observed?'Observed by detector':'BLOCK OMITTED',leg.observed?'sim-observed':'sim-missing'));
      $('sim-timeline').append(card);
    }
    $('sim-pnl').textContent=`${accounting.netSol} SOL`;
    $('sim-pnl-label').textContent=accounting.status;
    $('sim-accounting-note').textContent=accounting.status==='Incomplete accounting'?
      'This cash difference is not realized profit: confirm that inventory is closed and all costs are included.':
      'Calculated from your supplied amounts. Prices, fills and future outcomes have not been tested.';
    $('sim-error').textContent='';$('sim-export').disabled=false;
    $('sim-freshness').textContent='Report matches the inputs below.';
  }catch(error){
    report=null;$('sim-export').disabled=true;$('sim-error').textContent=error.message;
    $('sim-result').textContent='Invalid inputs';$('sim-pnl').textContent='—';$('sim-pnl-label').textContent='Not calculated';
    $('sim-explanation').textContent='Correct the inputs and run again.';$('sim-count').textContent='';
    $('sim-timeline').replaceChildren();$('sim-accounting-note').textContent='';
  }
}
function markChanged(){
  report=null;$('sim-export').disabled=true;$('sim-freshness').textContent='Inputs changed. Run again to refresh the report.';
}
$('sim-form').addEventListener('input',markChanged);
$('sim-form').addEventListener('change',markChanged);
$('sim-form').addEventListener('submit',event=>{event.preventDefault();run();});
$('sim-export').addEventListener('click',()=>{
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='flowwatch-synthetic-report.json';
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
run();
