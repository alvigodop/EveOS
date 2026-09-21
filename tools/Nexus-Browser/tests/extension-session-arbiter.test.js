'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExtensionSessionArbiter } = require('../dex/extension-session-arbiter');

function fakeSocket(name) {
  return { name, open: true };
}

function tabs(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, title: `${prefix}-${index + 1}` }));
}

test('zero-tab newcomer cannot replace a healthy populated primary', () => {
  const arbiter = createExtensionSessionArbiter({ isOpen: (socket) => socket.open });
  const populated = fakeSocket('populated');
  const empty = fakeSocket('empty');

  arbiter.register(populated);
  arbiter.update(populated, { tabs: tabs(14, 'provider') });
  arbiter.register(empty);
  const state = arbiter.update(empty, { tabs: [] });

  assert.equal(state.socket, populated);
  assert.equal(state.snapshot.tabs.length, 14);
  assert.deepEqual(arbiter.diagnostics(), {
    connected: 2,
    primaryReady: true,
    primaryTabs: 14,
    standby: [{ ready: true, tabs: 0 }]
  });
});

test('populated session promotes over an empty primary', () => {
  const arbiter = createExtensionSessionArbiter({ isOpen: (socket) => socket.open });
  const empty = fakeSocket('empty');
  const populated = fakeSocket('populated');

  arbiter.register(empty);
  arbiter.update(empty, { tabs: [] });
  arbiter.register(populated);
  const state = arbiter.update(populated, { tabs: tabs(14, 'provider') });

  assert.equal(state.socket, populated);
  assert.equal(state.snapshot.tabs.length, 14);
});

test('real zero-tab state is preserved when all live sessions report zero', () => {
  const arbiter = createExtensionSessionArbiter({ isOpen: (socket) => socket.open });
  const a = fakeSocket('a');
  const b = fakeSocket('b');

  arbiter.register(a);
  arbiter.update(a, { tabs: tabs(2, 'provider') });
  arbiter.register(b);
  arbiter.update(b, { tabs: [] });
  const state = arbiter.update(a, { tabs: [] });

  assert.equal(state.socket, a);
  assert.equal(state.snapshot.tabs.length, 0);
});

test('disconnecting primary promotes the best remaining live session', () => {
  const arbiter = createExtensionSessionArbiter({ isOpen: (socket) => socket.open });
  const primary = fakeSocket('primary');
  const standby = fakeSocket('standby');

  arbiter.register(primary);
  arbiter.update(primary, { tabs: tabs(14, 'primary') });
  arbiter.register(standby);
  arbiter.update(standby, { tabs: tabs(6, 'standby') });

  primary.open = false;
  const state = arbiter.drop(primary);

  assert.equal(state.wasPrimary, true);
  assert.equal(state.socket, standby);
  assert.equal(state.snapshot.tabs.length, 6);
});
