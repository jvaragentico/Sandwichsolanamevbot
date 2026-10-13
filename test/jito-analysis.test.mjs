import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeJitoCsv,parseCsv} from '../hosted/jito-analysis.js';
const mint='So11111111111111111111111111111111111111112';
const header='timestamp,landed,accepted,rejected,expectedProfit,sourceMint,tipLamports,txn2Signature,errorType,errorContent';
const row=(overrides={})=>{
  const value={timestamp:'1700000000000',landed:'true',accepted:'1',rejected:'false',expectedProfit:'10000000',sourceMint:mint,tipLamports:'1000',txn2Signature:'synthetic',errorType:'',errorContent:'',...overrides};
  return header.split(',').map(key=>value[key]).join(',');
};
test('imports upstream log fields without equating accepted, landed and profitable',()=>{
  const result=analyzeJitoCsv([header,row(),header,row({landed:'false',accepted:'2',rejected:'true',expectedProfit:'9007199254740993',tipLamports:'2000',errorType:'simulationFailure'})].join('\r\n'));
  assert.equal(result.records,2);assert.equal(result.repeatedHeaders,1);
  assert.equal(result.reportedAccepted,2);assert.equal(result.reportedLanded,1);assert.equal(result.reportedRejected,1);
  assert.equal(result.reportedLandedTipsLamports,'1000');
  assert.equal(result.expectedByMint[0].expectedRaw,'9007199264740993');
  assert.equal(result.realizedProfit,null);assert.equal(result.liveProfitability,'UNPROVEN');
});
test('keeps source-token units separate and supports quoted multiline fields',()=>{
  const second=row({sourceMint:'M'.repeat(44),errorContent:'"RPC, failure\nwith ""quotes"""'});
  const result=analyzeJitoCsv([header,row(),second].join('\n'));
  assert.equal(result.expectedByMint.length,2);
  assert.deepEqual(parseCsv('a,b\n"x,y","z""q"'),[['a','b'],['x,y','z"q']]);
});
test('rejects malformed, ambiguous or missing records',()=>{
  for(const csv of ['',header,header+'\n'+row({landed:'yes'}),header+'\n'+row({tipLamports:'-1'}),header+'\n'+row({accepted:'1.5'}),header+'\n'+row({sourceMint:'invalid'}),header+'\nwrong'])assert.throws(()=>analyzeJitoCsv(csv));
  assert.throws(()=>parseCsv('a\n"unclosed'));assert.throws(()=>parseCsv('a\n"a"b'));
});
