const test = require('node:test');
const assert = require('node:assert/strict');
const { createControl } = require('../extension/qualification-control.js');

function fixture({ now = 1000 } = {}) {
  const data = {};
  let active = 1;
  let nextId = 10;
  const tabs = new Map([
    [1, { id: 1, url: 'https://example.com/', active: true }],
    [2, { id: 2, url: 'https://muse.ai/chat/permanent', active: false }]
  ]);
  const storage = {
    async get(key) { return { [key]: data[key] }; },
    async set(values) { Object.assign(data, values); },
    async remove(key) { delete data[key]; }
  };
  const chromeApi = {
    storage: { session: storage },
    tabs: {
      async query(query = {}) {
        const values = [...tabs.values()];
        if (query.active) return values.filter((tab) => tab.id === active);
        return values;
      },
      async create(options) {
        const tab = { id: nextId++, url: options.url, active: !!options.active };
        tabs.set(tab.id, tab);
        if (options.active) active = tab.id;
        return tab;
      },
      async get(id) {
        if (!tabs.has(Number(id))) throw new Error('missing tab');
        return tabs.get(Number(id));
      },
      async remove(id) { tabs.delete(Number(id)); }
    }
  };
  const clock = { value: now };
  const control = createControl({
    chromeApi, storage, now: () => clock.value, ttlMs: 60_000,
    matchesProvider: (providerId, url) => providerId === 'muse' && String(url).startsWith('https://muse.ai/')
  });
  return { control, chromeApi, tabs, data, clock, active: () => active };
}

async function opened(f) {
  return f.control.begin({
    runId: 'run-1', providerId: 'muse',
    url: 'https://muse.ai/?dex_qualification=run-1',
    previousTarget: { tabId: 2, providerId: 'muse', url: 'https://muse.ai/chat/permanent' }
  });
}

test('qualification creates only its own background tab and records run ownership', async () => {
  const f = fixture();
  const result = await opened(f);
  assert.equal(result.createdActive, false);
  assert.equal(result.tab.id, 10);
  assert.equal(f.active(), 1);
  const record = await f.control.requireRun('run-1');
  assert.equal(record.disposable, true);
  assert.equal(record.tabId, 10);
  assert.deepEqual(record.baselineTabIds, [1, 2]);
});

test('qualification close refuses arbitrary normal tabs and wrong runs', async () => {
  const f = fixture();
  const result = await opened(f);
  await assert.rejects(
    () => f.control.closeOwned({ runId: 'run-1', providerId: 'muse', tabId: 2, url: result.record.url }),
    (error) => error.code === 'QUALIFICATION_OWNERSHIP_MISMATCH'
  );
  await assert.rejects(
    () => f.control.closeOwned({ runId: 'other-run', providerId: 'muse', tabId: 10, url: result.record.url }),
    (error) => error.code === 'QUALIFICATION_NOT_OWNED'
  );
  assert.equal(f.tabs.has(2), true);
  assert.equal(f.tabs.has(10), true);
});

test('qualification close is exact, one-shot, and preserves the foreground tab', async () => {
  const f = fixture();
  const result = await opened(f);
  const closed = await f.control.closeOwned({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id, url: result.record.url
  });
  assert.equal(f.tabs.has(result.tab.id), false);
  assert.equal(closed.foregroundBefore, 1);
  assert.equal(closed.foregroundAfter, 1);
  assert.equal(closed.unrelatedTabsMissing, 0);
  assert.equal(f.control.consumeClosingTab(result.tab.id), true);
  assert.equal(f.control.consumeClosingTab(result.tab.id), false);
  await assert.rejects(
    () => f.control.closeOwned({ runId: 'run-1', providerId: 'muse', tabId: result.tab.id, url: result.record.url }),
    (error) => error.code === 'QUALIFICATION_CLOSE_CONSUMED'
  );
});

test('expired qualification ownership is refused and discarded', async () => {
  const f = fixture();
  await opened(f);
  f.clock.value += 61_000;
  await assert.rejects(() => f.control.requireRun('run-1'), (error) => error.code === 'QUALIFICATION_EXPIRED');
});

