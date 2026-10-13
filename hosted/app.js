import { PROGRAMS, extractBlockTrades, SandwichDetector } from './analyzer.js';

const names = ['sidebar-dot','sidebar-status','metric-connection','metric-subscriptions','metric-trades','metric-candidates','metric-dropped','metric-last','stream-chip','stream-label','candidate-list','scanner-error','watch-mint','max-slots','save-settings','setting-feedback'];
const ui = Object.fromEntries(names.map(id => [id, document.getElementById(id)]));
const compact = value => value ? `${value.slice(0,6)}…${value.slice(-5)}` : '—';
const clock = value => value ? new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(value) : '—';
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
function el(tag,className,value){const node=document.createElement(tag);if(className)node.className=className;if(value!=null)node.textContent=value;return node;}
function link(value,kind='tx',label=compact(value)){
  const a=el('a','',label);a.href=`https://solscan.io/${kind}/${encodeURIComponent(value)}`;
  a.target='_blank';a.rel='noopener noreferrer';a.title=value;return a;
}

let scanner;
class BrowserScanner {
  constructor(options){
    this.options=options;this.detector=new SandwichDetector(options.maxSlots);
    this.status='connecting';this.error=null;this.trades=0;this.candidates=[];this.dropped=0;this.lastTrade=null;
    this.blocks=0;this.lastPoll=null;this.lastSignature=new Map();this.seenSlots=new Set();
    this.running=true;this.abort=new AbortController();this.poll();
  }
  stop(){this.running=false;clearTimeout(this.timer);this.abort.abort();}
  async getJson(path){
    const response=await fetch(path,{signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(20000)]),cache:'no-store'});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error??`HTTP ${response.status}`);
    return payload.result;
  }
  async poll(){
    if(!this.running)return;
    const errors=[],slots=new Set();
    const sources=this.options.mint?[this.options.mint]:Object.values(PROGRAMS);
    for(const address of sources){
      try{
        const entries=await this.getJson(`/api/signatures?address=${encodeURIComponent(address)}`);
        if(!this.running)return;
        if(!Array.isArray(entries))throw new Error('Invalid signature response');
        const cursor=this.lastSignature.get(address);
        const index=cursor?entries.findIndex(item=>item.signature===cursor):-1;
        if(cursor&&index===-1&&entries.length===40)this.dropped++;
        // Retry unavailable blocks still present in the recent signature window.
        for(const entry of entries)if(!entry.err&&!this.seenSlots.has(entry.slot))slots.add(entry.slot);
        if(entries[0])this.lastSignature.set(address,entries[0].signature);
      }catch(error){if(!this.running)return;errors.push(error.message);}
    }
    const available=[...slots].sort((a,b)=>a-b);
    // Read complete sampled blocks, preserving transaction positions within each block.
    const selected=available.slice(-1);
    this.dropped+=Math.max(0,available.length-selected.length);
    for(const slot of available.slice(0,-1))this.seenSlots.add(slot);
    for(const slot of selected){
      try{
        if(!this.running)return;
        const block=await this.getJson(`/api/block?slot=${slot}`);
        if(!this.running)return;
        if(!block||!Array.isArray(block.transactions))throw new Error(`Block ${slot} is not available yet`);
        this.seenSlots.add(slot);this.blocks++;
        for(const trade of extractBlockTrades(block,slot)){
          if(this.options.mint&&trade.mint!==this.options.mint)continue;
          this.trades++;this.lastTrade=Date.now();
          for(const candidate of this.detector.add(trade))this.candidates.unshift(candidate);
        }
        this.candidates.length=Math.min(this.candidates.length,100);
        render();await sleep(350);
      }catch(error){if(!this.running)return;errors.push(error.message);}
    }
    if(!this.running)return;
    if(this.seenSlots.size>2000)this.seenSlots=new Set([...this.seenSlots].sort((a,b)=>a-b).slice(-1000));
    this.error=[...new Set(errors)].join(' · ')||null;
    this.status=this.error?'degraded':'sampled';this.lastPoll=Date.now();render();
    this.timer=setTimeout(()=>this.poll(),this.error?.includes('429')?30000:15000);
  }
}

