const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../extension/provider-target-spawn.js');

function chromeFixture() {
  const created = [];
  const removed = [];
  const tabs = new Map();
  return {
    created,
    removed,
    tabs,
    chromeApi: {
      tabs: {
        async create(options) {
          created.push(options);
          const tab = { id: 91, url: options.url, status: 'complete', title: 'Worker' };
          tabs.set(tab.id, tab);
          return tab;
        },
        async get(id) {
          if (!tabs.has(id)) throw new Error('No tab');
          return tabs.get(id);
        },
        async remove(id) {
          removed.push(id);
          tabs.delete(id);
        }
      }
    }
  };
}

test('managed target spawn always creates a fresh background tab and publishes only after readiness', async () => {
  const fixture = chromeFixture();
  const sent = [];
  const calls = [];
  const provider = {
    id: 'muse',
    name: 'Muse',
    urlPrefixes: ['https://muse.ai/'],
    orchestration: { spawnUrl: 'https://muse.ai/thread/new', readinessProbe: 'managed_worker_ready' },
    capabilities: { chat: true }
  };
  let readinessSamples = 0;
  fixture.chromeApi.tabs.sendMessage = async (_tabId, message) => {
    assert.equal(message.type, 'managed_worker_ready');
    readinessSamples += 1;
    return { ok: true, ready: true, reason: 'ready' };
  };

  await api.spawn({
    type: 'spawn_target',
    requestId: 'spawn-1',
    providerId: 'muse'
  }, {
    chromeApi: fixture.chromeApi,
    getProvider: () => provider,
    waitForTabComplete: async (id) => fixture.chromeApi.tabs.get(id),
    ensureProviderAdapter: async (id) => calls.push(['ready', id]),
    publishTabs: async () => calls.push(['publish']),
    safeSend: (payload) => { sent.push(payload); return true; }
  });

  assert.deepEqual(fixture.created, [{ url: 'https://muse.ai/thread/new', active: false }]);
  assert.deepEqual(calls, [['ready', 91], ['publish']]);
  assert.equal(readinessSamples, 2);
  assert.equal(sent[0].type, 'target_spawned');
  assert.equal(sent[0].target.id, 91);
  assert.equal(sent[0].target.providerId, 'muse');
});

test('fresh-chat validation rejects an old conversation redirect and closes the created tab', async () => {
  const fixture = chromeFixture();
  const provider = {
    id: 'chatgpt',
    name: 'ChatGPT',
    urlPrefixes: ['https://chatgpt.com/'],
    orchestration: { spawnUrl: 'https://chatgpt.com/' },
    capabilities: { chat: true }
  };
  fixture.chromeApi.tabs.create = async (options) => {
    fixture.created.push(options);
    const tab = { id: 92, url: 'https://chatgpt.com/c/existing', status: 'complete', title: 'Old chat' };
    fixture.tabs.set(tab.id, tab);
    return tab;
  };

  await assert.rejects(() => api.spawn({
    type: 'spawn_target',
    requestId: 'spawn-old-chat',
    providerId: 'chatgpt'
  }, {
    chromeApi: fixture.chromeApi,
    getProvider: () => provider,
    waitForTabComplete: async (id) => fixture.chromeApi.tabs.get(id),
    ensureProviderAdapter: async () => {},
    publishTabs: async () => {},
    safeSend: () => true
  }), (error) => error.code === 'DEX_CONTROL_SPAWN_NOT_FRESH');

  assert.deepEqual(fixture.removed, [92]);
  assert.equal(fixture.tabs.has(92), false);
});

test('spawn closes the fresh tab when localhost cannot receive the target result', async () => {
  const fixture = chromeFixture();
  const provider = {
    id: 'muse',
    name: 'Muse',
    urlPrefixes: ['https://muse.ai/'],
    orchestration: { spawnUrl: 'https://muse.ai/thread/new' },
    capabilities: { chat: true }
  };

  await assert.rejects(() => api.spawn({
    type: 'spawn_target',
    requestId: 'spawn-offline-result',
    providerId: 'muse'
  }, {
    chromeApi: fixture.chromeApi,
    getProvider: () => provider,
    waitForTabComplete: async (id) => fixture.chromeApi.tabs.get(id),
    ensureProviderAdapter: async () => {},
    publishTabs: async () => {},
    safeSend: () => false
  }), (error) => error.code === 'DEX_CONTROL_SPAWN_RESULT_OFFLINE');

  assert.deepEqual(fixture.removed, [91]);
});

