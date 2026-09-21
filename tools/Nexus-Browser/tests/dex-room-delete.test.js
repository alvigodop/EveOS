const test = require('node:test');
const assert = require('node:assert/strict');
const control = require('../public/dex-provider-control.js');

const source = {
  targetClassId: 'online-origin',
  targetId: 10,
  providerId: 'chatgpt',
  providerName: 'ChatGPT',
  url: 'https://chatgpt.com/c/eve'
};

function member(id = 'eve') {
  return {
    id,
    name: 'Eve',
    binding: {
      targetClassId: 'online-origin',
      targetId: 10,
      providerId: 'chatgpt',
      providerName: 'ChatGPT',
      url: 'https://chatgpt.com/c/eve'
    }
  };
}

function room(id, name) {
  return {
    id,
    name,
    userName: 'User',
    members: [member(`${id}-eve`)],
    messages: [],
    settings: { autoRelay: true, maxTurns: 8, contextMessages: 8 },
    relay: { active: false, waitingFor: null, remaining: 0, lastStopReason: 'Idle' }
  };
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    values
  };
}

function controllerFor(state, extras = {}) {
  return control.createController({
    state,
    storage: extras.storage || storage(),
    roomMessage() {},
    startRelay() {},
    persist: extras.persist || (() => {}),
    renderAll: extras.renderAll || (() => {}),
    createRoom: extras.createRoom,
    uid: () => 'unused'
  });
}

test('delete_room requires an explicit authorized room reference', () => {
  const state = { turn: null, queue: [], rooms: [room('r1', 'One')], activeRoomId: 'r1' };
  const result = controllerFor(state).handle({ source, command: { action: 'delete_room' } });
  assert.equal(result.code, 'DEX_CONTROL_ROOM_REQUIRED');
  assert.equal(state.rooms.length, 1);
});

test('delete_room removes an idle room, updates active room, and clears stale selection', () => {
  const first = room('r1', 'Old Room');
  const second = room('r2', 'Keep Room');
  const state = { turn: null, queue: [], rooms: [first, second], activeRoomId: 'r1' };
  const calls = [];
  const memory = storage();
  const controller = controllerFor(state, {
    storage: memory,
    persist: () => calls.push('persist'),
    renderAll: () => calls.push('render')
  });

  assert.equal(controller.handle({ source, command: { action: 'use_room', room: 'Old Room' } }).ok, true);
  const result = controller.handle({ source, command: { action: 'delete_room', room: 'Old Room' } });

  assert.equal(result.ok, true);
  assert.equal(result.data.deletedRoomId, 'r1');
  assert.equal(result.data.remainingRooms, 1);
  assert.equal(state.activeRoomId, 'r2');
  assert.deepEqual(state.rooms.map((entry) => entry.id), ['r2']);
  assert.deepEqual(calls, ['persist', 'render']);

  const listed = controller.handle({ source, command: { action: 'rooms' } });
  assert.equal(listed.ok, true);
  assert.equal(listed.data.rooms[0].id, 'r2');
  assert.equal(listed.data.rooms[0].selected, true);
});

test('delete_room refuses to remove a busy room', () => {
  const busy = room('r1', 'Busy');
  busy.relay.active = true;
  const state = { turn: null, queue: [], rooms: [busy, room('r2', 'Keep')], activeRoomId: 'r1' };
  const result = controllerFor(state).handle({ source, command: { action: 'delete_room', room: 'Busy' } });
  assert.equal(result.code, 'DEX_CONTROL_ROOM_BUSY');
  assert.equal(state.rooms.length, 2);
});

test('delete_room replaces the final room with a fresh fallback when a room factory exists', () => {
  const state = { turn: null, queue: [], rooms: [room('r1', 'Only')], activeRoomId: 'r1' };
  const result = controllerFor(state, {
    createRoom: () => room('fresh', 'Dex Room 1')
  }).handle({ source, command: { action: 'delete_room', room: 'Only' } });

  assert.equal(result.ok, true);
  assert.equal(state.rooms.length, 1);
  assert.equal(state.rooms[0].id, 'fresh');
  assert.equal(state.activeRoomId, 'fresh');
});

test('delete_room rejects final-room deletion before mutating when no room factory exists', () => {
  const state = { turn: null, queue: [], rooms: [room('r1', 'Only')], activeRoomId: 'r1' };
  const result = controllerFor(state).handle({ source, command: { action: 'delete_room', room: 'Only' } });
  assert.equal(result.code, 'DEX_CONTROL_DELETE_UNAVAILABLE');
  assert.equal(state.rooms.length, 1);
  assert.equal(state.rooms[0].id, 'r1');
});
