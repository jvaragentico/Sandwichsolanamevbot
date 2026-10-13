import { PROGRAMS, sideFromLogs, extractTrades, SandwichDetector } from './analyzer.js';

const names = ['sidebar-dot','sidebar-status','metric-connection','metric-subscriptions','metric-trades','metric-candidates','metric-dropped','metric-last','stream-chip','stream-label','candidate-list','scanner-error','watch-mint','max-slots','save-settings','setting-feedback'];
const ui = Object.fromEntries(names.map(id => [id, document.getElementById(id)]));
const compact = value => value ? `${value.slice(0,6)}…${value.slice(-5)}` : '—';
const clock = value => value ? new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(value) : '—';
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
function el(tag,className,value){const node=document.createElement(tag);if(className)node.className=className;if(value!=null)node.textContent=value;return node;}
function link(signature){const a=el('a','',compact(signature));a.href=`https://solscan.io/tx/${encodeURIComponent(signature)}`;a.target='_blank';a.rel='noopener noreferrer';return a;}

let scanner;
class BrowserScanner {
  constructor(options){
    this.options=options;this.detector=new SandwichDetector(options.maxSlots);
    this.status='connecting';this.error=null;this.trades=0;this.candidates=[];this.dropped=0;this.lastTrade=null;
    this.queue=[];this.active=0;this.goodSources=new Set();this.lastSignature=new Map();this.seen=new Set();
    this.running=true;this.nextRequestAt=0;this.cooldownUntil=0;this.poll();
  }
  stop(){this.running=false;clearTimeout(this.timer);}
  async getJson(path){
    const response=await fetch(path,{signal:AbortSignal.timeout(12000),cache:'no-store'});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error??`HTTP ${response.status}`);
    return payload.result;
  }
  async poll(){
    if(!this.running)return;
    const sources=this.options.mint?[this.options.mint]:Object.values(PROGRAMS);
    for(const address of sources){
      try{
        const entries=await this.getJson(`/api/signatures?address=${encodeURIComponent(address)}`);
        if(!this.running)return;
        this.goodSources.add(address);
        const cursor=this.lastSignature.get(address);
        const index=cursor?entries.findIndex(item=>item.signature===cursor):-1;
        if(cursor&&index===-1&&entries.length===40)this.dropped++;
        const fresh=(cursor&&index>=0?entries.slice(0,index):entries).reverse();
        const selected=fresh.slice(-8);
        this.dropped+=fresh.length-selected.length;
        if(entries[0])this.lastSignature.set(address,entries[0].signature);
        for(const entry of selected){
          if(entry.err||this.seen.has(entry.signature))continue;
          this.seen.add(entry.signature);
          if(this.queue.length>=200){this.dropped++;continue;}
          this.queue.push(entry.signature);
        }
        if(this.seen.size>10000)this.seen=new Set([...this.seen].slice(-5000));
        this.status='live';this.error=null;this.drain();render();
      }catch(error){this.error=error.message;this.status='degraded';render();}
    }
    if(this.running)this.timer=setTimeout(()=>this.poll(),5000);
  }
  drain(){
    while(this.running&&this.active<3&&this.queue.length){
      this.active++;
      this.process(this.queue.shift()).finally(()=>{this.active--;this.drain();});
    }
  }
  async process(signature){
    try{
      const now=Date.now(),when=Math.max(now,this.nextRequestAt,this.cooldownUntil);
      this.nextRequestAt=when+250;if(when>now)await sleep(when-now);
      const tx=await this.getJson(`/api/transaction?signature=${encodeURIComponent(signature)}`);
      if(!tx||!this.running||tx.meta?.err)return;
      const logs=tx.meta?.logMessages??[],side=sideFromLogs(logs);
      if(!side)return;
      const venue=logs.some(line=>line.includes(`Program ${PROGRAMS.PumpSwap} invoke`))?'PumpSwap':
        logs.some(line=>line.includes(`Program ${PROGRAMS.Pump} invoke`))?'Pump':null;
      if(!venue)return;
      for(const trade of extractTrades(tx,venue,side)){
        this.trades++;this.lastTrade=Date.now();
        for(const candidate of this.detector.add(trade))this.candidates.unshift(candidate);
      }
      this.candidates.length=Math.min(this.candidates.length,100);
      this.error=null;render();
    }catch(error){if(String(error.message).includes('429'))this.cooldownUntil=Date.now()+5000;this.error=error.message;render();}
  }
}

function renderCandidates(){
  ui['candidate-list'].replaceChildren();
  if(!scanner?.candidates.length){
    ui['candidate-list'].append(el('div','empty-card',scanner?.status==='live'?'No matching three-trade sequences in this session yet.':'Connecting to mainnet…'));
    return;
  }
  for(const match of scanner.candidates.slice(0,30)){
    const card=el('div','candidate'),heading=el('div','candidate-heading');
    heading.append(el('strong','',compact(match.mint)),el('span','',`${match.slots} slots`));
    const meta=el('div','candidate-meta',`${match.venue} · ${match.direction.toUpperCase()} sequence · ${clock(match.time)}`);
    const wallet=el('div','candidate-wallet',`Matching wallet: ${compact(match.front.owner)}`);
    const sequence=el('div','sequence');
    for(const [label,leg] of [['FRONT',match.front],['MIDDLE',match.middle],['BACK',match.back]]){
      const cell=el('div');cell.append(el('small','',`${label} · slot ${leg.slot}`),link(leg.signature));sequence.append(cell);
    }
    card.append(heading,meta,wallet,sequence);ui['candidate-list'].append(card);
  }
}
function render(){
  if(!scanner)return;
  const expected=scanner.options.mint?1:2;
  const healthy=scanner.status==='live'&&scanner.goodSources.size===expected&&!scanner.error&&scanner.dropped===0&&Boolean(scanner.options.mint);
  const state=healthy?'Live':scanner.error?'Degraded':scanner.status==='live'&&scanner.goodSources.size===expected?'Sampled':scanner.status;
  ui['sidebar-dot'].classList.toggle('on',healthy);
  ui['sidebar-status'].textContent=healthy?'Scanning confirmed chain':state;
  ui['metric-connection'].textContent=state;
  ui['metric-subscriptions'].textContent=`${scanner.goodSources.size} / ${expected} sources polled`;
  ui['metric-trades'].textContent=scanner.trades.toLocaleString();
  ui['metric-candidates'].textContent=scanner.candidates.length.toLocaleString();
  ui['metric-dropped'].textContent=scanner.dropped.toLocaleString();
  ui['metric-last'].textContent=`Last swap: ${clock(scanner.lastTrade)}`;
  ui['stream-label'].textContent=state.toUpperCase();
  ui['stream-chip'].classList.toggle('degraded',!healthy);
  ui['scanner-error'].textContent=scanner.error??(scanner.dropped?`${scanner.dropped} signatures skipped or missed. Public RPC only supports a sample; watch one mint for better coverage.`:'Polling real Solana mainnet transactions.');
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