test('replacement adoption rejects pre-existing tabs and accepts only a newly created exact target', async () => {
  const f = fixture();
  const result = await opened(f);
  await f.control.closeOwned({ runId: 'run-1', providerId: 'muse', tabId: result.tab.id, url: result.record.url });
  await assert.rejects(
    () => f.control.adoptReplacement({
      runId: 'run-1', providerId: 'muse', url: result.record.url,
      tab: { id: 2, url: result.record.url }, created: false
    }),
    (error) => error.code === 'QUALIFICATION_REUSED_UNOWNED_TAB'
  );
  const replacement = await f.chromeApi.tabs.create({ url: result.record.url, active: false });
  await f.control.registerReplacementCandidate({
    runId: 'run-1', providerId: 'muse', url: result.record.url, tab: replacement, created: true
  });
  const adopted = await f.control.adoptReplacement({
    runId: 'run-1', providerId: 'muse', url: result.record.url, tab: replacement, created: true
  });
  assert.equal(adopted.replacementTabId, replacement.id);
  assert.equal(f.active(), 1);
});

test('qualification prompt authorization is exact and counts submissions without enabling arbitrary prompts', async () => {
  const f = fixture();
  const result = await opened(f);
  await assert.rejects(
    () => f.control.assertPromptTarget({ runId: 'run-1', providerId: 'muse', tabId: result.tab.id, text: 'do something else' }),
    (error) => error.code === 'QUALIFICATION_PROMPT_REFUSED'
  );
  await f.control.claimPrompt({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
    requestId: 'request-1', text: 'QUALIFY_run-1'
  });
  await f.control.notePrompt({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
    requestId: 'request-1', text: 'QUALIFY_run-1'
  });
  const inspected = await f.control.inspect('run-1');
  assert.equal(inspected.promptSubmissions, 1);
  assert.deepEqual(inspected.promptRequestIds, ['request-1']);
});

test('qualification stays URL-exact before send but adopts same-provider navigation after claimed commit', async () => {
  const f = fixture();
  const result = await opened(f);
  const ownedTab = f.tabs.get(result.tab.id);
  const exactUrl = ownedTab.url;

  ownedTab.url = 'https://muse.ai/chat/pre-send-change';
  await assert.rejects(
    () => f.control.claimPrompt({
      runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
      requestId: 'request-1', text: 'QUALIFY_run-1'
    }),
    (error) => error.code === 'QUALIFICATION_TARGET_CHANGED'
  );

  ownedTab.url = exactUrl;
  await f.control.claimPrompt({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
    requestId: 'request-1', text: 'QUALIFY_run-1'
  });
  ownedTab.url = 'https://muse.ai/chat/generated-after-send';
  await f.control.notePrompt({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
    requestId: 'request-1', text: 'QUALIFY_run-1'
  });
  const inspected = await f.control.inspect('run-1');
  assert.equal(inspected.url, 'https://muse.ai/chat/generated-after-send');
  assert.equal(inspected.promptSubmissions, 1);
});

test('cleanup removes only the run-owned tab and returns the prior selection for restoration', async () => {
  const f = fixture();
  await opened(f);
  const cleaned = await f.control.cleanup({ runId: 'run-1', providerId: 'muse' });
  assert.equal(cleaned.removed, true);
  assert.equal(f.control.consumeClosingTab(10), true);
  assert.equal(f.tabs.has(2), true);
  assert.equal(cleaned.previousTarget.tabId, 2);
  await assert.rejects(() => f.control.requireRun('run-1'), (error) => error.code === 'QUALIFICATION_NOT_OWNED');
});


