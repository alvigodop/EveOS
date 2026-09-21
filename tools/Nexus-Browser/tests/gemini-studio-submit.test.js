const test = require('node:test');
const assert = require('node:assert/strict');
const submit = require('../extension/gemini-studio-submit.js');

test('AI Studio submission detection accepts clear, user-turn advance, or generating state', () => {
  assert.equal(submit.submissionObserved({ value: '', userTurns: 3, generating: false }, 'hello', 3), true);
  assert.equal(submit.submissionObserved({ value: 'hello', userTurns: 4, generating: false }, 'hello', 3), true);
  assert.equal(submit.submissionObserved({ value: 'hello', userTurns: 3, generating: true }, 'hello', 3), true);
  assert.equal(submit.submissionObserved({ value: 'hello', userTurns: 3, generating: true }, 'hello', 3, true), false);
  assert.equal(submit.submissionObserved({ value: 'hello', userTurns: 3, generating: false }, 'hello', 3), false);
});

test('AI Studio service-worker submit clicks Run even when its pre-click snapshot says disabled', async () => {
  let clicked = false;
  const ops = {
    async inspect() {
      if (!clicked) {
        return {
          composerFound: true,
          value: 'hello',
          runFound: true,
          runDisabled: true,
          userTurns: 2,
          generating: false
        };
      }
      return {
        composerFound: true,
        value: '',
        runFound: true,
        runDisabled: true,
        userTurns: 3,
        generating: true
      };
    },
    async setPrompt(text) {
      assert.equal(text, 'hello');
      return { ok: true };
    },
    async clickRun() {
      clicked = true;
      return { ok: true };
    },
    async enter() {
      throw new Error('plain Enter should not be needed');
    },
    async shortcut() {
      throw new Error('shortcut should not be needed');
    }
  };

  const result = await submit.submitAiStudioPrompt({
    tabId: 42,
    text: 'hello',
    ops,
    delay: async () => {},
    composerTimeoutMs: 100,
    runTimeoutMs: 100,
    verifyTimeoutMs: 100
  });

  assert.deepEqual(result, { ok: true, method: 'run' });
  assert.equal(clicked, true);
});

test('AI Studio service-worker submit tries plain Enter before Ctrl/Cmd+Enter', async () => {
  let entered = false;
  let shortcut = false;
  const ops = {
    async inspect() {
      return {
        composerFound: true,
        value: entered ? '' : 'hello',
        runFound: true,
        runDisabled: false,
        userTurns: entered ? 2 : 1,
        generating: entered
      };
    },
    async setPrompt() { return { ok: true }; },
    async clickRun() { return { ok: true }; },
    async enter() { entered = true; return { ok: true }; },
    async shortcut() { shortcut = true; return { ok: true }; }
  };

  const result = await submit.submitAiStudioPrompt({
    tabId: 42,
    text: 'hello',
    ops,
    delay: async () => {},
    composerTimeoutMs: 30,
    runTimeoutMs: 30,
    verifyTimeoutMs: 1
  });

  assert.deepEqual(result, { ok: true, method: 'enter' });
  assert.equal(entered, true);
  assert.equal(shortcut, false);
});

test('AI Studio service-worker submit falls back to modified shortcut only after Run and Enter fail verification', async () => {
  let shortcut = false;
  const ops = {
    async inspect() {
      return {
        composerFound: true,
        value: shortcut ? '' : 'hello',
        runFound: true,
        runDisabled: false,
        userTurns: shortcut ? 2 : 1,
        generating: shortcut
      };
    },
    async setPrompt() { return { ok: true }; },
    async clickRun() { return { ok: true }; },
    async enter() { return { ok: true }; },
    async shortcut() { shortcut = true; return { ok: true }; }
  };

  const result = await submit.submitAiStudioPrompt({
    tabId: 42,
    text: 'hello',
    ops,
    delay: async () => {},
    composerTimeoutMs: 30,
    runTimeoutMs: 30,
    verifyTimeoutMs: 1
  });

  assert.deepEqual(result, { ok: true, method: 'shortcut' });
});

test('AI Studio main-world scripting is requested for host-page event handling', async () => {
  let injection = null;
  const scriptingApi = {
    async executeScript(options) {
      injection = options;
      return [{ result: { composerFound: false, value: '', runFound: false, runDisabled: true, userTurns: 0, generating: false } }];
    }
  };
  await submit.inspectAiStudio(42, scriptingApi);
  assert.equal(injection.target.tabId, 42);
  assert.equal(injection.world, 'MAIN');
});

test('AI Studio service-worker submit waits for in-flight generation to complete before injecting next prompt', async () => {
  let inspectCount = 0;
  let clicked = false;
  const ops = {
    async inspect() {
      inspectCount += 1;
      if (inspectCount === 1) {
        return {
          composerFound: true,
          value: '',
          runFound: false,
          runDisabled: true,
          userTurns: 2,
          generating: true
        };
      }
      return {
        composerFound: true,
        value: clicked ? '' : 'second prompt',
        runFound: true,
        runDisabled: false,
        userTurns: clicked ? 3 : 2,
        generating: clicked
      };
    },
    async setPrompt() { return { ok: true }; },
    async clickRun() { clicked = true; return { ok: true }; },
    async enter() { throw new Error('should not use enter'); },
    async shortcut() { throw new Error('should not use shortcut'); }
  };

  const result = await submit.submitAiStudioPrompt({
    tabId: 42,
    text: 'second prompt',
    ops,
    delay: async () => {},
    composerTimeoutMs: 50,
    waitGeneratingTimeoutMs: 200,
    runTimeoutMs: 50,
    verifyTimeoutMs: 10
  });

  assert.deepEqual(result, { ok: true, method: 'run' });
  assert.ok(inspectCount >= 2);
  assert.equal(clicked, true);
});

test('AI Studio installs anti-throttling active shim in MAIN world', async () => {
  let injection = null;
  const scriptingApi = {
    async executeScript(options) {
      injection = options;
      return [{ result: true }];
    }
  };
  const result = await submit.ensureAiStudioActive(42, scriptingApi);
  assert.equal(result, true);
  assert.equal(injection.target.tabId, 42);
  assert.equal(injection.world, 'MAIN');
});