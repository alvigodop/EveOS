const test = require('node:test');
const assert = require('node:assert/strict');
const syncApi = require('../public/dex-state-sync.js');

function memoryStorage(seed = {}) {
  const values = { ...seed };
  return {
    getItem(key) { return values[key] ?? null; },
    setItem(key, value) { values[key] = value; },
    values
  };
}

function normalize(room) {
  return { ...room, relay: { ...(room.relay || {}), active: false, waitingFor: null, remaining: 0 } };
}
function fallback(index = 1) {
  return { id: `room-${index}`, name: `Room ${index}`, members: [], messages: [], updatedAt: '2026-09-18T00:00:00.000Z', relay: {} };
}

test('Dex state sync prefers a newer localhost snapshot over stale browser storage', () => {
  const storage = memoryStorage({
    rooms: JSON.stringify([{ id: 'local', name: 'Local', updatedAt: '2026-09-18T08:00:00.000Z' }])
  });
  const state = { rooms: [], activeRoomId: null };
  const sent = [];
  const sync = syncApi.createSync({
    state, storageKey: 'rooms', storage, normalizeRoom: normalize, defaultRoom: fallback,
    send: (payload) => { sent.push(payload); return true; },
    now: () => '2026-09-18T08:10:00.000Z'
  });
  sync.loadLocal();
  const result = sync.applyRemote({
    rooms: [{ id: 'remote', name: 'Remote', updatedAt: '2026-09-18T08:05:00.000Z' }],
    activeRoomId: 'remote',
    savedAt: '2026-09-18T08:06:00.000Z'
  });
  assert.equal(result.applied, true);
  assert.equal(state.rooms[0].id, 'remote');
  assert.equal(state.activeRoomId, 'remote');
});

test('Dex state sync preserves newer browser state and pushes it back to localhost', () => {
  const storage = memoryStorage({
    rooms: JSON.stringify([{ id: 'local', name: 'Local', updatedAt: '2026-09-18T08:10:00.000Z' }])
  });
  const state = { rooms: [], activeRoomId: null };
  const sent = [];
  const sync = syncApi.createSync({
    state, storageKey: 'rooms', storage, normalizeRoom: normalize, defaultRoom: fallback,
    send: (payload) => { sent.push(payload); return true; },
    now: () => '2026-09-18T08:11:00.000Z'
  });
  sync.loadLocal();
  const result = sync.applyRemote({
    rooms: [{ id: 'remote', name: 'Remote', updatedAt: '2026-09-18T08:00:00.000Z' }],
    activeRoomId: 'remote',
    savedAt: '2026-09-18T08:01:00.000Z'
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'local-newer');
  assert.equal(state.rooms[0].id, 'local');
  assert.equal(sent.at(-1).type, 'dex_state_put');
});

test('Dex state sync pushes local state when localhost has no snapshot yet', () => {
  const state = { rooms: [], activeRoomId: null };
  const sent = [];
  const sync = syncApi.createSync({
    state, storageKey: 'rooms', storage: memoryStorage(), normalizeRoom: normalize, defaultRoom: fallback,
    send: (payload) => { sent.push(payload); return true; },
    now: () => '2026-09-18T08:12:00.000Z'
  });
  sync.loadLocal();
  const result = sync.applyRemote(null);
  assert.equal(result.reason, 'remote-empty');
  assert.equal(sent.at(-1).type, 'dex_state_put');
});


test('normal Dex persistence coalesces rapid localhost mirror writes', () => {
  const state = { rooms: [], activeRoomId: null };
  const storage = memoryStorage();
  const sent = [];
  const scheduled = [];
  const sync = syncApi.createSync({
    state, storageKey: 'rooms', storage, normalizeRoom: normalize, defaultRoom: fallback,
    send: (payload) => { sent.push(payload); return true; },
    now: () => '2026-09-18T08:13:00.000Z',
    remoteDelayMs: 35,
    setTimer(fn) { scheduled.push(fn); return scheduled.length; },
    clearTimer() {}
  });
  sync.loadLocal();
  state.rooms[0].name = 'One';
  sync.persist();
  state.rooms[0].name = 'Two';
  sync.persist();
  state.rooms[0].name = 'Three';
  sync.persist();
  assert.equal(sent.length, 0);
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].snapshot.rooms[0].name, 'Three');
});

test('critical Dex persistence bypasses debounce for recovery journals', () => {
  const state = { rooms: [], activeRoomId: null };
  const sent = [];
  const sync = syncApi.createSync({
    state, storageKey: 'rooms', storage: memoryStorage(), normalizeRoom: normalize, defaultRoom: fallback,
    send: (payload) => { sent.push(payload); return true; },
    now: () => '2026-09-18T08:14:00.000Z',
    setTimer() { throw new Error('critical write must not schedule'); },
    clearTimer() {}
  });
  sync.loadLocal();
  sync.persist({ immediate: true });
  assert.equal(sent.length, 1);
});


test('server runtime work overrides a newer stale browser mirror during reconnect', () => {
  const storage = memoryStorage({
    rooms: JSON.stringify([{
      id: 'room-1',
      name: 'Stale Browser Copy',
      updatedAt: '2026-09-18T23:59:00.000Z',
      relay: { active: false, waitingFor: null, remaining: 0 }
    }])
  });
  const state = { rooms: [], activeRoomId: null };
  const sent = [];
  const sync = syncApi.createSync({
    state, storageKey: 'rooms', storage, normalizeRoom: normalize, defaultRoom: fallback,
    send: (payload) => { sent.push(payload); return true; },
    now: () => '2026-09-19T00:00:00.000Z'
  });
  sync.loadLocal();
  const result = sync.applyRemote({
    rooms: [{
      id: 'room-1',
      name: 'Server Runtime',
      updatedAt: '2026-09-18T23:58:00.000Z',
      relay: { active: false, waitingFor: null, remaining: 0 },
      recovery: { requestId: 'dex-turn-1', memberId: 'eve', sourceMessageId: 'm1' }
    }],
    activeRoomId: 'room-1',
    savedAt: '2026-09-18T23:58:01.000Z'
  });
  assert.equal(result.applied, true);
  assert.equal(state.rooms[0].name, 'Server Runtime');
  assert.equal(state.rooms[0].recovery.requestId, 'dex-turn-1');
  assert.equal(sent.length, 0);
});
