import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PumpScanner } from './scanner.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3000);
const httpUrl = process.env.SOLANA_RPC_HTTP ?? 'https://api.mainnet-beta.solana.com';
const wsUrl = process.env.SOLANA_RPC_WS ?? httpUrl.replace(/^http/, 'ws');
const scanner = new PumpScanner({
  httpUrl,
  wsUrl,
  maxRpcPerSecond: Number(process.env.SOLANA_MAX_RPC_PER_SECOND ?? 5),
});
const clients = new Set();

const assets = new Map([
  ['/', { path: 'public/index.html', type: 'text/html; charset=utf-8' }],
  ['/app.js', { path: 'public/app.js', type: 'text/javascript; charset=utf-8' }],
  ['/style.css', { path: 'public/style.css', type: 'text/css; charset=utf-8' }],
]);

function json(response, code, value) {
  response.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function broadcast(state) {
  const message = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) {
    try { client.write(message); } catch { clients.delete(client); }
  }
}
scanner.on('change', broadcast);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/api/state') {
    return json(response, 200, scanner.snapshot());
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return json(response, 200, {
      ok: scanner.state.connection === 'live' && scanner.subscriptions.size === 2 && !scanner.state.error && scanner.state.dropped === 0,
      connection: scanner.state.connection,
      subscriptions: scanner.subscriptions.size,
      lastMessageAt: scanner.state.lastMessageAt,
      error: scanner.state.error,
      dropped: scanner.state.dropped,
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/stream') {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    response.write(`data: ${JSON.stringify(scanner.snapshot())}\n\n`);
    clients.add(response);
    request.on('close', () => clients.delete(response));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/config') {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024) return json(response, 413, { error: 'Request too large' });
    }
    try {
      const { maxSlots } = JSON.parse(body);
      scanner.detector.setWindow(maxSlots);
      scanner.changed();
      return json(response, 200, { maxSlots });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }
  const asset = assets.get(url.pathname);
  if (request.method === 'GET' && asset) {
    try {
      const content = await readFile(resolve(root, asset.path));
      response.writeHead(200, {
        'content-type': asset.type,
        'cache-control': 'no-cache',
        'content-security-policy': "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; object-src 'none'",
      });
      return response.end(content);
    } catch {
      return json(response, 500, { error: 'Asset unavailable' });
    }
  }
  return json(response, 404, { error: 'Not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Pump Flow Observer: http://127.0.0.1:${port}`);
  scanner.start();
});

const heartbeat = setInterval(() => {
  for (const client of clients) {
    try { client.write(': heartbeat\n\n'); } catch { clients.delete(client); }
  }
}, 15000);

function shutdown() {
  clearInterval(heartbeat);
  scanner.stop();
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

