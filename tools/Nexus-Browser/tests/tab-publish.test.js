const test = require('node:test');
const assert = require('node:assert/strict');
const { tabsSignature, createDebouncedPublisher, createTabPublishController } = require('../extension/tab-publish.js');

test('tab snapshot signature ignores ordering but changes for meaningful tab or target changes', () => {
  const tabsA = [
    { id: 2, providerId: 'chatgpt', title: 'B', url: 'https://chatgpt.com/c/b' },
    { id: 1, providerId: 'muse', title: 'A', url: 'https://muse.ai/' }
  ];
  const tabsB = [tabsA[1], tabsA[0]];
  assert.equal(tabsSignature(tabsA, tabsA[0]), tabsSignature(tabsB, tabsA[0]));
  assert.notEqual(tabsSignature(tabsA, tabsA[0]), tabsSignature(tabsA, tabsA[1]));
  assert.notEqual(tabsSignature(tabsA, tabsA[0]), tabsSignature([{ ...tabsA[0], title: 'Changed' }, tabsA[1]], tabsA[0]));
});

test('debounced publisher coalesces bursts into one refresh', async () => {
  const queued = [];
  const timers = {
    setTimeout(fn) { queued.push(fn); return queued.length; },
    clearTimeout() {}
  };
  let calls = 0;
  const publisher = createDebouncedPublisher(() => { calls += 1; }, 350, timers);
  publisher.schedule();
  publisher.schedule();
  publisher.schedule();
  queued[queued.length - 1]();
  await Promise.resolve();
  assert.equal(calls, 1);
});

test('tab controller suppresses identical automatic snapshots but forced refresh still emits', async () => {
  const tabs = [{ id: 7, providerId: 'muse', title: 'Muse', url: 'https://muse.ai/' }];
  const sent = [];
  const controller = createTabPublishController({
    loadTabs: async () => tabs,
    resolveTarget: () => tabs[0],
    publicProviders: () => [{ id: 'muse', name: 'Muse' }],
    send(payload) { sent.push(payload); return true; }
  });
  assert.equal(await controller.publish(), true);
  assert.equal(await controller.publish(), false);
  assert.equal(await controller.publish({ force: true }), true);
  assert.equal(sent.length, 2);
  controller.reset();
  assert.equal(await controller.publish(), true);
});


test('tab snapshot signature changes when provider health changes', () => {
  const ready = {
    id: 7, providerId: 'grok', title: 'Grok', url: 'https://grok.com/',
    health: { state: 'ready', blocking: false, action: 'none', summary: 'Ready', cooldownUntil: null }
  };
  const limited = {
    ...ready,
    health: {
      state: 'rate_limited', blocking: true, action: 'wait',
      summary: 'Quota reached · cooldown', cooldownUntil: '2026-09-19T17:30:00.000Z'
    }
  };
  assert.notEqual(tabsSignature([ready], ready), tabsSignature([limited], limited));
});
