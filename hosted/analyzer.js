import { LAYOUTS } from './layouts.js';
import { receiptCosts } from './costs.js';

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

function decodeBase58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return [];
    number = number * 58n + BigInt(digit);
  }
  const bytes = [];
  while (number) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const char of value) { if (char !== '1') break; bytes.unshift(0); }
  return bytes;
}

// Decode known swaps only; net transaction balances cannot isolate multi-swap routes.
export function extractBlockTrades(block, slot) {
  const trades = [];
  for (const [transactionIndex, item] of (block.transactions ?? []).entries()) {
    if (!item.meta || item.meta.err) continue;
    const message = item.transaction?.message;
    if (!message) continue;
    const instructions = [...(message.instructions ?? []),
      ...(item.meta.innerInstructions ?? []).flatMap(group => group.instructions ?? [])];
    const swaps = [];
    for (const instruction of instructions) {
      const venue = Object.keys(PROGRAMS).find(name => PROGRAMS[name] === instruction.programId);
      if (!venue || typeof instruction.data !== 'string') continue;
      const bytes = decodeBase58(instruction.data);
      const layout = LAYOUTS[venue].find(entry => entry.discriminator.every((byte, i) => byte === bytes[i]));
      if (!layout) continue;
      const accounts = instruction.accounts ?? [];
      swaps.push({venue, side:layout.name.startsWith('buy')?'buy':'sell',
        pool:accounts[layout.pool], mint:accounts[layout.mint], owner:accounts[layout.user]});
    }
    if (swaps.length !== 1) continue;
    const swap = swaps[0];
    if (!swap.pool || !swap.mint || !swap.owner) continue;
    if (!(message.accountKeys ?? []).some(key => key.signer && key.pubkey === swap.owner)) continue;
    const balance = values => (values ?? []).filter(value => value.owner === swap.owner && value.mint === swap.mint)
      .reduce((sum, value) => sum + BigInt(value.uiTokenAmount.amount), 0n);
    const delta = balance(item.meta.postTokenBalances) - balance(item.meta.preTokenBalances);
    if (swap.side === 'buy' ? delta <= 0n : delta >= 0n) continue;
    const signature = item.transaction.signatures?.[0];
    if (!signature) continue;
    trades.push({...swap, ...receiptCosts(item,swap.owner), signature, slot, transactionIndex,
      time:block.blockTime ? block.blockTime * 1000 : null,
      tokenAmount:(delta < 0n ? -delta : delta).toString()});
  }
  return trades;
}

function before(a, b) {
  return a.slot < b.slot || (a.slot === b.slot && Number.isInteger(a.transactionIndex) &&
    Number.isInteger(b.transactionIndex) && a.transactionIndex < b.transactionIndex);
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
    const key = `${trade.venue}:${trade.mint}:${trade.pool ?? 'unknown'}`;
    const history = this.byMint.get(key) ?? [];
    if (history.some(item => item.signature === trade.signature && item.owner === trade.owner)) return [];
    history.push(trade);
    history.sort((a, b) => a.slot - b.slot || (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0));
    const newestSlot = history.at(-1).slot;
    const recent = history.filter(item => newestSlot - item.slot <= this.maxSlots).slice(-200);
    this.byMint.set(key, recent);
    for (const [otherKey, items] of this.byMint) {
      if (newestSlot - items.at(-1).slot > this.maxSlots) this.byMint.delete(otherKey);
    }

    const found = [];
    // Recheck the small rolling window because RPC transaction fetches can complete out of order.
    for (let backIndex = 2; backIndex < recent.length; backIndex++) {
      const back = recent[backIndex];
      for (let frontIndex = backIndex - 2; frontIndex >= 0; frontIndex--) {
        const front = recent[frontIndex];
        if (back.slot - front.slot > this.maxSlots) break;
        if (!before(front, back) || front.signature === back.signature || front.owner !== back.owner || front.side === back.side) continue;
        const victim = recent.slice(frontIndex + 1, backIndex).find(item =>
          before(front, item) && before(item, back) && item.signature !== front.signature && item.signature !== back.signature &&
          item.side === front.side && item.owner !== front.owner);
        if (!victim) continue;
        const id = `${front.signature}:${victim.signature}:${back.signature}`;
        if (this.seen.has(id)) continue;
        this.seen.add(id);
        found.push({
          id,
          mint: front.mint,
          venue: front.venue,
          pool: front.pool ?? null,
          direction: front.side,
          slots: back.slot - front.slot,
          time: back.time,
          front: { ...front },
          middle: { ...victim },
          back: { ...back },
          label: 'Suspected sandwich',
        });
        break;
      }
    }
    if (this.seen.size > 5000) this.seen = new Set([...this.seen].slice(-2500));
    return found;
  }
}
