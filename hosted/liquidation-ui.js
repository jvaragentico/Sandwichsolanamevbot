const $=id=>document.getElementById(id);
const money=value=>value===null?'Not calculated':new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
let revision=0;
function stale(){revision++;for(const id of ['liq-capital','liq-collateral','liq-proceeds','liq-pnl'])$(id).textContent='—';$('liq-status').textContent='Inputs changed. Run simulation to refresh.';$('liq-detail').textContent='';}
$('liquidation-form').addEventListener('input',stale);
$('liquidation-form').addEventListener('submit',async event=>{
  event.preventDefault();const current=++revision;
  $('liq-status').textContent='Running generic simulation…';
  try{
    const inputs=Object.fromEntries(['collateral','debt','threshold','repay','closeFactor','bonus','drop','costs','solPrice'].map(key=>[key,$(`liq-${key}-input`).value]));
    const response=await fetch(`/api/liquidation-model?${new URLSearchParams(inputs)}`,{signal:AbortSignal.timeout(15000)});
    const body=await response.json();if(current!==revision)return;
    if(!response.ok)throw new Error(body.error||'Simulation unavailable');
    const r=body.result;$('liq-status').textContent=r.status;
    $('liq-capital').textContent=money(r.capitalUsd);$('liq-collateral').textContent=money(r.collateralReceivedUsd);
    $('liq-proceeds').textContent=money(r.exitProceedsUsd);$('liq-pnl').textContent=money(r.estimatedPnlUsd);
    $('liq-detail').textContent=`Health factor: ${r.health.toFixed(3)} · Model requires below 1. Maximum modeled repayment: ${money(r.maximumRepay)}. Capital equivalent: ${r.capitalSolEquivalent.toFixed(6)} SOL at your assumed price. ${r.limitations}`;
  }catch(error){if(current===revision){$('liq-status').textContent=error.message;for(const id of ['liq-capital','liq-collateral','liq-proceeds','liq-pnl'])$(id).textContent='—';$('liq-detail').textContent='';}}
});
