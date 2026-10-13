import { EventEmitter } from 'node:events';
import { PROGRAMS, sideFromLogs, extractTrades, SandwichDetector } from './analyzer.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export class PumpScanner extends EventEmitter {
  constructor({ httpUrl, wsUrl, maxSlots = 8, maxRpcPerSecond = 5 }) {
    super();
    this.httpUrl = httpUrl;
    this.wsUrl = wsUrl;
    this.detector = new SandwichDetector(maxSlots);
    this.rpcSpacingMs = 1000 / Math.max(1, maxRpcPerSecond);
    this.nextRpcAt = 0;
    this.cooldownUntil = 0;
    this.state = {
      connection: 'connecting',
      lastMessageAt: null,
      lastTradeAt: null,
      error: null,
      processed: 0,
      dropped: 0,
      totalTrades: 0,
      totalCandidates: 0,
      trades: [],
      candidates: [],
    };
    this.queue = [];
    this.inFlight = 0;
    this.seenSignatures = new Set();
    this.subscriptions = new Map();
    this.running = false;
    this.reconnectMs = 1000;
  }

  snapshot() {
    return { ...this.state, maxSlots: this.detector.maxSlots, queueLength: this.queue.length, subscriptions: this.subscriptions.size };
  }

  changed() { this.emit('change', this.snapshot()); }

  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  connect() {
    if (!this.running) return;
    this.state.connection = 'connecting';
    this.changed();
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.reconnectMs = 1000;
      this.subscriptions.clear();
      this.state.connection = 'live';
      this.state.error = null;
      Object.entries(PROGRAMS).forEach(([venue, program], index) => {
        ws.send(JSON.stringify({
          jsonrpc: '2.0', id: index + 1, method: 'logsSubscribe',
          params: [{ mentions: [program] }, { commitment: 'confirmed' }],
        }));
      });
      this.changed();
    });
    ws.addEventListener('message', event => {
      try { this.onMessage(JSON.parse(event.data)); }
      catch (error) { this.state.error = `WebSocket message: ${error.message}`; this.changed(); }
    });
    ws.addEventListener('error', () => {
      this.state.error = 'WebSocket connection error';
      this.changed();
    });
    ws.addEventListener('close', () => {
      if (!this.running || this.ws !== ws) return;
      this.state.connection = 'reconnecting';
      this.changed();
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectMs);
      this.reconnectMs = Math.min(this.reconnectMs * 2, 30000);
    });
  }

  onMessage(message) {
    if (typeof message.id === 'number') {
      if (message.error) {
        this.state.error = `Subscription rejected: ${message.error.message}`;
      } else if (typeof message.result === 'number') {
        this.subscriptions.set(message.result, Object.keys(PROGRAMS)[message.id - 1]);
      }
      this.changed();
      return;
    }
    if (message.method !== 'logsNotification') return;
    const venue = this.subscriptions.get(message.params?.subscription);
    const value = message.params?.result?.value;
    if (!venue || !value || value.err) return;
    this.state.lastMessageAt = Date.now();
    const side = sideFromLogs(value.logs);
    if (!side || this.seenSignatures.has(value.signature)) return;
    this.seenSignatures.add(value.signature);
    if (this.seenSignatures.size > 10000) {
      this.seenSignatures = new Set([...this.seenSignatures].slice(-5000));
    }
    if (this.queue.length >= 250) {
      this.state.dropped++;
      this.changed();
      return;
    }
    this.queue.push({ signature: value.signature, venue, side });
    this.drain();
  }

  async rpc(method, params) {
    const now = Date.now();
    const scheduledAt = Math.max(now, this.nextRpcAt, this.cooldownUntil);
    this.nextRpcAt = scheduledAt + this.rpcSpacingMs;
    if (scheduledAt > now) await pause(scheduledAt - now);
    const response = await fetch(this.httpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 429) this.cooldownUntil = Date.now() + 5000;
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`);
    return payload.result;
  }

  drain() {
    while (this.running && this.inFlight < 3 && this.queue.length) {
      const item = this.queue.shift();
      this.inFlight++;
      this.process(item).finally(() => { this.inFlight--; this.drain(); });
    }
  }

  async process({ signature, venue, side }) {
    try {
      let transaction = null;
      for (let attempt = 0; attempt < 3 && !transaction; attempt++) {
        if (attempt) await pause(450 * attempt);
        transaction = await this.rpc('getTransaction', [signature, {
          encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0,
        }]);
      }
      if (!transaction) return;
      this.state.error = null;
      const trades = extractTrades(transaction, venue, side);
      this.state.processed++;
      for (const trade of trades) {
        this.state.totalTrades++;
        this.state.trades.unshift(trade);
        this.state.trades.length = Math.min(this.state.trades.length, 300);
        this.state.lastTradeAt = Date.now();
        for (const candidate of this.detector.add(trade)) {
          this.state.totalCandidates++;
          this.state.candidates.unshift(candidate);
          this.state.candidates.length = Math.min(this.state.candidates.length, 100);
        }
      }
      if (trades.length) this.changed();
    } catch (error) {
      this.state.error = error.message;
      this.changed();
      await pause(300);
    }
  }
}