test('fresh surface matching is path-exact while ignoring harmless query and fragment data', () => {
  assert.equal(api.sameSpawnSurface('https://chatgpt.com/?model=auto#top', 'https://chatgpt.com/'), true);
  assert.equal(api.sameSpawnSurface('https://muse.ai/thread/new/', 'https://muse.ai/thread/new'), true);
  assert.equal(api.sameSpawnSurface('https://chatgpt.com/c/old', 'https://chatgpt.com/'), false);
  assert.equal(api.sameSpawnSurface('https://muse.ai/thread/abc', 'https://muse.ai/thread/new'), false);
});

test('managed target spawn fails closed for providers without qualified fresh-chat metadata', async () => {
  const fixture = chromeFixture();
  await assert.rejects(() => api.spawn({
    type: 'spawn_target',
    requestId: 'spawn-2',
    providerId: 'other'
  }, {
    chromeApi: fixture.chromeApi,
    getProvider: () => ({ id: 'other', name: 'Other', urlPrefixes: ['https://other.example/'] }),
    waitForTabComplete() {},
    ensureProviderAdapter() {},
    publishTabs() {},
    safeSend() {}
  }), (error) => error.code === 'DEX_CONTROL_PROVIDER_NOT_SPAWNABLE');
  assert.equal(fixture.created.length, 0);
});

test('managed target close verifies provider ownership before closing the exact tab', async () => {
  const fixture = chromeFixture();
  fixture.tabs.set(77, { id: 77, url: 'https://muse.ai/thread/worker', status: 'complete' });
  const sent = [];
  const provider = { id: 'muse', name: 'Muse', urlPrefixes: ['https://muse.ai/'] };

  await api.close({
    type: 'close_target',
    requestId: 'close-1',
    tabId: 77,
    providerId: 'muse'
  }, {
    chromeApi: fixture.chromeApi,
    getProvider: () => provider,
    publishTabs: async () => {},
    safeSend: (payload) => { sent.push(payload); return true; }
  });

  assert.deepEqual(fixture.removed, [77]);
  assert.equal(sent[0].type, 'target_closed');
  assert.equal(sent[0].alreadyClosed, false);

  fixture.tabs.set(88, { id: 88, url: 'https://example.com/not-muse', status: 'complete' });
  await assert.rejects(() => api.close({
    type: 'close_target',
    requestId: 'close-2',
    tabId: 88,
    providerId: 'muse'
  }, {
    chromeApi: fixture.chromeApi,
    getProvider: () => provider,
    publishTabs: async () => {},
    safeSend() {}
  }), (error) => error.code === 'DEX_CONTROL_CLOSE_TARGET_MISMATCH');
  assert.deepEqual(fixture.removed, [77]);
});


test('managed worker readiness requires stable consecutive provider probe samples', async () => {
  const replies = [
    { ok: true, ready: false, reason: 'composer-prehydration' },
    { ok: true, ready: true, reason: 'ready' },
    { ok: true, ready: true, reason: 'ready' }
  ];
  const calls = [];
  const provider = {
    id: 'muse',
    name: 'Muse',
    orchestration: { readinessProbe: 'managed_worker_ready' }
  };
  const result = await api.waitForManagedWorkerReady(91, provider, {
    tabs: {
      async sendMessage(tabId, message) {
        calls.push({ tabId, message });
        return replies.shift();
      }
    }
  }, {
    timeoutMs: 1000,
    sleep: async () => {}
  });

  assert.equal(result.ready, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((entry) => entry.message.type), [
    'managed_worker_ready',
    'managed_worker_ready',
    'managed_worker_ready'
  ]);
});

test('providers without a declared worker readiness probe do not receive extra tab messages', async () => {
  let messages = 0;
  const result = await api.waitForManagedWorkerReady(91, {
    id: 'chatgpt',
    name: 'ChatGPT',
    orchestration: { spawnUrl: 'https://chatgpt.com/' }
  }, {
    tabs: {
      async sendMessage() { messages += 1; return { ok: true, ready: true }; }
    }
  });
  assert.deepEqual(result, { ok: true, ready: true, skipped: true });
  assert.equal(messages, 0);
});


