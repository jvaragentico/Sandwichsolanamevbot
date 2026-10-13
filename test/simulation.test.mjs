import test from 'node:test';
import assert from 'node:assert/strict';
import {runSimulation,assessProfitability,toLamports,formatSol} from '../hosted/simulation.js';

test('same decoder detects controlled cross-slot and same-slot examples for both venues',()=>{
  for(const venue of ['Pump','PumpSwap'])for(const scenario of ['cross','same']){
    const result=runSimulation({venue,scenario});
    assert.equal(result.matches.length,1);assert.equal(result.trades.length,3);
    assert.equal(result.source,'synthetic-local');assert.equal(result.network,'none');
    assert.equal(result.matches[0].slots,scenario==='same'?0:4);
    assert.ok(result.matches[0].front.signature.startsWith('synthetic-'));
  }
});
test('missing middle block is inconclusive, rather than evidence of no sandwich',()=>{
  const result=runSimulation({scenario:'missing'});
  assert.equal(result.status,'Inconclusive');assert.equal(result.trades.length,2);
  assert.equal(result.matches.length,0);assert.equal(result.legs.filter(x=>!x.observed).length,1);
});
test('pool, wallet, order and detection window prevent invalid matches',()=>{
  for(const scenario of ['pool','wallet','order'])assert.equal(runSimulation({scenario}).matches.length,0);
  assert.equal(runSimulation({gap:4,maxSlots:8}).matches.length,1);
  assert.equal(runSimulation({gap:5,maxSlots:8}).matches.length,0);
  assert.throws(()=>runSimulation({gap:0}));assert.throws(()=>runSimulation({gap:1.5}));
  assert.throws(()=>runSimulation({scenario:'bad'}));assert.throws(()=>runSimulation({maxSlots:17}));
});
test('accounting subtracts costs exactly and reports gains and losses without claiming live proof',()=>{
  const settings={entry:'1',exit:'1.01',fees:'0.002',tips:'0.001',other:'0.003',closed:true,costsComplete:true};
  const gain=assessProfitability(settings);
  assert.equal(gain.netSol,'0.004');assert.equal(gain.status,'Hypothetical profit');
  assert.equal(gain.liveProfitability,'UNPROVEN');
  assert.equal(assessProfitability({...settings,exit:'0.99'}).netSol,'-0.016');
  assert.equal(assessProfitability({...settings,exit:'0.99'}).status,'Hypothetical loss');
  assert.equal(assessProfitability({...settings,exit:'1.006'}).status,'Hypothetical break-even');
  assert.equal(assessProfitability({...settings,closed:false}).status,'Incomplete accounting');
  assert.equal(assessProfitability({...settings,costsComplete:false}).status,'Incomplete accounting');
  assert.doesNotThrow(()=>JSON.stringify({simulation:runSimulation(),accounting:gain}));
});
test('lamport precision and invalid accounting input',()=>{
  assert.equal(toLamports('0.000000001'),1n);assert.equal(formatSol(-1n),'-0.000000001');
  for(const value of ['-1','NaN','Infinity','1e-3','0.0000000001','1,000',''])assert.throws(()=>toLamports(value));
});
