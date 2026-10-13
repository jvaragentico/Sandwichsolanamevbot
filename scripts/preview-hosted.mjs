import http from 'node:http';
import worker from '../dist/server/index.js';

const port = Number(process.env.PORT ?? 3101);
http.createServer(async (request,response) => {
  try {
    // Local-only fault injection to verify browser fallback against real public RPC data.
    if (process.env.PREVIEW_RPC_STATUS === '429' && request.url.startsWith('/api/')) {
      response.writeHead(429,{'content-type':'application/json'});
      response.end(JSON.stringify({error:'Preview simulated upstream throttling'}));
      return;
    }
    const result = await worker.fetch(new Request(`http://127.0.0.1:${port}${request.url}`,{method:request.method}),{});
    response.writeHead(result.status,Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.writeHead(500,{'content-type':'text/plain'});
    response.end(error.message);
  }
}).listen(port,'127.0.0.1',()=>console.log(`Hosted preview: http://127.0.0.1:${port}`));
