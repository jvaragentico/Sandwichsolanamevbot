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
console.log('Worker artifact and routes validated');

