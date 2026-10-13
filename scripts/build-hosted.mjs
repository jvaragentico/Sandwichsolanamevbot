import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const assets = {};
for (const [route,file,type] of [
  ['/','index.html','text/html; charset=utf-8'],
  ['/style.css','style.css','text/css; charset=utf-8'],
  ['/app.js','app.js','text/javascript; charset=utf-8'],
  ['/analyzer.js','analyzer.js','text/javascript; charset=utf-8'],
  ['/layouts.js','layouts.js','text/javascript; charset=utf-8'],
]) {
  assets[route] = { body: await readFile(resolve(root,'hosted',file),'utf8'), type };
}
const worker = await readFile(resolve(root,'hosted/worker.js'),'utf8');
const manifest = await readFile(resolve(root,'.openai/hosting.json'),'utf8');
for (const file of ['index.html','style.css','app.js','analyzer.js']) {
  await rm(resolve(root,'dist',file),{force:true});
}
await mkdir(resolve(root,'dist/server'),{recursive:true});
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await writeFile(resolve(root,'dist/server/index.js'),`const ASSETS = ${JSON.stringify(assets)};\n${worker}`);
await writeFile(resolve(root,'dist/.openai/hosting.json'),manifest);
console.log('Built Sites Worker artifact');
