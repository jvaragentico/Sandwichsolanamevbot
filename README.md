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

The hosted API exposes validated read-only `/api/signatures?address=...`, `/api/block?slot=...` and `/api/transaction?signature=...` routes. The block route requests parsed transactions through version 1; unsupported future versions fail visibly rather than being silently skipped. Tests cover same-slot ordering, pool isolation, all supported layouts, deduplication, three transaction links and error states using synthetic fixtures. Synthetic fixtures are confined to the labeled simulator and tests; the live scanner never consumes them.

If the hosted RPC proxy returns HTTP 403 or 429, the scanner switches for the session to PublicNode directly from the browser. Only public chain queries are sent; no wallet keys or private RPC credentials enter the browser. The source panel names the active connection. If both paths fail, the dashboard shows the error and retries after a cooldown. For a local browser check of this fallback, set `PREVIEW_RPC_STATUS=429` when running the preview; this injects proxy errors only in the local preview server, while the browser fetches real mainnet data.

## Cross-slot simulation and profitability worksheet

Open `#simulation` on the hosted dashboard. Six controlled synthetic scenarios pass through the same instruction decoder and detector: cross-slot, same-slot, missing middle block, different pool, different closing wallet and reversed on-chain order. Adjustable slot gaps and windows expose coverage limitations. No simulation transactions are signed, sent or placed on Devnet/Testnet/Mainnet, and live counters remain separate.

The accounting worksheet uses exact integer lamports for supplied entry cost, exit proceeds, network fees, tips and other costs. Entry/exit amounts must already incorporate DEX fees and realized slippage. It is an arithmetic worksheet, not an AMM pricing, fill, competition or strategy backtest. Open inventory or incomplete costs produce an incomplete-accounting result. Even a positive result is hypothetical; live profitability remains **UNPROVEN**. JSON exports retain inputs, fixture trades, evidence coverage and limitations. Changing inputs disables exporting a stale report until it is rerun.

## Jito mev-bot integration

`hosted/jito-analysis.js` adapts the trade-log analysis from [jito-labs/mev-bot](https://github.com/jito-labs/mev-bot), pinned at `f02016bb646a99a3542cfd54cb7e13160d96289e`. The unmodified analysis notebook and Apache-2.0 license are in `vendor/jito-mev-bot/`, with file hashes in `PROVENANCE.json`. This is an analytics integration, not an installation or activation of the upstream bot.

Use the Trade-log evidence panel to import upstream `trades.csv` locally (2 MB / 10,000 rows maximum) and export its analysis. Reported acceptance, landing and rejection are separate; repeated headers are skipped, integer units are preserved, and expected profit is grouped by source mint. CSV claims are unverified. The upstream CSV does not provide realized P&L or finalized wallet balance reconciliation; expectedProfit and landed cannot establish profit. Synthetic import data lives only in `test/fixtures/jito-trades.synthetic.csv` and is not loaded into the live dashboard.

The upstream README warns it is unmaintained and unsuitable for production. Its legacy engine is a Raydium/Orca backrun arbitrage system, not a Pump sandwich executor. Current [Jito documentation](https://docs.jito.wtf/lowlatencytxnsend/#bundles-api-v1) specifies that bundles execute within one slot; a cross-slot fixture does not imply an atomic cross-slot bundle.

The [Jito-Solana build guide](https://jito-foundation.gitbook.io/mev/jito-solana/building-the-software) covers a separate Rust validator client, including Linux build dependencies, release-tag selection and local validator testing. It is a reference, not a dependency of this browser dashboard. No validator is installed or started by this project. Compiling a validator or running a local cluster does not establish market access, successful execution or profitability.

## Bundle status and local rule model

Open `#bundles`. The read-only `GET /api/bundle?id=<64-character-hex>&mode=receipts|inflight` route calls only Jito's mainnet `getBundleStatuses` or `getInflightBundleStatuses`. Choose receipt history for transaction links or recent inflight history for pending/failed/landed information. Lookups are manual, have a ten-second upstream timeout, and expose throttling or service errors. Missing/expired history is labeled unknown, never assumed failure. Jito receipt status does not establish reconciled profit or verify that a bundle concerns Pump.

The local rule model accepts one to five ordered synthetic slot numbers and an optional failure position. It models single-slot atomic success or rollback. It performs no Solana VM simulation, transaction construction, signing, submission, auction or profitability test. Cross-slot sequences cannot form one atomic Jito bundle. There are no wallet keys or bundle submission endpoints.

