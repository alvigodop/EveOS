const test = require('node:test');
const assert = require('node:assert/strict');
const { createProviderTargetSpawnRouting } = require('../dex/provider-target-spawn-routing.js');

function socket() {
  return { sent: [] };
}

test('spawn routing correlates an exact extension-created target', async () => {
  const extension = socket();
  const safeSend = (ws, payload) => { ws.sent.push(payload); return true; };
  const routing = createProviderTargetSpawnRouting({
    safeSend,
    getExtensionSocket: () => extension
  });

  const promise = routing.spawn({ requestId: 'ctl-1', providerId: 'muse' });
  assert.deepEqual(extension.sent[0], {
    type: 'spawn_target',
    requestId: 'spawn-ctl-1',
    providerId: 'muse'
  });

  assert.equal(routing.observe({
    type: 'target_spawned',
    requestId: 'spawn-ctl-1',
    target: { id: 77, providerId: 'muse' }
  }), true);
  assert.deepEqual(await promise, { id: 77, providerId: 'muse' });
});

test('close routing preserves exact tab/provider identity', async () => {
  const extension = socket();
  const safeSend = (ws, payload) => { ws.sent.push(payload); return true; };
  const routing = createProviderTargetSpawnRouting({
    safeSend,
    getExtensionSocket: () => extension
  });

  const promise = routing.close({ requestId: 'ctl-2', targetId: 77, providerId: 'muse' });
  assert.deepEqual(extension.sent[0], {
    type: 'close_target',
    requestId: 'close-ctl-2',
    tabId: 77,
    providerId: 'muse'
  });

  routing.observe({
    type: 'target_closed',
    requestId: 'close-ctl-2',
    tabId: 77,
    providerId: 'muse',
    alreadyClosed: false
  });
  assert.deepEqual(await promise, {
    ok: true,
    alreadyClosed: false,
    tabId: 77,
    providerId: 'muse'
  });
});

test('late spawn result after timeout is converted into exact cleanup-only close', async () => {
  const extension = socket();
  const timers = [];
  let stamp = 1000;
  const safeSend = (ws, payload) => { ws.sent.push(payload); return true; };
  const routing = createProviderTargetSpawnRouting({
    safeSend,
    getExtensionSocket: () => extension,
    now: () => stamp,
    setTimer(fn) { timers.push(fn); return timers.length; },
    clearTimer() {}
  });

  const promise = routing.spawn({ requestId: 'ctl-late', providerId: 'muse' });
  assert.equal(extension.sent[0].requestId, 'spawn-ctl-late');
  timers[0]();
  await assert.rejects(() => promise, (error) => error.code === 'DEX_CONTROL_TARGET_TIMEOUT');
  assert.equal(routing.expiredSpawns.has('spawn-ctl-late'), true);

  assert.equal(routing.observe({
    type: 'target_spawned',
    requestId: 'spawn-ctl-late',
    target: { id: 77, providerId: 'muse', url: 'https://muse.ai/thread/new' }
  }), true);
  assert.deepEqual(extension.sent[1], {
    type: 'close_target',
    requestId: 'expired-spawn-ctl-late',
    tabId: 77,
    providerId: 'muse'
  });
  assert.equal(routing.expiredSpawns.has('spawn-ctl-late'), false);
  assert.equal(routing.observe({
    type: 'target_closed',
    requestId: 'expired-spawn-ctl-late',
    tabId: 77,
    providerId: 'muse'
  }), true);

  stamp += 1;
});

test('extension disconnect turns in-flight spawn into cleanup-only identity', async () => {
  const extension = socket();
  const safeSend = (ws, payload) => { ws.sent.push(payload); return true; };
  const routing = createProviderTargetSpawnRouting({
    safeSend,
    getExtensionSocket: () => extension,
    now: () => 2000
  });

  const promise = routing.spawn({ requestId: 'ctl-drop', providerId: 'muse' });
  routing.failAll();
  await assert.rejects(() => promise, (error) => error.code === 'EXTENSION_OFFLINE');
  assert.equal(routing.expiredSpawns.has('spawn-ctl-drop'), true);

  assert.equal(routing.observe({
    type: 'target_spawned',
    requestId: 'spawn-ctl-drop',
    target: { id: 88, providerId: 'muse', url: 'https://muse.ai/thread/new' }
  }), true);
  assert.deepEqual(extension.sent.at(-1), {
    type: 'close_target',
    requestId: 'expired-spawn-ctl-drop',
    tabId: 88,
    providerId: 'muse'
  });
});

test('extension errors reject the matching managed target operation only', async () => {
  const extension = socket();
  const safeSend = (ws, payload) => { ws.sent.push(payload); return true; };
  const routing = createProviderTargetSpawnRouting({
    safeSend,
    getExtensionSocket: () => extension
  });

  const promise = routing.spawn({ requestId: 'ctl-3', providerId: 'muse' });
  routing.observe({
    type: 'error',
    requestId: 'spawn-ctl-3',
    code: 'DEX_CONTROL_PROVIDER_NOT_SPAWNABLE',
    message: 'No spawn.'
  });
  await assert.rejects(() => promise, (error) => error.code === 'DEX_CONTROL_PROVIDER_NOT_SPAWNABLE');
  assert.equal(routing.pending.size, 0);
});
