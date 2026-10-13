# Pump Flow Observer

A read-only, local dashboard for **confirmed** pump.fun bonding-curve and PumpSwap trades on Solana mainnet. It listens to both program IDs over `logsSubscribe`, fetches transaction details with `getTransaction`, shows signer-owned token balance changes, and flags cross-slot trade sequences that may warrant investigation.

The hosted edition in `hosted/` shows only suspected sandwiches with three Solscan transaction links, a pool link and a wallet link. Its same-origin Sites Worker polls confirmed mainnet signatures, selects one recent block per 15-second cycle, and reads complete blocks with `getBlock` while the page is open. The default RPC is PublicNode's public Solana mainnet endpoint (`https://solana-rpc.publicnode.com`); a private `SOLANA_RPC_HTTP` environment variable can override it. Coverage is sampled, including with a mint filter. The dashboard reports skipped blocks, signature-window gaps and RPC errors. Data and candidates last only for the current browser session.

It does not sign, build, submit, or fund transactions. A pattern candidate is not proof of an attack, a pending-order signal, or an estimate of profitability. Solana RPC provides confirmed transactions rather than a global public mempool.

## Run

Requires Node.js 22 or newer. No package install is needed.

```powershell
Copy-Item .env.example .env
# Optionally set SOLANA_RPC_HTTP and SOLANA_RPC_WS in your shell or .env loader.
npm start
```

Open <http://127.0.0.1:3000>. Environment variables are read from the process environment; Node does not load `.env` automatically. For example:

```powershell
$env:SOLANA_RPC_HTTP = 'https://your-provider.example/rpc'
$env:SOLANA_RPC_WS = 'wss://your-provider.example/ws'
npm start
```

The public RPC endpoints are defaults for a quick connection check. Sustained mainnet monitoring needs an RPC provider with sufficient WebSocket and HTTP capacity. The app binds to loopback only.
`SOLANA_MAX_RPC_PER_SECOND` controls HTTP fetch pacing (default: 5). The dashboard shows dropped notifications when the incoming rate exceeds capacity. The public endpoint will likely throttle a full-market stream.

## What the detector checks

- The hosted scanner decodes known buy/sell instruction discriminators and account positions from the official Pump and PumpSwap IDLs (`hosted/layouts.js`, checked 2026-10-13). It requires exactly one recognized swap instruction per successful transaction and a signed user's matching base-token balance change.
- On the same program, pool and mint, one wallet has a buy then sell (or sell then buy) while a different wallet trades in the first direction between them.
- Three distinct transactions must be ordered by slot and, within the same slot, transaction position from `getBlock`. Same-slot patterns are supported. Cross-slot patterns are limited by the configured 2–16 slot window.
- Unknown same-slot order, different pools, failed transactions and recognized multi-swap routes are excluded. Repeated block observations do not duplicate flags.

This remains a narrow heuristic. It can miss unsupported instruction versions, routed/multi-swap transactions, split wallets and activity outside sampled blocks. Net token balances do not prove economic profit or quantify harm. Confirmed blocks can be reorganized; flags are provisional and are not automatically revalidated after a fork. A candidate can be innocent. Open its three signatures for manual review. The older local WebSocket edition uses log and balance heuristics without pool or intra-slot order validation; use the hosted preview for the updated detection flow.

Sources: [Pump IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json), [PumpSwap IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json), [Solana getBlock](https://solana.com/docs/rpc/http/getblock), [PublicNode endpoint](https://solana.publicnode.com/).

## API

- `GET /api/state`: current scanner state and recent observations.
- `GET /api/stream`: server-sent event stream.
- `GET /api/health`: connection and subscription health.
- `POST /api/config` with `{ "maxSlots": 8 }`: change the detector window.

## Test

```powershell
npm test
```

No wallet, private key, or fund transfer is used.

## Hosted build

```powershell
npm run build:hosted
npm run test:hosted
npm run preview:hosted
```

The Sites Worker source is `hosted/worker.js`; `scripts/build-hosted.mjs` embeds the dashboard assets and writes the deployable artifact under `dist/`. Set a private `SOLANA_RPC_HTTP` runtime variable on the host to use a dedicated Solana RPC. Do not put an RPC key in browser settings or committed source.

The hosted API exposes validated read-only `/api/signatures?address=...`, `/api/block?slot=...` and `/api/transaction?signature=...` routes. The block route requests parsed transactions through version 1; unsupported future versions fail visibly rather than being silently skipped. Tests cover same-slot ordering, pool isolation, all supported layouts, deduplication, three transaction links and error states using synthetic fixtures. Synthetic fixtures are never loaded by the live dashboard.

