import assert from 'node:assert/strict';
import { PROGRAMS, extractBlockTrades } from '../hosted/analyzer.js';

// A minimal DOM harness exercises the actual scanner and rendered links with controlled RPC data.
class Element {
  constructor(){this.children=[];this.value='';this.textContent='';this.classList={toggle(){}};this.handlers={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(name,handler){this.handlers[name]=handler;}
}
const nodes=new Map();
globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(){return new Element();}};
globalThis.window={addEventListener(){}};
document.getElementById('max-slots').value='8';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode(bytes){let n=bytes.reduce((v,b)=>v*256n+BigInt(b),0n),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}return s;}
const signature=n=>String(n).repeat(88),mint='M'.repeat(44),pool='P'.repeat(44);
function tx(owner,buy,n){
  const accounts=['x','x',mint,pool,'x','x',owner];
  const balance=amount=>({owner,mint,accountIndex:1,uiTokenAmount:{amount:String(amount),decimals:6}});
  return {transaction:{signatures:[signature(n)],message:{accountKeys:[{pubkey:owner,signer:true}],instructions:[
    {programId:PROGRAMS.Pump,accounts,data:encode(buy?[102,6,61,18,1,218,235,234]:[51,230,133,164,1,127,131,173])}]}},
    meta:{err:null,preTokenBalances:[balance(buy?0:100)],postTokenBalances:[balance(buy?100:0)]}};
}
const block={blockTime:1000,transactions:[tx('A'.repeat(44),true,2),tx('B'.repeat(44),true,3),tx('A'.repeat(44),false,4)]};
assert.equal(extractBlockTrades(block,100).length,3);
let fail=false;
globalThis.fetch=async path=>fail?Response.json({error:'Mainnet RPC HTTP 429'},{status:429}):
  Response.json({result:path.startsWith('/api/signatures')?[{signature:signature(4),slot:100,err:null}]:block});
const originalTimer=globalThis.setTimeout;
globalThis.setTimeout=(callback,ms)=>{if(ms<1000)queueMicrotask(callback);return 0;};
await import('../hosted/app.js');
async function settle(){for(let i=0;i<100;i++)await Promise.resolve();}
await settle();
assert.equal(nodes.get('metric-candidates').textContent,'1');
assert.equal(nodes.get('metric-trades').textContent,'3');
assert.equal(nodes.get('metric-connection').textContent,'Sampled');
const descendants=node=>[node,...(node.children??[]).filter(child=>typeof child==='object').flatMap(descendants)];
const links=descendants(nodes.get('candidate-list')).filter(node=>node.href?.includes('/tx/'));
assert.deepEqual(links.map(node=>node.href),[2,3,4].map(n=>`https://solscan.io/tx/${signature(n)}`));
assert.ok(links.every(node=>node.rel==='noopener noreferrer'));
nodes.get('max-slots').value='30';nodes.get('save-settings').handlers.click();
assert.equal(nodes.get('setting-feedback').textContent,'Choose 2–16 slots.');
nodes.get('max-slots').value='8';fail=true;nodes.get('save-settings').handlers.click();await settle();
assert.equal(nodes.get('metric-connection').textContent,'Degraded');
assert.match(nodes.get('scanner-error').textContent,/429/);
assert.equal(nodes.get('metric-candidates').textContent,'0');
globalThis.setTimeout=originalTimer;
console.log('Scanner → decoder → detector → transaction links, settings and RPC error flow passed (synthetic fixtures).');
