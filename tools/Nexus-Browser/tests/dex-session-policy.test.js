'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionPolicy } = require('../public/dex-session-policy.js');

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key)
  };
}

test('first handshake never reloads even when a previous server session was stored', () => {
  const storage = memoryStorage({ 'browser-ai-bridge.dex.server-session.v1': 'previous-process' });
  let soft = 0, reload = 0;
  const policy = createSessionPolicy({
    storage, onSoftResync: () => soft++, onAssetChange: () => reload++
  });
  assert.equal(policy.observe('fresh-process', 'asset-a').kind, 'handshake');
  assert.equal(soft, 0);
  assert.equal(reload, 0);
  assert.equal(policy.observe('fresh-process', 'asset-a').kind, 'same-session');
});

test('ordinary server restarts soft-resynchronize without reloading any Dex tab', () => {
  const resync = [], reloads = [];
  const policy = createSessionPolicy({
    storage: memoryStorage(),
    onSoftResync: (value) => resync.push(value),
    onAssetChange: (value) => reloads.push(value)
  });
  policy.observe('p1', 'asset-a');
  assert.equal(policy.observe('p2', 'asset-a').kind, 'soft-restart');
  assert.equal(policy.observe('p3', 'asset-a').kind, 'soft-restart');
  assert.deepEqual(resync.map((item) => item.session), ['p2', 'p3']);
  assert.deepEqual(reloads, []);
});

test('asset revision is distinct from process session and reloads at most once per revision', () => {
  const storage = memoryStorage();
  const revisions = [];
  const options = { storage, onAssetChange: ({ revision }) => revisions.push(revision) };
  const firstViewer = createSessionPolicy(options);
  firstViewer.observe('p1', 'asset-a');
  assert.equal(firstViewer.observe('p2', 'asset-b').kind, 'asset-change');
  assert.equal(firstViewer.observe('p3', 'asset-b').kind, 'soft-restart');
  assert.equal(firstViewer.observe('p4', 'asset-a').kind, 'asset-change');
  assert.equal(firstViewer.observe('p5', 'asset-b').kind, 'soft-restart');
  assert.deepEqual(revisions, ['asset-b', 'asset-a']);
  const reloadedViewer = createSessionPolicy(options);
  assert.equal(reloadedViewer.observe('p6', 'asset-b').kind, 'handshake');
  assert.equal(reloadedViewer.observe('p7', 'asset-a').kind, 'soft-restart');
  assert.deepEqual(revisions, ['asset-b', 'asset-a']);
});
