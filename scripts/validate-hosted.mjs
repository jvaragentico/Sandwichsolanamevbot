import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname,'..');
const source = await readFile(resolve(root,'dist/server/index.js'),'utf8');
const manifest = JSON.parse(await readFile(resolve(root,'dist/.openai/hosting.json'),'utf8'));
assert.equal(typeof manifest.project_id,'string');
const worker = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.equal(typeof worker.default.fetch,'function');
const home = await worker.default.fetch(new Request('https://example.test/'),{});
assert.equal(home.status,200);
assert.match(await home.text(),/Observed sandwich patterns/);
const rejected = await worker.default.fetch(new Request('https://example.test/api/signatures?address=bad'),{});
assert.equal(rejected.status,400);
const invalidSlot=await worker.default.fetch(new Request('https://example.test/api/block?slot=-1'),{});
assert.equal(invalidSlot.status,400);
const originalFetch=globalThis.fetch;
try {
  globalThis.fetch=async (url,options)=>{
    const body=JSON.parse(options.body);
    assert.equal(url,'https://solana-rpc.publicnode.com');
    assert.equal(body.method,'getBlock');
    assert.equal(body.params[0],100);
    assert.equal(body.params[1].encoding,'jsonParsed');
    assert.equal(body.params[1].transactionDetails,'full');
    return Response.json({result:{transactions:[],blockTime:1000}});
  };
  const block=await worker.default.fetch(new Request('https://example.test/api/block?slot=100'),{});
  assert.equal(block.status,200);
  assert.deepEqual((await block.json()).result.transactions,[]);
  globalThis.fetch=async()=>new Response('',{status:429});
  const limited=await worker.default.fetch(new Request('https://example.test/api/block?slot=101'),{});
  assert.equal(limited.status,429);
} finally { globalThis.fetch=originalFetch; }
console.log('Worker artifact and routes validated');

