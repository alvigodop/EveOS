'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../extension/background-dispatch.js');

function fixture({ active = false, state = 'normal' } = {}) {
  const calls = [];
  const target = { id: 7, windowId: 3, active, autoDiscardable: true };
  const previous = { id: 9, windowId: 3, active: !active };
  const chromeApi = {
    tabs: {
      async get(id) { assert.equal(id, 7); calls.push(['tab.get', id]); return target; },
      async query(query) { calls.push(['tab.query', query]); return active ? [target] : [previous]; },
      async update(id, changes) { calls.push(['tab.update', id, changes]); return { id, ...changes }; },
      async sendMessage(id, message) { calls.push(['tab.send', id, message.type]); return { ok: true }; }
    },
    windows: {
      async get(id) { calls.push(['window.get', id]); return { id, state, focused: false }; },
      async update(id, changes) { calls.push(['window.update', id, changes]); return { id, ...changes }; }
    }
  };
  return { chromeApi, calls };
}

test('background dispatch activates target without focusing its window and restores the prior tab', async () => {
  const f = fixture();
  const result = await api.sendMessage(7, { type: 'send_prompt' }, f.chromeApi, { sleepImpl: async () => {} });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'tab.update'), [
    ['tab.update', 7, { active: true, autoDiscardable: false }],
    ['tab.update', 9, { active: true }]
  ]);
  assert.equal(f.calls.some(([kind, , changes]) => kind === 'window.update' && changes.focused === true), false);
  assert.ok(f.calls.findIndex(([kind]) => kind === 'tab.send') > f.calls.findIndex(([kind, id]) => kind === 'tab.update' && id === 7));
});

test('minimized provider window is restored only for dispatch then returned to minimized state', async () => {
  const f = fixture({ state: 'minimized' });
  await api.sendMessage(7, { type: 'send_prompt' }, f.chromeApi, { sleepImpl: async () => {} });
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'window.update'), [
    ['window.update', 3, { state: 'normal' }],
    ['window.update', 3, { state: 'minimized' }]
  ]);
});

test('already-active target is not toggled but automatic discarding is disabled', async () => {
  const f = fixture({ active: true });
  await api.sendMessage(7, { type: 'send_prompt' }, f.chromeApi, { sleepImpl: async () => {} });
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'tab.update'), [
    ['tab.update', 7, { autoDiscardable: false }]
  ]);
});

test('restoration does not hide a committed provider result with a false retry signal', async () => {
  const f = fixture({ state: 'minimized' });
  f.chromeApi.windows.update = async (id, changes) => {
    f.calls.push(['window.update', id, changes]);
    if (changes.state === 'minimized') throw new Error('window closed after commit');
    return { id, ...changes };
  };
  const result = await api.sendMessage(7, { type: 'send_prompt' }, f.chromeApi, { sleepImpl: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(f.calls.filter(([kind]) => kind === 'tab.send').length, 1);
});
