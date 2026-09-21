const test = require('node:test');
const assert = require('node:assert/strict');
const control = require('../public/dex-provider-control.js');

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

function state() {
  return {
    rooms: [{
      id: 'existing',
      name: 'Existing Room',
      relay: { active: false, waitingFor: null },
      messages: [],
      members: [{
        id: 'other',
        name: 'Other',
        binding: {
          targetClassId: 'online-origin',
          targetId: 1,
          providerId: 'chatgpt',
          url: 'https://chatgpt.com/c/existing'
        }
      }]
    }]
  };
}

const source = {
  targetClassId: 'online-origin',
  targetId: 99,
  providerId: 'chatgpt',
  providerName: 'ChatGPT',
  title: 'Current Eve',
  url: 'https://chatgpt.com/c/bootstrap-chat'
};

function controller(value, calls = []) {
  return control.createController({
    state: value,
    storage: storage(),
    roomMessage() {},
    startRelay() {},
    persist() { calls.push('persist'); },
    renderAll() { calls.push('render'); },
    uid() { return 'agent-bootstrap'; },
    createRoom() {
      return {
        id: 'room-bootstrap',
        name: 'Dex Room',
        userName: 'User',
        members: [],
        messages: [],
        settings: { autoRelay: true, maxTurns: 8, contextMessages: 8 },
        relay: { active: false, waitingFor: null }
      };
    }
  });
}

test('unbound exact provider cannot enumerate existing rooms before bootstrap', () => {
  const result = controller(state()).handle({ source, command: { action: 'rooms' } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DEX_CONTROL_NOT_BOUND');
});

test('unbound exact provider may create its own first room and becomes authorized there', () => {
  const value = state(), calls = [];
  const ctl = controller(value, calls);
  const result = ctl.handle({
    source,
    command: {
      action: 'create_room',
      name: 'Eve ↔ Eve',
      selfName: 'Eve (Current)',
      userName: 'Drift'
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.id, 'room-bootstrap');
  assert.equal(value.rooms.at(-1).name, 'Eve ↔ Eve');
  assert.equal(value.rooms.at(-1).members[0].id, 'agent-bootstrap');
  assert.equal(value.rooms.at(-1).members[0].binding.url, source.url);
  assert.deepEqual(control.authorizedRooms(value.rooms, source).map((room) => room.id), ['room-bootstrap']);
  assert.deepEqual(calls, ['persist', 'render']);
});
