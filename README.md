# Pump Flow Observer

A read-only, local dashboard for **confirmed** pump.fun bonding-curve and PumpSwap trades on Solana mainnet. It listens to both program IDs over `logsSubscribe`, fetches transaction details with `getTransaction`, shows signer-owned token balance changes, and flags cross-slot trade sequences that may warrant investigation.

The hosted edition in `hosted/` shows only matched sandwich-pattern candidates. A same-origin Sites Worker polls confirmed mainnet signatures and transaction details while a visitor has the page open. It uses the official public Solana RPC by default. Full-program monitoring is sampled to stay within public RPC limits; a single-mint filter improves coverage. The dashboard reports skipped signatures and RPC errors instead of claiming complete coverage.

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

- A signer gains or loses a non-WSOL token in a transaction whose logs contain a Pump or PumpSwap buy/sell instruction.
- On the same venue and mint, one wallet has a buy then sell (or sell then buy) while another wallet trades in the same direction between them.
- All three observations occur in distinct slots within the configured 2–16 slot window.

This is a narrow heuristic. It can miss routed swaps, same-slot patterns, partial fills, token accounts whose owner is not a transaction signer, and activity lost during RPC throttling or a WebSocket disconnect. A candidate can be innocent. Open its three signatures for manual review.

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
```

The Sites Worker source is `hosted/worker.js`; `scripts/build-hosted.mjs` embeds the dashboard assets and writes the deployable artifact under `dist/`. Set a private `SOLANA_RPC_HTTP` runtime variable on the host to use a dedicated Solana RPC. Do not put an RPC key in browser settings or committed source.

