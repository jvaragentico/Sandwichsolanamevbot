import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptCosts,summarizeCosts} from '../hosted/costs.js';
import {liquidationModel} from '../hosted/liquidation.js';
test('receipt amounts preserve missing data and fee payer versus trader',()=>{
  const receipt={transaction:{message:{accountKeys:[{pubkey:'payer'},{pubkey:'trader'}]}},meta:{fee:5000,preBalances:[10000,100000],postBalances:[5000,70000]}};
  assert.deepEqual(receiptCosts(receipt,'trader'),{feeLamports:'5000',feePayer:'payer',walletSolChangeLamports:'-30000'});
  assert.equal(receiptCosts(receipt,'missing').walletSolChangeLamports,null);
  receipt.meta.preBalances[1]=Number.MAX_SAFE_INTEGER+1;assert.equal(receiptCosts(receipt,'trader').walletSolChangeLamports,null);
  delete receipt.meta.fee;assert.equal(receiptCosts(receipt,'payer').feeLamports,null);
});
test('fee totals deduplicate signatures and never infer realized profit',()=>{
  const total=summarizeCosts([{signature:'a',feeLamports:'5000'},{signature:'a',feeLamports:'5000'},{signature:'b',feeLamports:null}]);
  assert.deepEqual(total,{count:2,knownFees:1,feesLamports:'5000',complete:false,realizedPnl:null});
  assert.equal(summarizeCosts([{signature:'a',feeLamports:'0'}]).knownFees,1);
});
const assumptions={collateral:1000,debt:900,threshold:80,repay:100,closeFactor:50,bonus:5,drop:1,costs:1,solPrice:100};
test('liquidation model subtracts capital, adverse price movement and costs',()=>{
  const r=liquidationModel(assumptions);assert.equal(r.eligible,true);assert.equal(r.capitalUsd,101);assert.equal(r.capitalSolEquivalent,1.01);
  assert.ok(Math.abs(r.estimatedPnlUsd-2.95)<1e-9);
  assert.ok(liquidationModel({...assumptions,drop:10}).estimatedPnlUsd<0);
  assert.equal(liquidationModel({...assumptions,debt:700}).estimatedPnlUsd,null);
  assert.equal(liquidationModel({...assumptions,repay:451}).withinLimit,false);
  for(const bad of [{solPrice:0},{costs:-1},{bonus:Infinity},{debt:''},{drop:101}])assert.throws(()=>liquidationModel({...assumptions,...bad}));
});
