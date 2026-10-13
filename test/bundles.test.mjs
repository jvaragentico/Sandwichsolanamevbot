import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBundle,summarizeBundle} from '../hosted/bundles.js';
test('bundle rule model enforces atomic single-slot limits',()=>{
  assert.equal(simulateBundle({slots:[1,1,1]}).committed,3);
  assert.equal(simulateBundle({slots:[1,1,1],failAt:2}).committed,0);
  assert.match(simulateBundle({slots:[1,2,3]}).outcome,/crosses/);
  for(const slots of [[],[1,1,1,1,1,1],[-1],[1.5]])assert.throws(()=>simulateBundle({slots}));
  assert.throws(()=>simulateBundle({slots:[1],failAt:2}));
});
test('bundle status separates unknown, failure, receipt errors and confirmation',()=>{
  const id='a'.repeat(64),sig='2'.repeat(88);
  assert.match(summarizeBundle(null,id,'receipts').status,/Unknown/);
  assert.match(summarizeBundle({value:[{bundle_id:id,status:'Invalid'}]},id,'inflight').status,/Unknown/);
  assert.match(summarizeBundle({value:[{bundle_id:id,status:'Failed'}]},id,'inflight').status,/Failed/);
  const receipt={bundle_id:id,confirmation_status:'finalized',err:{Ok:null},slot:100,transactions:[sig,'javascript:bad']};
  const result=summarizeBundle({value:[receipt]},id,'receipts');
  assert.match(result.status,/finalized/);assert.deepEqual(result.transactions,[sig]);
  assert.match(summarizeBundle({value:[{...receipt,err:{Err:'failed'}}]},id,'receipts').status,/error/);
  assert.throws(()=>summarizeBundle({},id,'receipts'));
});
