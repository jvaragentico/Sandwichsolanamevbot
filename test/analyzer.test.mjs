import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTrades, sideFromLogs, SandwichDetector } from '../src/analyzer.mjs';

const wallet = 'Wallet1111111111111111111111111111111111111';
const mint = 'Mint111111111111111111111111111111111111111';
const balance = (amount) => ({ accountIndex: 1, mint, owner: wallet, uiTokenAmount: { amount: String(amount), decimals: 6 } });

test('extracts a signed Pump buy from token balance changes', () => {
  const tx = {
    slot: 100, blockTime: 1000,
    transaction: { signatures: ['Signature1'], message: { accountKeys: [{ pubkey: wallet, signer: true }] } },
    meta: { err: null, logMessages: ['Program log: Instruction: Buy'], preTokenBalances: [balance(0)], postTokenBalances: [balance(1000000)] },
  };
  assert.deepEqual(extractTrades(tx, 'Pump').map(({ side, owner, tokenAmount, slot }) => ({ side, owner, tokenAmount, slot })),
    [{ side: 'buy', owner: wallet, tokenAmount: '1000000', slot: 100 }]);
});

test('rejects ambiguous instruction logs and unrelated token movement', () => {
  assert.equal(sideFromLogs(['Instruction: Buy', 'Instruction: Sell']), null);
  const tx = {
    slot: 100, transaction: { signatures: ['Signature2'], message: { accountKeys: [{ pubkey: wallet, signer: false }] } },
    meta: { err: null, preTokenBalances: [balance(0)], postTokenBalances: [balance(1)] },
  };
  assert.deepEqual(extractTrades(tx, 'Pump', 'buy'), []);
});

const trade = (signature, slot, owner, side) => ({ signature, slot, owner, side, mint, venue: 'Pump', time: slot * 1000 });

test('identifies an ordered cross-slot pattern even if details arrive out of order', () => {
  const detector = new SandwichDetector(8);
  assert.deepEqual(detector.add(trade('back', 105, 'attacker', 'sell')), []);
  assert.deepEqual(detector.add(trade('front', 100, 'attacker', 'buy')), []);
  const found = detector.add(trade('middle', 102, 'other', 'buy'));
  assert.equal(found.length, 1);
  assert.equal(found[0].front.signature, 'front');
  assert.equal(found[0].middle.signature, 'middle');
  assert.equal(found[0].back.signature, 'back');
});

test('does not report sequences outside window', () => {
  const detector = new SandwichDetector(4);
  detector.add(trade('front', 100, 'attacker', 'buy'));
  detector.add(trade('middle', 102, 'other', 'buy'));
  assert.deepEqual(detector.add(trade('back', 106, 'attacker', 'sell')), []);
});