test('qualification recovery capture can resolve the persisted owned target without global selection metadata', async () => {
  const f = fixture();
  const result = await opened(f);
  await f.control.claimPrompt({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
    requestId: 'request-1', text: 'QUALIFY_run-1'
  });
  const ownedTab = f.tabs.get(result.tab.id);
  ownedTab.url = 'https://muse.ai/chat/generated-after-send';
  await f.control.notePrompt({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
    requestId: 'request-1', text: 'QUALIFY_run-1'
  });

  const authorized = await f.control.assertPromptTarget({ runId: 'run-1' });
  assert.equal(authorized.record.providerId, 'muse');
  assert.equal(authorized.tab.id, result.tab.id);
  assert.equal(authorized.currentUrl, 'https://muse.ai/chat/generated-after-send');
});

test('qualification prompt capability is persisted one-shot before provider side effects', async () => {
  const f = fixture();
  const result = await opened(f);
  await f.control.claimPrompt({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
    requestId: 'request-1', text: 'QUALIFY_run-1'
  });
  await assert.rejects(
    () => f.control.claimPrompt({
      runId: 'run-1', providerId: 'muse', tabId: result.tab.id,
      requestId: 'request-2', text: 'QUALIFY_run-1'
    }),
    (error) => error.code === 'QUALIFICATION_PROMPT_CONSUMED'
  );
  const inspected = await f.control.inspect('run-1');
  assert.equal(inspected.promptClaimedRequestId, 'request-1');
  assert.equal(inspected.promptSubmissions, 0);
});

test('qualification cleanup publishes final target state when there was no previous selection', async () => {
  const sent = [];
  let cleared = 0;
  let published = 0;
  const fakeControl = {
    async cleanup() { return { removed: true, previousTarget: null, foregroundAfter: 1 }; }
  };
  const handled = await require('../extension/qualification-control.js').handleCommand(
    fakeControl,
    { type: 'qualification_cleanup', requestId: 'rpc-cleanup', runId: 'run-1', providerId: 'muse' },
    {
      safeSend: (payload) => sent.push(payload),
      clearSelectedTarget: async () => { cleared += 1; },
      publishTabs: async () => { published += 1; },
      getSelection: async () => null
    }
  );
  assert.equal(handled, true);
  assert.equal(cleared, 1);
  assert.equal(published, 1);
  assert.equal(sent.at(-1).data.previousTargetRestored, true);
});


test('cleanup removes a production-created replacement candidate even if adoption never finishes', async () => {
  const f = fixture();
  const result = await opened(f);
  await f.control.closeOwned({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id, url: result.record.url
  });
  f.control.consumeClosingTab(result.tab.id);
  const replacement = await f.chromeApi.tabs.create({ url: result.record.url, active: false });
  await f.control.registerReplacementCandidate({
    runId: 'run-1', providerId: 'muse', url: result.record.url, tab: replacement, created: true
  });
  const before = await f.control.inspect('run-1');
  assert.equal(before.pendingReplacementTabId, replacement.id);
  const cleaned = await f.control.cleanup({ runId: 'run-1', providerId: 'muse' });
  assert.equal(cleaned.removed, true);
  assert.equal(f.tabs.has(replacement.id), false);
  assert.equal(f.tabs.has(2), true);
});


test('replacement candidate registration precedes and authorizes final adoption', async () => {
  const f = fixture();
  const result = await opened(f);
  await f.control.closeOwned({
    runId: 'run-1', providerId: 'muse', tabId: result.tab.id, url: result.record.url
  });
  f.control.consumeClosingTab(result.tab.id);
  const replacement = await f.chromeApi.tabs.create({ url: result.record.url, active: false });
  const registered = await f.control.registerReplacementCandidate({
    runId: 'run-1', providerId: 'muse', url: result.record.url, tab: replacement, created: true
  });
  assert.equal(registered.pendingReplacementTabId, replacement.id);
  const adopted = await f.control.adoptReplacement({
    runId: 'run-1', providerId: 'muse', url: result.record.url, tab: replacement, created: true
  });
  assert.equal(adopted.replacementTabId, replacement.id);
  assert.equal(adopted.pendingReplacementTabId, null);
});


