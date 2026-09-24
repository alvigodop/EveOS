const test = require('node:test');
const assert = require('node:assert/strict');
const poll = require('../extension/gemini-background-poll.js');

test('AI Studio background poll only applies to the Gemini AI Studio frontend', () => {
  assert.equal(poll.isAiStudioTarget({ id: 'gemini' }, { url: 'https://aistudio.google.com/prompts/abc' }), true);
  assert.equal(poll.isAiStudioTarget({ id: 'gemini' }, { url: 'https://gemini.google.com/app/abc' }), false);
  assert.equal(poll.isAiStudioTarget({ id: 'claude' }, { url: 'https://aistudio.google.com/prompts/abc' }), false);
});

test('AI Studio correlation rejects a stale previous reply even when turn counts advanced', () => {
  assert.equal(poll.isFreshAiStudioSample({
    count: 6,
    userCount: 6,
    text: 'OLD_REPLY',
    promptMatched: false,
    lastUserText: 'previous prompt',
    modelAfterUserCount: 1
  }, {
    count: 5,
    userCount: 5
  }, 'new prompt'), false);
});

test('AI Studio correlation accepts only the model reply after the matching newest user turn', () => {
  assert.equal(poll.isFreshAiStudioSample({
    count: 6,
    userCount: 6,
    text: 'NEW_REPLY',
    promptMatched: true,
    lastUserText: 'new prompt',
    modelAfterUserCount: 1
  }, {
    count: 5,
    userCount: 5
  }, 'new prompt'), true);
});

test('AI Studio correlation supports repeated identical prompts without using response text identity', () => {
  assert.equal(poll.isFreshAiStudioSample({
    count: 9,
    userCount: 9,
    text: 'Same answer is legitimate.',
    promptMatched: true,
    lastUserText: 'test',
    modelAfterUserCount: 1
  }, {
    count: 8,
    userCount: 8,
    text: 'Same answer is legitimate.'
  }, 'test'), true);
});

test('AI Studio finalization never accepts a fresh partial response immediately', () => {
  assert.equal(poll.shouldFinalizeAiStudioSample({
    generating: false,
    ready: true,
    sawGenerating: true,
    stableForMs: 100,
    generationEndedForMs: 100
  }), false);
  assert.equal(poll.shouldFinalizeAiStudioSample({
    generating: false,
    ready: true,
    sawGenerating: false,
    stableForMs: 100,
    generationEndedForMs: 0
  }), false);
});

test('AI Studio finalization waits for settled text after observed generation', () => {
  assert.equal(poll.shouldFinalizeAiStudioSample({
    generating: false,
    ready: true,
    sawGenerating: true,
    stableForMs: 799,
    generationEndedForMs: 600
  }), false);
  assert.equal(poll.shouldFinalizeAiStudioSample({
    generating: false,
    ready: true,
    sawGenerating: true,
    stableForMs: 800,
    generationEndedForMs: 600
  }), true);
});

test('AI Studio finalization requires a longer settle when generation UI was not observed', () => {
  assert.equal(poll.shouldFinalizeAiStudioSample({
    generating: false,
    ready: true,
    sawGenerating: false,
    stableForMs: 1999,
    generationEndedForMs: 0
  }), false);
  assert.equal(poll.shouldFinalizeAiStudioSample({
    generating: false,
    ready: true,
    sawGenerating: false,
    stableForMs: 2000,
    generationEndedForMs: 0
  }), true);
});

test('AI Studio finalization refuses text while Stop/Cancel generation state is active', () => {
  assert.equal(poll.shouldFinalizeAiStudioSample({
    generating: true,
    ready: true,
    sawGenerating: true,
    stableForMs: 10000,
    generationEndedForMs: 10000
  }), false);
});

test('AI Studio background poll emits only text correlated to the current prompt', async () => {
  const requestId = `bg-${Date.now()}`;
  const events = [];
  const tabsApi = {
    async get() {
      return { id: 42, active: true, discarded: false, url: 'https://aistudio.google.com/prompts/abc' };
    }
  };
  const scriptingApi = {
    async executeScript() {
      return [{
        result: {
          count: 2,
          userCount: 2,
          text: 'PARTIAL_BACKGROUND_TEXT',
          generating: false,
          ready: true,
          promptMatched: true,
          lastUserText: 'hello bridge',
          modelAfterUserCount: 1
        }
      }];
    }
  };

  poll.startAiStudioResponsePoll({
    tabId: 42,
    requestId,
    baseline: { count: 1, userCount: 1, text: 'OLD' },
    expectedPrompt: 'hello bridge',
    send(event) { events.push(event); },
    tabsApi,
    scriptingApi,
    intervalMs: 5,
    timeoutMs: 500
  });

  await new Promise((resolve) => setTimeout(resolve, 35));
  poll.stopResponsePoll(requestId);

  assert.ok(events.some((event) =>
    event.type === 'response_partial' && event.text === 'PARTIAL_BACKGROUND_TEXT'
  ));
  assert.equal(events.some((event) => event.type === 'response_final'), false);
});

test('AI Studio compatibility pulse is passive and forwards expected prompt without tab activation', async () => {
  const tabUpdates = [];
  const argsSeen = [];
  const tabsApi = {
    async get(id) {
      return { id, windowId: 3, active: false, discarded: false };
    },
    async update(id, changes) {
      tabUpdates.push({ id, changes });
      return { id, windowId: 3, ...changes };
    }
  };
  const scriptingApi = {
    async executeScript(options) {
      argsSeen.push(options.args);
      return [{ result: {
        count: 2,
        userCount: 2,
        text: 'PASSIVE_OK',
        generating: false,
        ready: true,
        promptMatched: true,
        lastUserText: 'wake prompt',
        modelAfterUserCount: 1
      } }];
    }
  };

  const sample = await poll.pulseAiStudioTab(42, tabsApi, scriptingApi, 0, 'wake prompt');

  assert.equal(sample.text, 'PASSIVE_OK');
  assert.deepEqual(tabUpdates, []);
  assert.ok(argsSeen.some((args) => args?.[0] === 'wake prompt'));
});

