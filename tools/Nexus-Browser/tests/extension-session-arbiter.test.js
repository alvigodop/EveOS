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
  const diagnostics = arbiter.diagnostics();
  assert.equal(diagnostics.connected, 2);
  assert.equal(diagnostics.primaryReady, true);
  assert.equal(diagnostics.primaryTabs, 14);
  assert.match(diagnostics.primarySessionId, /^extension-/);
  assert.deepEqual(diagnostics.standby.map((entry) => ({ ready: entry.ready, tabs: entry.tabs })), [{ ready: true, tabs: 0 }]);
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

test('richer populated session becomes authoritative without smaller-session flapping', () => {
  const arbiter = createExtensionSessionArbiter({ isOpen: (socket) => socket.open });
  const small = fakeSocket('small');
  const rich = fakeSocket('rich');

  arbiter.register(small);
  arbiter.update(small, { tabs: tabs(1, 'small') });
  arbiter.register(rich);
  let state = arbiter.update(rich, { tabs: tabs(14, 'rich') });

  assert.equal(state.socket, rich);
  assert.equal(state.snapshot.tabs.length, 14);

  state = arbiter.update(small, { tabs: tabs(2, 'small') });
  assert.equal(state.socket, rich);
  assert.equal(state.snapshot.tabs.length, 14);
});

test('real zero-tab profile converges after bounded grace without losing the previous rich UI meanwhile', () => {
  let clock = 0, timer = null;
  const notifications = [];
  const arbiter = createExtensionSessionArbiter({
    isOpen: (socket) => socket.open, now: () => clock, emptyGraceMs: 100,
    setTimer: (fn) => { timer = fn; return 1; }, clearTimer: () => { timer = null; },
    onAuthoritySettled: (value) => notifications.push(value)
  });
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  arbiter.register(a);
  arbiter.update(a, { tabs: tabs(2, 'provider') });
  arbiter.register(b);
  arbiter.update(b, { tabs: [] });
  const provisional = arbiter.update(a, { tabs: [] });
  assert.equal(provisional.ready, false);
  assert.equal(provisional.pendingEmpty, true);
  assert.equal(provisional.snapshot.tabs.length, 2);
  assert.equal(notifications.length, 0);
  clock = 100;
  timer();
  const settled = arbiter.current();
  assert.equal(settled.ready, true);
  assert.equal(settled.snapshot.tabs.length, 0);
  assert.equal(notifications.length, 1);
  assert.equal(arbiter.diagnostics().pendingEmpty, false);
});

test('empty-first then rich second never publishes transient authoritative zero within grace', () => {
  let clock = 0;
  const timers = new Map();
  let nextTimer = 0;
  const notifications = [];
  const arbiter = createExtensionSessionArbiter({
    isOpen: (socket) => socket.open, now: () => clock, emptyGraceMs: 250,
    setTimer: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimer: (id) => timers.delete(id),
    onAuthoritySettled: (value) => notifications.push(value)
  });
  const empty = fakeSocket('empty');
  const rich = fakeSocket('rich');
  arbiter.register(empty);
  const initial = arbiter.update(empty, { tabs: [] });
  assert.equal(initial.ready, false);
  assert.equal(initial.snapshot, null);
  const staleTimers = [...timers.values()];
  arbiter.register(rich);
  const promoted = arbiter.update(rich, { tabs: tabs(12, 'rich') });
  assert.equal(promoted.ready, true);
  assert.equal(promoted.socket, rich);
  assert.equal(promoted.snapshot.tabs.length, 12);
  clock = 300;
  staleTimers.forEach((fn) => fn());
  assert.equal(notifications.length, 0);
  assert.equal(arbiter.current().snapshot.tabs.length, 12);
});

test('single genuinely empty profile publishes zero after deadline without another message', () => {
  let clock = 0, timer = null;
  const notifications = [];
  const arbiter = createExtensionSessionArbiter({
    now: () => clock, emptyGraceMs: 50,
    setTimer: (fn) => { timer = fn; return 1; }, clearTimer: () => { timer = null; },
    onAuthoritySettled: (value) => notifications.push(value)
  });
  const empty = fakeSocket('empty');
  arbiter.register(empty);
  const first = arbiter.update(empty, { tabs: [], target: { id: 900 } });
  assert.equal(first.ready, false);
  assert.equal(first.snapshot, null);
  clock = 50;
  timer();
  assert.equal(arbiter.current().ready, true);
  assert.deepEqual(arbiter.current().snapshot.tabs, []);
  assert.equal(arbiter.current().snapshot.target, null);
  assert.equal(notifications.length, 1);
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

test('diagnostics retain bounded connection epochs, election reasons, and changed snapshots only', () => {
  let clock = 1000;
  const arbiter = createExtensionSessionArbiter({ isOpen: (socket) => socket.open, now: () => ++clock, maxTransitions: 8 });
  const primary = fakeSocket('primary');
  const standby = fakeSocket('standby');
  arbiter.register(primary);
  arbiter.update(primary, { tabs: tabs(2, 'primary'), providers: [{ id: 'chatgpt' }] });
  arbiter.update(primary, { tabs: tabs(2, 'primary'), providers: [{ id: 'chatgpt' }] });
  arbiter.register(standby);
  arbiter.update(standby, { tabs: [] });
  primary.open = false;
  arbiter.drop(primary, { closeCode: 1006, closeReason: 'transport lost' });

  const diagnostics = arbiter.diagnostics();
  assert.equal(diagnostics.primaryConnectionEpoch, 2);
  assert.ok(diagnostics.recentTransitions.length <= 8);
  assert.equal(diagnostics.recentTransitions.filter((entry) => entry.type === 'snapshot-changed' && entry.sessionId === 'extension-1').length, 1);
  assert.ok(diagnostics.recentTransitions.some((entry) => entry.type === 'disconnected' && entry.closeCode === 1006));
  assert.ok(diagnostics.recentTransitions.some((entry) => entry.type === 'primary-changed' && entry.reason === 'promote-after-disconnect'));
});