function renderCandidates(){
  ui['candidate-list'].replaceChildren();
  if(!scanner?.candidates.length){
    const message=scanner?.error?'Scanning is limited by the data connection. No suspected sandwiches recorded yet.':
      scanner?.blocks?'No suspected sandwiches in the blocks scanned this session.':'Waiting for the first mainnet block…';
    ui['candidate-list'].append(el('div','empty-card',message));return;
  }
  for(const match of scanner.candidates.slice(0,30)){
    const card=el('article','candidate'),heading=el('div','candidate-heading');
    heading.append(link(match.mint,'token'),el('span','',match.label));
    const meta=el('div','candidate-meta',`${match.venue} · ${match.direction.toUpperCase()} → ${match.direction.toUpperCase()} → ${match.direction==='buy'?'SELL':'BUY'} · ${match.slots===0?'Same slot':`${match.slots}-slot span`} · ${clock(match.time)}`);
    const wallet=el('div','candidate-wallet');wallet.append('First / reverse wallet: ',link(match.front.owner,'account'));
    const pool=el('div','candidate-wallet');pool.append('Shared pool: ',link(match.pool,'account'));
    const sequence=el('div','sequence');
    for(const [label,leg] of [['FIRST',match.front],['MIDDLE',match.middle],['REVERSE',match.back]]){
      const cell=el('div');cell.append(el('small','',`${label} · slot ${leg.slot} · #${leg.transactionIndex+1}`),link(leg.signature));sequence.append(cell);
    }
    const evidence=el('p','candidate-evidence','Same pool and mint · matching outer wallet · different middle wallet · block order verified. Intent and profit unverified.');
    card.append(heading,meta,wallet,pool,sequence,evidence);ui['candidate-list'].append(card);
  }
}
function render(){
  if(!scanner)return;
  const state=scanner.status==='connecting'?'Connecting':scanner.error?'Degraded':'Sampled';
  ui['sidebar-dot'].classList.toggle('on',state==='Sampled');
  ui['sidebar-status'].textContent=state==='Sampled'?'Scanning confirmed blocks':state;
  ui['metric-connection'].textContent=state;
  ui['metric-subscriptions'].textContent=`${scanner.blocks} complete blocks read`;
  ui['metric-trades'].textContent=scanner.trades.toLocaleString();
  ui['metric-candidates'].textContent=scanner.candidates.length.toLocaleString();
  ui['metric-dropped'].textContent=scanner.dropped.toLocaleString();
  ui['metric-last'].textContent=`Last swap: ${clock(scanner.lastTrade)}`;
  ui['stream-label'].textContent=state.toUpperCase();
  ui['stream-chip'].classList.toggle('degraded',true);
  ui['scanner-error'].textContent=scanner.error?`${scanner.error}. Retrying automatically${scanner.error.includes('429')?' after a 30-second cooldown':''}.`:`Real mainnet · last poll ${clock(scanner.lastPoll)}. One complete recent block per 15-second cycle; coverage is sampled. ${scanner.dropped} skipped blocks or signature-window gaps. Scans while this page is open.`;
  renderCandidates();
}
function options(){
  const mint=ui['watch-mint'].value.trim(),maxSlots=Number(ui['max-slots'].value);
  if(mint&&!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))throw new Error('Enter a valid base58 mint address.');
  if(!Number.isInteger(maxSlots)||maxSlots<2||maxSlots>16)throw new Error('Choose 2–16 slots.');
  return{mint,maxSlots};
}
function restart(){
  try{const chosen=options();scanner?.stop();scanner=new BrowserScanner(chosen);ui['setting-feedback'].textContent='Scanner restarted. Session counts reset.';render();}
  catch(error){ui['setting-feedback'].textContent=error.message;}
}
ui['save-settings'].addEventListener('click',restart);
window.addEventListener('beforeunload',()=>scanner?.stop());
restart();
