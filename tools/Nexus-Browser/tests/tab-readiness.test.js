'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../extension/tab-readiness.js');

test('normal complete tab passes without a document probe', async () => {
  let probes = 0;
  const chromeApi = {
    tabs: { async get() { return { id: 7, status: 'complete' }; } },
    scripting: { async executeScript() { probes += 1; return [{ result: true }]; } }
  };
  assert.equal((await api.waitForTabComplete(7, chromeApi)).id, 7);
  assert.equal(probes, 0);
});

test('SPA tab with lingering loading status passes when its document is interactive', async () => {
  const chromeApi = {
    tabs: { async get() { return { id: 7, status: 'loading', url: 'https://chat.deepseek.com/' }; } },
    scripting: { async executeScript() { return [{ result: true }]; } }
  };
  assert.equal((await api.waitForTabComplete(7, chromeApi)).status, 'loading');
});

test('unready document still times out instead of admitting a half-loaded target', async () => {
  let now = 0;
  const chromeApi = {
    tabs: { async get() { return { id: 7, status: 'loading' }; } },
    scripting: { async executeScript() { return [{ result: false }]; } }
  };
  await assert.rejects(() => api.waitForTabComplete(7, chromeApi, {
    timeoutMs: 5, pollMs: 1, nowImpl: () => now, sleepImpl: async () => { now += 1; }
  }), /runtime readiness/);
});
