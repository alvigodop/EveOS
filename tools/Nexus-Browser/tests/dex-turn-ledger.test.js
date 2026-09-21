const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTurnLedger } = require('../dex/turn-ledger.js');

test('turn ledger survives process recreation and advances monotonically', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-ledger-'));
  const filePath = path.join(dir, 'turns.jsonl');
  const ledger = createTurnLedger({ filePath });
  await ledger.record('dex-1', 'dispatching', { providerId: 'muse', targetId: 7 });
  await ledger.record('dex-1', 'responding');
  await ledger.record('dex-1', 'completed');
  await ledger.record('dex-1', 'accepted');
  assert.equal(ledger.entry('dex-1').state, 'completed');

  const restored = createTurnLedger({ filePath });
  assert.equal(restored.status('dex-1').reliable, true);
  assert.equal(restored.entry('dex-1').state, 'completed');
  assert.equal(restored.entry('dex-1').providerId, 'muse');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('turn ledger treats a malformed persisted line as unreliable for safe replay', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-ledger-'));
  const filePath = path.join(dir, 'turns.jsonl');
  fs.writeFileSync(filePath, '{"requestId":"dex-1","state":"dispatching"}\n{bad\n', 'utf8');
  const ledger = createTurnLedger({ filePath });
  assert.equal(ledger.status('missing').reliable, false);
  assert.equal(ledger.entry('dex-1').state, 'dispatching');
  fs.rmSync(dir, { recursive: true, force: true });
});
