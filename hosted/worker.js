const DEFAULT_RPC = 'https://solana-rpc.publicnode.com';
const jsonHeaders = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' };
const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
// Cache public chain data briefly within an isolate; never cache RPC errors.
const rpcCache = new Map();

function response(status, data) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function solanaRpc(env, method, params) {
  const endpoint = env.SOLANA_RPC_HTTP || DEFAULT_RPC;
  const key = JSON.stringify([endpoint,method,params]);
  const cached = rpcCache.get(key);
  if (cached && cached.until > Date.now()) return response(200,{result:cached.result});
  const upstream = await fetch(env.SOLANA_RPC_HTTP || DEFAULT_RPC, {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
    signal:AbortSignal.timeout(10000),
  });
  if (!upstream.ok) return response([403,429].includes(upstream.status) ? upstream.status : 502, {error:`Mainnet RPC HTTP ${upstream.status}`});
  const payload = await upstream.json();
  if (payload.error) return response(502, {error:`Mainnet RPC ${payload.error.code}: ${payload.error.message}`});
  // Full block responses can be large: cache only small responses, with a strict entry cap.
  if (payload.result && JSON.stringify(payload.result).length < 500000) {
    if(rpcCache.size >= 12)rpcCache.delete(rpcCache.keys().next().value);
    rpcCache.set(key,{result:payload.result,until:Date.now()+5000});
  }
  return response(200, {result:payload.result});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return response(405,{error:'Method not allowed'});
    if (url.pathname === '/api/signatures') {
      const address = url.searchParams.get('address') || '';
      if (!addressPattern.test(address)) return response(400,{error:'Invalid address'});
      try { return await solanaRpc(env,'getSignaturesForAddress',[address,{limit:40,commitment:'confirmed'}]); }
      catch (error) { return response(502,{error:`Mainnet RPC unavailable: ${error.message}`}); }
    }
    if (url.pathname === '/api/transaction') {
      const signature = url.searchParams.get('signature') || '';
      if (!signaturePattern.test(signature)) return response(400,{error:'Invalid signature'});
      try { return await solanaRpc(env,'getTransaction',[signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:1}]); }
      catch (error) { return response(502,{error:`Mainnet RPC unavailable: ${error.message}`}); }
    }
    if (url.pathname === '/api/block') {
      const rawSlot = url.searchParams.get('slot') || '';
      const slot = Number(rawSlot);
      if (!/^\d+$/.test(rawSlot) || !Number.isSafeInteger(slot) || slot < 0) return response(400,{error:'Invalid slot'});
      try { return await solanaRpc(env,'getBlock',[slot,{encoding:'jsonParsed',commitment:'confirmed',transactionDetails:'full',rewards:false,maxSupportedTransactionVersion:1}]); }
      catch (error) { return response(502,{error:`Mainnet RPC unavailable: ${error.message}`}); }
    }
    const asset = ASSETS[url.pathname];
    if (!asset) return response(404,{error:'Not found'});
    return new Response(asset.body, {
      headers:{
        'content-type':asset.type,
        'cache-control':'no-cache',
        'content-security-policy':"default-src 'self'; connect-src 'self' https://solana-rpc.publicnode.com; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'",
      },
    });
  },
};


