const test = require('node:test');
const assert = require('node:assert/strict');
const runtimeConfig = require('../extension/runtime-config.js');
const { ensureDexUiTab } = require('../extension/dex-ui-ensure.js');

test('Dex UI ensure reuses an existing headed localhost tab', async () => {
  let created = 0;
  const chromeApi = {
    tabs: {
      async query() { return [{ id: 7, discarded: false }]; },
      async create() { created += 1; return { id: 8 }; }
    }
  };
  const result = await ensureDexUiTab(chromeApi);
  assert.deepEqual(result, { ok: true, created: false, tabId: 7 });
  assert.equal(created, 0);
});

test('Dex UI ensure creates a background headed tab when none is open', async () => {
  let options = null;
  const chromeApi = {
    tabs: {
      async query() { return []; },
      async create(value) { options = value; return { id: 9 }; }
    }
  };
  const result = await ensureDexUiTab(chromeApi);
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(options.active, false);
  assert.equal(options.url, runtimeConfig.dexUrl);
});
