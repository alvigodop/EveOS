const test = require('node:test');
const assert = require('node:assert/strict');
const { createServerDurability } = require('../dex/server-durability.js');

function fakeLedger() {
  const values = new Map();
  return {
    entry(id) { return values.get(id) || null; },
    async record(id, state, meta = {}) {
      const value = { requestId: id, state, ...meta };
      values.set(id, value);
      return value;
    },
    status(id) { return { reliable: true, entry: values.get(id) || null }; },
    stats() { return { reliable: true, entries: values.size, active: values.size }; }
  };
}

test('localhost durability marks the dispatch boundary before provider side effects', async () => {
  const ledger = fakeLedger();
  const durability = createServerDurability({
    ledger,
    incidents: { record() {}, stats: () => ({ count: 0, last: null }) }
  });
  const first = await durability.beforeDispatch(
    { type: 'send_prompt', requestId: 'dex-1' },
    { targetClassId: 'online-origin', targetId: 3, providerId: 'muse' }
  );
  assert.equal(first.ok, true);
  assert.equal(ledger.entry('dex-1').state, 'dispatching');

  await durability.observe({ type: 'prompt_accepted', requestId: 'dex-1' });
  await durability.observe({ type: 'response_final', requestId: 'dex-1' });
  assert.equal(durability.query('dex-1').entry.state, 'completed');
});

test('localhost durability blocks an identical request id after dispatch may have occurred', async () => {
  const ledger = fakeLedger();
  const durability = createServerDurability({
    ledger,
    incidents: { record() {}, stats: () => ({ count: 0, last: null }) }
  });
  await durability.beforeDispatch({ type: 'send_prompt', requestId: 'dex-1' });
  const duplicate = await durability.beforeDispatch({ type: 'send_prompt', requestId: 'dex-1' });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.duplicate, true);
});

test('ledger-only timeout failure does not duplicate incidents and can later complete', async () => {
  const ledger = fakeLedger();
  const incidentRows = [];
  const durability = createServerDurability({
    ledger,
    incidents: { record(value) { incidentRows.push(value); }, stats: () => ({ count: incidentRows.length, last: incidentRows.at(-1) || null }) }
  });
  await durability.beforeDispatch({ type: 'send_prompt', requestId: 'dex-timeout' });
  await durability.markFailed('dex-timeout', 'RECOVERY_TIMEOUT', { providerId: 'muse' });
  assert.equal(durability.query('dex-timeout').entry.state, 'failed');
  assert.equal(incidentRows.length, 0);

  await durability.observe({ type: 'response_final', requestId: 'dex-timeout' }, { providerId: 'muse' });
  assert.equal(durability.query('dex-timeout').entry.state, 'completed');
});

test('configureDurability returns previous stores for clean restoration', () => {
  const { configureDurability } = require('../server.js');
  const dummy1 = { id: 'dummy-1' };
  const dummy2 = { id: 'dummy-2' };
  const initial = configureDurability({ durability: dummy1, dexStateStore: dummy1 });
  const restored = configureDurability({ durability: dummy2, dexStateStore: dummy2 });
  assert.equal(restored.durability, dummy1);
  assert.equal(restored.dexStateStore, dummy1);
  configureDurability(initial);
});