test('provider-declared first-turn prime is the readiness proof before binding', async () => {
  const fixture = chromeFixture();
  const sent = [];
  const messages = [];
  let expectedEcho = '';
  let captureCount = 0;
  let readySamples = 0;
  fixture.chromeApi.tabs.sendMessage = async (tabId, message) => {
    messages.push(message);
    if (message.type === 'send_prompt') {
      expectedEcho = message.text.split(': ').at(-1);
      fixture.tabs.get(tabId).url = 'https://muse.ai/thread/worker-abc';
      return {
        ok: true,
        submissionMode: 'click',
        deliveryProof: { seeded: true, submitAttempted: true, submitMethod: 'click', committed: true }
      };
    }
    if (message.type === 'capture_latest') {
      captureCount += 1;
      return captureCount === 1
        ? { ok: true, text: expectedEcho.slice(0, -2), isGenerating: true }
        : { ok: true, text: expectedEcho, isGenerating: false };
    }
    if (message.type === 'managed_worker_ready') {
      readySamples += 1;
      return { ok: true, ready: true, reason: 'ready' };
    }
    throw new Error('Unexpected message type: ' + message.type);
  };
  const provider = {
    id: 'future-provider',
    name: 'Future Provider',
    urlPrefixes: ['https://muse.ai/'],
    orchestration: {
      spawnUrl: 'https://muse.ai/thread/new',
      readinessProbe: 'managed_worker_ready',
      firstTurnPrime: true,
      establishedUrlPrefix: 'https://muse.ai/thread/'
    },
    capabilities: { chat: true }
  };

  await api.spawn({
    type: 'spawn_target',
    requestId: 'spawn-prime-1',
    providerId: 'future-provider'
  }, {
    chromeApi: fixture.chromeApi,
    getProvider: () => provider,
    waitForTabComplete: async (id) => fixture.chromeApi.tabs.get(id),
    ensureProviderAdapter: async () => {},
    publishTabs: async () => {},
    safeSend: (payload) => { sent.push(payload); return true; }
  });

  assert.equal(messages.filter((message) => message.type === 'send_prompt').length, 1);
  assert.ok(captureCount >= 2);
  assert.equal(readySamples, 0);
  assert.equal(sent[0].type, 'target_spawned');
  assert.equal(sent[0].target.url, 'https://muse.ai/thread/worker-abc');
  assert.equal(fixture.removed.length, 0);
});

test('managed first-turn prime fails closed before capture when delivery is not proven committed', async () => {
  let captures = 0;
  const provider = {
    id: 'future-provider',
    name: 'Future Provider',
    orchestration: {
      spawnUrl: 'https://future.example/new',
      firstTurnPrime: true,
      establishedUrlPrefix: 'https://future.example/thread/'
    }
  };
  const chromeApi = {
    tabs: {
      async sendMessage(_tabId, message) {
        if (message.type === 'capture_latest') captures += 1;
        return { ok: true, deliveryProof: { seeded: true, submitAttempted: true, committed: false } };
      }
    }
  };
  await assert.rejects(
    () => api.primeManagedWorker(9, provider, chromeApi, { requestId: 'spawn-uncommitted', sleep: async () => {} }),
    (error) => error.code === 'DEX_CONTROL_SPAWN_PRIME_UNCOMMITTED'
  );
  assert.equal(captures, 0);
});

test('established managed surfaces exclude the provider fresh-chat sentinel', () => {
  const provider = {
    orchestration: {
      spawnUrl: 'https://muse.ai/thread/new',
      firstTurnPrime: true,
      establishedUrlPrefix: 'https://muse.ai/thread/'
    }
  };
  assert.equal(api.establishedManagedSurface('https://muse.ai/thread/new', provider), false);
  assert.equal(api.establishedManagedSurface('https://muse.ai/thread/new?x=1', provider), false);
  assert.equal(api.establishedManagedSurface('https://muse.ai/thread/abc', provider), true);
  assert.equal(api.establishedManagedSurface('https://muse.ai/other/abc', provider), false);
});