test('pre-existing warm recovery targets are authorized for prompt/capture but never for destructive close', async () => {
  const f = fixture();
  const openedTarget = await opened(f);
  const warmTab = await f.chromeApi.tabs.get(2);
  const bound = await f.control.bindRecoveryTarget({
    runId: 'run-1', providerId: 'muse', tab: warmTab,
    source: 'previous-selected', foregroundBefore: 1,
    selectionBefore: openedTarget.record.previousTarget
  });
  assert.equal(bound.tabId, 2);
  const authorized = await f.control.assertPromptTarget({
    runId: 'run-1', providerId: 'muse', tabId: 2, text: 'QUALIFY_run-1'
  });
  assert.equal(authorized.targetMode, 'preexisting-warm');
  await assert.rejects(
    () => f.control.closeOwned({
      runId: 'run-1', providerId: 'muse', tabId: 2, url: 'https://muse.ai/chat/permanent'
    }),
    (error) => error.code === 'QUALIFICATION_OWNERSHIP_MISMATCH'
  );
  assert.equal(f.tabs.has(2), true);
});

test('cleanup preserves the warm target URL and foreground while removing only qualification-owned tabs', async () => {
  const f = fixture();
  await opened(f);
  const warmTab = await f.chromeApi.tabs.get(2);
  await f.control.bindRecoveryTarget({
    runId: 'run-1', providerId: 'muse', tab: warmTab,
    source: 'single-ready-candidate', foregroundBefore: 1, selectionBefore: null
  });
  const cleaned = await f.control.cleanup({ runId: 'run-1', providerId: 'muse' });
  assert.equal(cleaned.recoveryTargetUsed, true);
  assert.equal(cleaned.warmTargetPreserved, true);
  assert.equal(cleaned.warmTargetUrlUnchanged, true);
  assert.equal(cleaned.focusSteal, false);
  assert.equal(f.tabs.has(2), true);
  assert.equal(f.tabs.has(10), false);
});


test('warm prompt bookkeeping preserves disposable ownership URL across restart state', async () => {
  const f = fixture();
  const openedTarget = await opened(f);
  const disposableUrl = openedTarget.record.url;
  const warmTab = await f.chromeApi.tabs.get(2);
  await f.control.bindRecoveryTarget({
    runId: 'run-1', providerId: 'muse', tab: warmTab,
    source: 'previous-selected', foregroundBefore: 1,
    selectionBefore: openedTarget.record.previousTarget
  });
  await f.control.claimPrompt({
    runId: 'run-1', providerId: 'muse', tabId: 2,
    requestId: 'warm-request', text: 'QUALIFY_run-1'
  });
  await f.control.notePrompt({
    runId: 'run-1', providerId: 'muse', tabId: 2,
    requestId: 'warm-request', text: 'QUALIFY_run-1'
  });
  const inspected = await f.control.inspect('run-1');
  assert.equal(inspected.url, disposableUrl);
  assert.equal(inspected.recoveryTarget.url, 'https://muse.ai/chat/permanent');
  assert.equal(inspected.promptSubmissions, 1);
});


test('cleanup focus invariant is measured after previous target restoration', async () => {
  const sent = [];
  let active = 1;
  const fakeControl = {
    async cleanup() {
      return {
        removed: true,
        previousTarget: { tabId: 2, providerId: 'muse' },
        recoveryTarget: { tabId: 3, providerId: 'muse', url: 'https://muse.ai/', foregroundBefore: 1 },
        foregroundAfter: 1
      };
    }
  };
  const handled = await require('../extension/qualification-control.js').handleCommand(
    fakeControl,
    { type: 'qualification_cleanup', requestId: 'rpc-cleanup-focus', runId: 'run-1', providerId: 'muse' },
    {
      safeSend: (payload) => sent.push(payload),
      chromeApi: { tabs: { async query() { return [{ id: active }]; } } },
      async selectTarget() { active = 9; },
      async publishTabs() {},
      async getSelection() { return { tabId: 2, providerId: 'muse' }; }
    }
  );
  assert.equal(handled, true);
  assert.equal(sent.at(-1).data.previousTargetRestored, true);
  assert.equal(sent.at(-1).data.foregroundAfter, 9);
  assert.equal(sent.at(-1).data.focusSteal, true);
});
