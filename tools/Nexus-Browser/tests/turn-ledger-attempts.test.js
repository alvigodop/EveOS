const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTurnLedger } = require('../dex/turn-ledger.js');

test('turn ledger durably counts dispatch attempts without incrementing later observations', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-ledger-attempts-'));
  const filePath = path.join(dir, 'dex-turn-ledger.jsonl');
  try {
    const ledger = createTurnLedger({ filePath });
    const dispatch = await ledger.record('request-1', 'dispatching', { providerId: 'muse' });
    assert.equal(dispatch.dispatchAttempts, 1);
    const accepted = await ledger.record('request-1', 'accepted', { providerId: 'muse' });
    assert.equal(accepted.dispatchAttempts, 1);
    const reloaded = createTurnLedger({ filePath });
    assert.equal(reloaded.entry('request-1').dispatchAttempts, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
