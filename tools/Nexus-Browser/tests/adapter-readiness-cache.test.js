const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache } = require('../extension/adapter-readiness-cache.js');

test('adapter readiness cache skips repeated healthy probes inside TTL', () => {
  let clock = 1000;
  const cache = createCache({ ttlMs: 15000, now: () => clock });
  assert.equal(cache.fresh(7, 'muse'), false);
  cache.mark(7, 'muse');
  assert.equal(cache.fresh(7, 'muse'), true);
  clock += 14999;
  assert.equal(cache.fresh(7, 'muse'), true);
  clock += 2;
  assert.equal(cache.fresh(7, 'muse'), false);
});

test('adapter readiness invalidation is scoped by tab or can clear all', () => {
  const cache = createCache({ now: () => 1000 });
  cache.mark(7, 'muse');
  cache.mark(8, 'chatgpt');
  cache.invalidate(7);
  assert.equal(cache.fresh(7, 'muse'), false);
  assert.equal(cache.fresh(8, 'chatgpt'), true);
  cache.invalidate();
  assert.equal(cache.fresh(8, 'chatgpt'), false);
});
