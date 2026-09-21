const test = require('node:test');
const assert = require('node:assert/strict');
const control = require('../public/dex-provider-control.js');

const eveSource = {
  targetClassId: 'online-origin',
  targetId: 10,
  providerId: 'chatgpt',
  url: 'https://chatgpt.com/c/room-one'
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

function stateFixture() {
  const binding = {
    targetClassId: 'online-origin', targetId: 10, providerId: 'chatgpt',
    providerName: 'ChatGPT', url: 'https://chatgpt.com/c/room-one'
  };
  return {
    rooms: [
      {
        id: 'room-1', name: 'Engineering Room',
        relay: { active: true, waitingFor: 'eve-engineering' },
        messages: [],
        members: [{ id: 'eve-engineering', name: 'Eve Engineering', binding }]
      },
      {
        id: 'room-2', name: 'Stress Room',
        relay: { active: false, waitingFor: null },
        settings: { maxTurns: 12 },
        messages: [],
        members: [
          { id: 'eve-stress', name: 'Eve Stress', binding },
          {
            id: 'muse', name: 'Wren',
            binding: { targetClassId: 'online-origin', targetId: 30, providerId: 'muse', url: 'https://muse.ai/' }
          }
        ]
      }
    ]
  };
}

test('handoff_room stops one busy source room and starts an authorized target room as the same provider chat', () => {
  const state = stateFixture();
  const calls = [];
  const controller = control.createController({
    state, storage: memoryStorage(),
    roomMessage(room, kind, id, name, text, persistNow) {
      calls.push(['message', room.id, kind, id, name, text, persistNow]);
      const message = { id: 'msg-handoff', senderKind: kind, senderId: id, senderName: name, text };
      room.messages.push(message);
      return message;
    },
    stopRoom(room, reason) { calls.push(['stop', room.id, reason]); return true; },
    startRelay(room, message, turns) { calls.push(['relay', room.id, message.id, turns]); return true; },
    persist() {}, renderAll() {}, log() {}
  });

  const result = controller.handle({
    source: eveSource,
    command: { action: 'handoff_room', room: 'Stress Room', text: 'Continue Wren stress testing.', turns: 9 }
  });

  assert.equal(result.ok, true);
  assert.equal(result.silent, true);
  assert.equal(result.data.commitState, 'committed');
  assert.equal(result.data.commitId, 'msg-handoff');
  assert.deepEqual(calls[0].slice(0, 2), ['stop', 'room-1']);
  assert.deepEqual(calls[1], ['message', 'room-2', 'agent', 'eve-stress', 'Eve Stress', 'Continue Wren stress testing.', false]);
  assert.deepEqual(calls[2], ['relay', 'room-2', 'msg-handoff', 9]);
});

test('handoff_room refuses an unbound target room instead of crossing authorization boundaries', () => {
  const state = stateFixture();
  state.rooms.push({
    id: 'room-3', name: 'Foreign Room', relay: { active: false, waitingFor: null },
    messages: [],
    members: [{ id: 'claude', name: 'Claude', binding: { targetClassId: 'online-origin', targetId: 20, providerId: 'claude', url: 'https://claude.ai/chat/other' } }]
  });
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, stopRoom() { return true; },
    startRelay() { throw new Error('should not start'); }, persist() {}, renderAll() {}
  });

  const result = controller.handle({
    source: eveSource,
    command: { action: 'handoff_room', room: 'Foreign Room', text: 'not authorized' }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DEX_CONTROL_ROOM_REQUIRED');
});


test('handoff_room busy result explicitly reports no commit', () => {
  const state = stateFixture();
  state.rooms[1].relay.active = true;
  const controller = control.createController({
    state, storage: memoryStorage(),
    roomMessage() { throw new Error('busy handoff must not mutate target room'); },
    stopRoom() { throw new Error('busy handoff must not stop source room'); },
    startRelay() { throw new Error('busy handoff must not start relay'); },
    persist() {}, renderAll() {}, log() {}
  });

  const result = controller.handle({
    source: eveSource,
    command: { action: 'handoff_room', room: 'Stress Room', text: 'Do not commit.' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DEX_CONTROL_ROOM_BUSY');
  assert.deepEqual(result.data, { commitState: 'not_committed', commitId: null });
});

test('one-shot handoff passes an explicit single-turn relay budget', () => {
  const state = stateFixture();
  const relays = [];
  const controller = control.createController({
    state, storage: memoryStorage(),
    roomMessage(room, kind, id, name, text) {
      const message = { id: 'msg-one-shot', senderKind: kind, senderId: id, senderName: name, text };
      room.messages.push(message);
      return message;
    },
    stopRoom() { return true; },
    startRelay(room, message, turns) { relays.push({ roomId: room.id, messageId: message.id, turns }); return true; },
    persist() {}, renderAll() {}, log() {}
  });
  const result = controller.handle({
    source: eveSource,
    command: { action: 'handoff_room', room: 'Stress Room', text: 'Run exactly one workload.', turns: 1 }
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.turns, 1);
  assert.deepEqual(relays, [{ roomId: 'room-2', messageId: 'msg-one-shot', turns: 1 }]);
});

