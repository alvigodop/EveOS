const test = require('node:test');
const assert = require('node:assert/strict');
const { KEY, createStore } = require('../extension/target-state.js');

function memoryStorage(seed = {}) {
  const values = { ...seed };
  return {
    async get(key) { return { [key]: values[key] }; },
    async set(payload) { Object.assign(values, payload); },
    async remove(key) { delete values[key]; },
    values
  };
}

test('selected target state survives store recreation', async () => {
  const storage = memoryStorage();
  const first = createStore(storage);
  assert.equal(await first.write(42, 'muse', 'https://muse.ai/chat/abc'), true);
  const second = createStore(storage);
  assert.deepEqual(await second.read(), { tabId: 42, providerId: 'muse', url: 'https://muse.ai/chat/abc' });
});

test('selected target state rejects malformed persisted values', async () => {
  const storage = memoryStorage({ [KEY]: { tabId: 'nope', providerId: '' } });
  assert.equal(await createStore(storage).read(), null);
});

test('selected target state can be cleared deterministically', async () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  await store.write(42, 'muse');
  assert.equal(await store.clear(), true);
  assert.equal(await store.read(), null);
});
