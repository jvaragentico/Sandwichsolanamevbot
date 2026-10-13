import { PROGRAMS, extractBlockTrades, SandwichDetector } from './analyzer.js';
import { LAYOUTS } from './layouts.js';

export const SCENARIOS = Object.freeze({
  cross: 'Cross-slot sequence', same: 'Same-slot sequence',
  missing: 'Missing middle block', pool: 'Different middle pool',
  wallet: 'Different closing wallet', order: 'Reverse trade arrives first on-chain',
});

function encode(bytes) {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number=bytes.reduce((sum,byte)=>sum*256n+BigInt(byte),0n),encoded='';
  while(number){encoded=alphabet[Number(number%58n)]+encoded;number/=58n;}
  return encoded;
}

// Local fixtures pass through the real instruction decoder. Nothing is signed or submitted.
function transaction(venue,side,owner,pool,signature) {
  const layout=LAYOUTS[venue].find(item=>item.name===side);
  const mint='M'.repeat(44),accounts=Array(30).fill('unused');
  accounts[layout.pool]=pool;accounts[layout.mint]=mint;accounts[layout.user]=owner;
  const balance=amount=>({owner,mint,accountIndex:1,uiTokenAmount:{amount:String(amount),decimals:6}});
  return {
    transaction:{signatures:[signature],message:{accountKeys:[{pubkey:owner,signer:true}],
      instructions:[{programId:PROGRAMS[venue],accounts,data:encode(layout.discriminator)}]}},
    meta:{err:null,preTokenBalances:[balance(side==='buy'?0:1000000)],
      postTokenBalances:[balance(side==='buy'?1000000:0)]},
  };
}

export function runSimulation({scenario='cross',venue='PumpSwap',gap=2,maxSlots=8}={}) {
  if(!Object.hasOwn(SCENARIOS,scenario))throw new Error('Choose a listed scenario.');
  if(!Object.hasOwn(PROGRAMS,venue))throw new Error('Choose Pump or PumpSwap.');
  if(!Number.isInteger(gap)||gap<1||gap>12)throw new Error('Slot gap must be an integer from 1 to 12.');
  const detector=new SandwichDetector();detector.setWindow(maxSlots);
  const firstSlot=1000,step=scenario==='same'?0:gap;
  const legs=[
    {role:'First',side:'buy',wallet:'Wallet A',owner:'A'.repeat(44),pool:'P'.repeat(44),slot:firstSlot},
    {role:'Middle',side:'buy',wallet:'Wallet B',owner:'B'.repeat(44),pool:scenario==='pool'?'Q'.repeat(44):'P'.repeat(44),slot:firstSlot+step},
    {role:'Reverse',side:'sell',wallet:scenario==='wallet'?'Wallet C':'Wallet A',owner:(scenario==='wallet'?'C':'A').repeat(44),pool:'P'.repeat(44),slot:firstSlot+2*step},
  ];
  if(scenario==='order'){
    legs[2].slot=firstSlot;legs[0].slot=firstSlot+step;legs[1].slot=firstSlot+2*step;
  }
  const blocks=new Map();
  for(const [index,leg] of legs.entries()) {
    leg.signature=`synthetic-${scenario}-${index+1}`;
    leg.observed=!(scenario==='missing'&&index===1);
    const block=blocks.get(leg.slot)??{blockTime:1700000000+leg.slot,transactions:[]};
    leg.transactionIndex=block.transactions.length;
    block.transactions.push(transaction(venue,leg.side,leg.owner,leg.pool,leg.signature));
    blocks.set(leg.slot,block);
  }
  const trades=[],matches=[];
  for(const [slot,block] of [...blocks].sort((a,b)=>a[0]-b[0])) {
    if(scenario==='missing'&&slot===legs[1].slot)continue;
    for(const trade of extractBlockTrades(block,slot)){trades.push(trade);matches.push(...detector.add(trade));}
  }
  const complete=scenario!=='missing';
  let explanation;
  if(!complete)explanation='The middle block is missing. No match is not evidence that no sandwich occurred.';
  else if(matches.length)explanation='The detector matched three ordered trades in one pool, with Wallet A on both outer legs.';
  else if(scenario==='pool')explanation='The middle trade uses another pool, so it does not complete this pattern.';
  else if(scenario==='wallet')explanation='The reverse trade uses another wallet. This detector does not infer common control of different wallets.';
  else if(scenario==='order')explanation='The reverse trade precedes the opening trade on-chain; the required sequence is absent.';
  else explanation='The sequence spans more slots than the configured detection window.';
  return {schemaVersion:1,source:'synthetic-local',network:'none',scenario,venue,gap,maxSlots,
    coverage:complete?'Complete fixture':'Missing middle block',
    status:!complete?'Inconclusive':matches.length?'Pattern detected':'No pattern',
    explanation,legs:legs.sort((a,b)=>a.slot-b.slot||a.transactionIndex-b.transactionIndex),trades,matches};
}

export function toLamports(value) {
  const text=String(value).trim();
  if(!/^\d{1,9}(\.\d{1,9})?$/.test(text))throw new Error('Use a non-negative SOL amount with up to 9 decimal places.');
  const [whole,fraction='']=text.split('.');
  return BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));
}
export function formatSol(value) {
  const n=BigInt(value),absolute=n<0n?-n:n;
  const fraction=(absolute%1000000000n).toString().padStart(9,'0').replace(/0+$/,'');
  return `${n<0n?'-':''}${absolute/1000000000n}${fraction?'.'+fraction:''}`;
}

// This is receipt-style accounting for user-supplied assumptions, not a price or fill model.
export function assessProfitability({entry='1',exit='1.01',fees='0.002',tips='0.001',other='0',closed=false,costsComplete=false}={}) {
  const values=Object.fromEntries(Object.entries({entry,exit,fees,tips,other}).map(([key,value])=>[key,toLamports(value)]));
  const net=values.exit-values.entry-values.fees-values.tips-values.other;
  const complete=closed===true&&costsComplete===true;
  return {source:'user-supplied hypothetical amounts',liveProfitability:'UNPROVEN',
    status:!complete?'Incomplete accounting':net>0n?'Hypothetical profit':net<0n?'Hypothetical loss':'Hypothetical break-even',
    netLamports:net.toString(),netSol:formatSol(net),positionClosed:closed===true,costsComplete:costsComplete===true,
    inputs:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,formatSol(value)])),
    formula:'Exit proceeds − entry cost − network fees − tips − other costs',
    limitations:['No measured market prices or execution fills','No evidence of future profitability',
      'Entry and exit amounts must already include DEX fees and realized slippage',
      'Remaining inventory is not valued; open positions cannot establish realized profit',
      'A detected pattern does not establish intent or economic profit']};
}