test('AI Studio compatibility pulse never mutates window focus or state', async () => {
  const windowUpdates = [];
  const tabsApi = {
    async get(id) {
      return { id, windowId: 12, active: true, discarded: false };
    }
  };
  const windowsApi = {
    async update(windowId, changes) {
      windowUpdates.push({ windowId, changes });
      return { id: windowId, ...changes };
    }
  };
  const scriptingApi = {
    async executeScript() {
      return [{ result: {
        count: 2,
        userCount: 2,
        text: 'PASSIVE_WINDOW_OK',
        generating: false,
        ready: true,
        promptMatched: true,
        lastUserText: 'wake prompt',
        modelAfterUserCount: 1
      } }];
    }
  };

  const sample = await poll.pulseAiStudioTab(42, tabsApi, scriptingApi, 0, 'wake prompt', windowsApi, true);
  assert.equal(sample.text, 'PASSIVE_WINDOW_OK');
  assert.deepEqual(windowUpdates, []);
});

test('AI Studio background poll never wakes tabs or windows when samples stall', async () => {
  const requestId = `passive-${Date.now()}`;
  const events = [];
  const tabUpdates = [];
  const windowUpdates = [];
  const tabsApi = {
    async get() {
      return { id: 42, active: false, discarded: false, url: 'https://aistudio.google.com/prompts/abc', windowId: 10 };
    },
    async update(id, changes) {
      tabUpdates.push({ id, changes });
      return { id, ...changes };
    }
  };
  const scriptingApi = {
    async executeScript() {
      return [{
        result: {
          count: 2,
          userCount: 2,
          text: 'STALLED_TEXT',
          generating: true,
          ready: false,
          promptMatched: true,
          lastUserText: 'test prompt',
          modelAfterUserCount: 1
        }
      }];
    }
  };
  const windowsApi = {
    async update(windowId, changes) {
      windowUpdates.push({ windowId, changes });
      return { id: windowId, ...changes };
    }
  };

  poll.startAiStudioResponsePoll({
    tabId: 42,
    requestId,
    baseline: { count: 1, userCount: 1, text: 'OLD' },
    expectedPrompt: 'test prompt',
    send(event) { events.push(event); },
    tabsApi,
    scriptingApi,
    windowsApi,
    intervalMs: 10,
    timeoutMs: 500,
    wakeAfterTicks: 1,
    wakeCooldownMs: 1,
    wakeDelayMs: 0
  });

  await new Promise((resolve) => setTimeout(resolve, 80));
  poll.stopResponsePoll(requestId);

  assert.ok(events.some((event) => event.type === 'response_partial' && event.text === 'STALLED_TEXT'));
  assert.deepEqual(tabUpdates, []);
  assert.deepEqual(windowUpdates, []);
});

test('AI Studio background poll never auto-minimizes or focuses the popup on finalization', async () => {
  const requestId = `no-window-mutation-${Date.now()}`;
  const events = [];
  const windowUpdates = [];
  const tabsApi = {
    async get(id) {
      return { id, active: true, discarded: false, url: 'https://aistudio.google.com/prompts/abc', windowId: 55 };
    }
  };
  const scriptingApi = {
    async executeScript() {
      return [{
        result: {
          count: 2,
          userCount: 2,
          text: 'COMPLETED_TEXT',
          generating: false,
          ready: true,
          promptMatched: true,
          lastUserText: 'done prompt',
          modelAfterUserCount: 1
        }
      }];
    }
  };
  const windowsApi = {
    async update(windowId, changes) {
      windowUpdates.push({ windowId, changes });
      return { id: windowId, ...changes };
    }
  };

  poll.startAiStudioResponsePoll({
    tabId: 42,
    targetWindowId: 55,
    requestId,
    baseline: { count: 1, userCount: 1, text: 'OLD' },
    expectedPrompt: 'done prompt',
    send(event) { events.push(event); },
    tabsApi,
    scriptingApi,
    windowsApi,
    minimizeOnFinish: true,
    intervalMs: 10,
    timeoutMs: 5000
  });

  await new Promise((resolve) => setTimeout(resolve, 2050));
  poll.stopResponsePoll(requestId);

  assert.ok(events.some((event) => event.type === 'response_final'), 'Expected response_final event');
  assert.deepEqual(windowUpdates, []);
});

test('stalled partial times out as an error, never a fabricated settled final', async () => {
  const requestId = 'studio-timeout-partial';
  const events = [];
  const tabsApi = { get: async () => ({ id: 42, discarded: false, active: false, windowId: 12 }) };
  const scriptingApi = {
    executeScript: async () => [{ result: {
      count: 2, userCount: 2, text: 'PARTIAL_ONLY', generating: true, ready: false,
      promptMatched: true, lastUserText: 'hello', modelAfterUserCount: 1
    } }]
  };
  poll.startAiStudioResponsePoll({
    tabId: 42, requestId, baseline: { count: 1, userCount: 1 },
    expectedPrompt: 'hello', send: (event) => events.push(event), tabsApi,
    scriptingApi, intervalMs: 5, timeoutMs: 40
  });
  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(events.some((event) => event.type === 'response_partial'), true);
  assert.equal(events.some((event) => event.type === 'response_final'), false);
  assert.equal(events.some((event) => event.type === 'adapter_error' && event.code === 'RESPONSE_TIMEOUT'), true);
  poll.stopResponsePoll(requestId);
});
