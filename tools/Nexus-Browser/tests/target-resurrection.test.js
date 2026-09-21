const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../extension/target-resurrection.js');

function chromeFixture(tabs = []) {
  const created = [];
  return {
    created,
    tabs: {
      async query() { return tabs; },
      async create(options) {
        created.push(options);
        return { id: 99, url: options.url, status: 'loading' };
      }
    }
  };
}

test('target resurrection reuses an exact existing provider URL', async () => {
  const chromeApi = chromeFixture([
    { id: 7, url: 'https://muse.ai/chat/abc' },
    { id: 8, url: 'https://muse.ai/chat/other' }
  ]);
  const result = await api.ensure({
    provider: { matchPatterns: ['https://muse.ai/*'] },
    url: 'https://muse.ai/chat/abc',
    chromeApi,
    open: true
  });
  assert.equal(result.tab.id, 7);
  assert.equal(result.created, false);
  assert.equal(chromeApi.created.length, 0);
});

test('target resurrection opens the exact saved URL in a background tab only when requested', async () => {
  const chromeApi = chromeFixture([]);
  const result = await api.ensure({
    provider: { matchPatterns: ['https://muse.ai/*'] },
    url: 'https://muse.ai/chat/abc',
    chromeApi,
    open: true
  });
  assert.equal(result.created, true);
  assert.deepEqual(chromeApi.created[0], { url: 'https://muse.ai/chat/abc', active: false });
});

test('target resurrection does not invent a tab when open is false', async () => {
  const chromeApi = chromeFixture([]);
  const result = await api.ensure({
    provider: { matchPatterns: ['https://muse.ai/*'] },
    url: 'https://muse.ai/chat/abc',
    chromeApi,
    open: false
  });
  assert.equal(result.tab, null);
  assert.equal(chromeApi.created.length, 0);
});
