export const PROGRAMS = Object.freeze({
  Pump: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PumpSwap: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
});

const WSOL = 'So11111111111111111111111111111111111111112';

export function sideFromLogs(logs = []) {
  const sides = new Set();
  for (const line of logs) {
    const match = /Instruction:\s*(Buy|Sell)(?:V2|ExactSolIn)?\b/i.exec(line);
    if (match) sides.add(match[1].toLowerCase());
  }
  return sides.size === 1 ? [...sides][0] : null;
}

function balanceMap(items = []) {
  const result = new Map();
  for (const item of items) {
    if (!item.owner || !item.mint || item.accountIndex == null) continue;
    const key = `${item.accountIndex}:${item.mint}:${item.owner}`;
    result.set(key, {
      owner: item.owner,
      mint: item.mint,
      decimals: item.uiTokenAmount?.decimals ?? 0,
      amount: BigInt(item.uiTokenAmount?.amount ?? '0'),
    });
  }
  return result;
}

export function extractTrades(transaction, venue, sideHint = null) {
  const meta = transaction?.meta;
  const message = transaction?.transaction?.message;
  if (!meta || meta.err || !message) return [];
  const side = sideHint ?? sideFromLogs(meta.logMessages);
  if (!side) return [];
  const signers = new Set((message.accountKeys ?? [])
    .filter(key => typeof key === 'object' && key.signer)
    .map(key => key.pubkey));
  if (!signers.size) return [];

  const before = balanceMap(meta.preTokenBalances);
  const after = balanceMap(meta.postTokenBalances);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const trades = [];
  const signature = transaction.transaction.signatures?.[0];
  if (!signature) return [];

  for (const key of keys) {
    const previous = before.get(key);
    const next = after.get(key);
    const record = next ?? previous;
    if (!signers.has(record.owner) || record.mint === WSOL) continue;
    const delta = (next?.amount ?? 0n) - (previous?.amount ?? 0n);
    if ((side === 'buy' && delta <= 0n) || (side === 'sell' && delta >= 0n)) continue;
    trades.push({
      signature,
      slot: transaction.slot,
      time: transaction.blockTime ? transaction.blockTime * 1000 : Date.now(),
      venue,
      side,
      owner: record.owner,
      mint: record.mint,
      tokenAmount: (delta < 0n ? -delta : delta).toString(),
      decimals: record.decimals,
    });
  }
  return trades;
}

export class SandwichDetector {
  constructor(maxSlots = 8) {
    this.maxSlots = maxSlots;
    this.byMint = new Map();
    this.seen = new Set();
  }

  setWindow(maxSlots) {
    if (!Number.isInteger(maxSlots) || maxSlots < 2 || maxSlots > 16) {
      throw new Error('Window must be an integer from 2 to 16 slots');
    }
    this.maxSlots = maxSlots;
  }

  add(trade) {
    const key = `${trade.venue}:${trade.mint}`;
    const history = this.byMint.get(key) ?? [];
    if (history.some(item => item.signature === trade.signature && item.owner === trade.owner)) return [];
    history.push(trade);
    history.sort((a, b) => a.slot - b.slot || a.time - b.time);
    const newestSlot = history.at(-1).slot;
    const recent = history.filter(item => newestSlot - item.slot <= this.maxSlots).slice(-80);
    this.byMint.set(key, recent);

    const found = [];
    // Recheck the small rolling window because RPC transaction fetches can complete out of order.
    for (let backIndex = 2; backIndex < recent.length; backIndex++) {
      const back = recent[backIndex];
      for (let frontIndex = backIndex - 2; frontIndex >= 0; frontIndex--) {
        const front = recent[frontIndex];
        if (back.slot - front.slot > this.maxSlots) break;
        if (front.slot >= back.slot || front.owner !== back.owner || front.side === back.side) continue;
        const victim = recent.slice(frontIndex + 1, backIndex).find(item =>
          item.slot > front.slot && item.slot < back.slot &&
          item.side === front.side && item.owner !== front.owner);
        if (!victim) continue;
        const id = `${front.signature}:${victim.signature}:${back.signature}`;
        if (this.seen.has(id)) continue;
        this.seen.add(id);
        found.push({
          id,
          mint: front.mint,
          venue: front.venue,
          direction: front.side,
          slots: back.slot - front.slot,
          time: back.time,
          front: { signature: front.signature, slot: front.slot, owner: front.owner },
          middle: { signature: victim.signature, slot: victim.slot, owner: victim.owner },
          back: { signature: back.signature, slot: back.slot, owner: back.owner },
          label: 'Pattern candidate',
        });
        break;
      }
    }
    if (this.seen.size > 5000) this.seen = new Set([...this.seen].slice(-2500));
    return found;
  }
}

