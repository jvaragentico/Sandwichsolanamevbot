const simSections=new Set(['simulation','liquidation']);
function show(mode){
  for(const element of document.querySelectorAll('[data-view]'))element.hidden=element.dataset.view!==mode;
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  document.getElementById('view-note').textContent=mode==='simulation'?'SIMULATION ONLY · Synthetic assumptions · No transactions submitted':'LIVE MAINNET · Read-only data · Trading execution disabled';
  document.querySelector('.chain-pill').textContent=mode==='simulation'?'SYNTHETIC MODEL':'SOLANA MAINNET';
}
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{location.hash=button.dataset.mode==='simulation'?'liquidation':'transactions';show(button.dataset.mode);});
window.addEventListener('hashchange',()=>show(simSections.has(location.hash.slice(1))?'simulation':'live'));
show(simSections.has(location.hash.slice(1))?'simulation':'live');
