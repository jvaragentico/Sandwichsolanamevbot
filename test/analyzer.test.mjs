import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS, extractTrades, extractBlockTrades, sideFromLogs, SandwichDetector } from '../src/analyzer.mjs';
import { LAYOUTS } from '../hosted/layouts.js';

const wallet = 'Wallet1111111111111111111111111111111111111';
const mint = 'Mint111111111111111111111111111111111111111';
const balance = (amount) => ({ accountIndex: 1, mint, owner: wallet, uiTokenAmount: { amount: String(amount), decimals: 6 } });

test('extracts a signed Pump buy from token balance changes', () => {
  const tx = {
    slot: 100, blockTime: 1000,
    transaction: { signatures: ['Signature1'], message: { accountKeys: [{ pubkey: wallet, signer: true }] } },
    meta: { err: null, logMessages: ['Program log: Instruction: Buy'], preTokenBalances: [balance(0)], postTokenBalances: [balance(1000000)] },
  };
  assert.deepEqual(extractTrades(tx, 'Pump').map(({ side, owner, tokenAmount, slot }) => ({ side, owner, tokenAmount, slot })),
    [{ side: 'buy', owner: wallet, tokenAmount: '1000000', slot: 100 }]);
});

test('rejects ambiguous instruction logs and unrelated token movement', () => {
  assert.equal(sideFromLogs(['Instruction: Buy', 'Instruction: Sell']), null);
  const tx = {
    slot: 100, transaction: { signatures: ['Signature2'], message: { accountKeys: [{ pubkey: wallet, signer: false }] } },
    meta: { err: null, preTokenBalances: [balance(0)], postTokenBalances: [balance(1)] },
  };
  assert.deepEqual(extractTrades(tx, 'Pump', 'buy'), []);
});

const trade = (signature, slot, owner, side) => ({ signature, slot, owner, side, mint, venue: 'Pump', time: slot * 1000 });

test('identifies an ordered cross-slot pattern even if details arrive out of order', () => {
  const detector = new SandwichDetector(8);
  assert.deepEqual(detector.add(trade('back', 105, 'attacker', 'sell')), []);
  assert.deepEqual(detector.add(trade('front', 100, 'attacker', 'buy')), []);
  const found = detector.add(trade('middle', 102, 'other', 'buy'));
  assert.equal(found.length, 1);
  assert.equal(found[0].front.signature, 'front');
  assert.equal(found[0].middle.signature, 'middle');
  assert.equal(found[0].back.signature, 'back');
});

test('does not report sequences outside window', () => {
  const detector = new SandwichDetector(4);
  detector.add(trade('front', 100, 'attacker', 'buy'));
  detector.add(trade('middle', 102, 'other', 'buy'));
  assert.deepEqual(detector.add(trade('back', 106, 'attacker', 'sell')), []);
});

test('same-slot detection uses block positions, accepts out-of-order input and deduplicates', () => {
  const detector = new SandwichDetector();
  const events = [trade('first',100,'A','buy'),trade('other',100,'B','buy'),trade('reverse',100,'A','sell')]
    .map((item, transactionIndex)=>({...item,pool:'pool',transactionIndex}));
  assert.deepEqual(detector.add(events[2]),[]);
  assert.deepEqual(detector.add(events[0]),[]);
  const result=detector.add(events[1]);
  assert.equal(result.length,1);
  assert.equal(result[0].slots,0);
  assert.equal(result[0].middle.transactionIndex,1);
  assert.deepEqual(detector.add(events[1]),[]);
});

test('rejects unknown same-slot order, different pools, same wallet middle and reversed order', () => {
  for(const mode of ['unknown','pool','wallet','order']){
    const detector=new SandwichDetector();
    const events=[trade('first',100,'A','buy'),trade('other',100,'B','buy'),trade('reverse',100,'A','sell')]
      .map((item,transactionIndex)=>({...item,pool:'pool',transactionIndex}));
    if(mode==='unknown')events.forEach(item=>delete item.transactionIndex);
    if(mode==='pool')events[1].pool='different';
    if(mode==='wallet')events[1].owner='A';
    if(mode==='order')events[1].transactionIndex=4;
    assert.deepEqual(events.flatMap(item=>detector.add(item)),[],mode);
  }
});

function encode(bytes){
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=bytes.reduce((value,byte)=>value*256n+BigInt(byte),0n),result='';
  while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}
  return result;
}

function swapTransaction(venue,layout,owner,signature,amount=100){
  const accounts=Array(30).fill('unused');
  accounts[layout.pool]='shared-pool';accounts[layout.mint]=mint;accounts[layout.user]=owner;
  const buy=layout.name.startsWith('buy');
  const tokenBalance=value=>({...balance(value),owner});
  return {
    transaction:{signatures:[signature],message:{accountKeys:[{pubkey:owner,signer:true}],instructions:[
      {programId:PROGRAMS[venue],accounts,data:encode(layout.discriminator)}]}},
    meta:{err:null,preTokenBalances:[tokenBalance(buy?0:amount)],postTokenBalances:[tokenBalance(buy?amount:0)]},
  };
}

test('decodes every supported Pump and PumpSwap layout with pool, owner, mint and balance direction',()=>{
  for(const [venue,layouts] of Object.entries(LAYOUTS))for(const layout of layouts){
    const tx=swapTransaction(venue,layout,wallet,layout.name);
    const result=extractBlockTrades({blockTime:1000,transactions:[tx]},100);
    assert.equal(result.length,1,`${venue}/${layout.name}`);
    assert.equal(result[0].pool,'shared-pool');
    assert.equal(result[0].tokenAmount,'100');
    assert.equal(result[0].transactionIndex,0);
  }
});

test('full block extraction feeds a same-pool suspected sandwich; failed and multi-swap transactions are excluded',()=>{
  const buy=LAYOUTS.Pump.find(i=>i.name==='buy'),sell=LAYOUTS.Pump.find(i=>i.name==='sell');
  const transactions=[swapTransaction('Pump',buy,'A','first'),swapTransaction('Pump',buy,'B','middle'),swapTransaction('Pump',sell,'A','reverse')];
  const trades=extractBlockTrades({blockTime:1000,transactions},100);
  const detector=new SandwichDetector();
  assert.equal(trades.flatMap(item=>detector.add(item)).length,1);
  transactions[0].meta.err={InstructionError:[0,'failure']};
  transactions[1].meta.innerInstructions=[{instructions:transactions[1].transaction.message.instructions}];
  assert.equal(extractBlockTrades({transactions},100).length,1);
});
