const test = require('node:test');
const assert = require('node:assert/strict');
const control = require('../public/dex-provider-control.js');

function stateFixture() {
  return {
    turn: null,
    queue: [],
    rooms: [
      {
        id: 'room-1',
        name: 'Core Room',
        relay: { active: false, waitingFor: null },
        messages: [],
        members: [
          {
            id: 'eve',
            name: 'Eve',
            binding: {
              targetClassId: 'online-origin',
              targetId: 10,
              providerId: 'chatgpt',
              providerName: 'ChatGPT',
              url: 'https://chatgpt.com/c/room-one'
            }
          },
          {
            id: 'astro',
            name: 'Astro',
            binding: {
              targetClassId: 'local-origin',
              targetId: 'local:antigravity-existing:86660',
              providerId: 'local-antigravity-existing',
              providerName: 'Antigravity CLI'
            }
          }
        ]
      },
      {
        id: 'room-2',
        name: 'Other Room',
        relay: { active: false, waitingFor: null },
        messages: [],
        members: [
          {
            id: 'claude',
            name: 'Claude',
            binding: {
              targetClassId: 'online-origin',
              targetId: 20,
              providerId: 'claude',
              url: 'https://claude.ai/chat/other'
            }
          }
        ]
      }
    ]
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

const eveSource = {
  targetClassId: 'online-origin',
  targetId: 10,
  providerId: 'chatgpt',
  url: 'https://chatgpt.com/c/room-one'
};

const astroSource = {
  targetClassId: 'local-origin',
  targetId: 'local:antigravity-existing:86660',
  providerId: 'local-antigravity-existing'
};

test('provider control authorizes only rooms containing the exact provider binding', () => {
  const state = stateFixture();
  assert.deepEqual(control.authorizedRooms(state.rooms, eveSource).map((room) => room.id), ['room-1']);
  assert.deepEqual(control.authorizedRooms(state.rooms, astroSource).map((room) => room.id), ['room-1']);
  assert.equal(control.bindingMatchesSource(state.rooms[1].members[0].binding, eveSource), false);
});

test('rooms action exposes only authorized rooms and auto-selects a unique room', () => {
  const state = stateFixture();
  const controller = control.createController({
    state,
    storage: memoryStorage(),
    roomMessage() {},
    startRelay() {},
    persist() {},
    renderAll() {}
  });
  const result = controller.handle({ source: eveSource, command: { action: 'rooms' } });
  assert.equal(result.ok, true);
  assert.equal(result.data.rooms.length, 1);
  assert.equal(result.data.rooms[0].id, 'room-1');
  assert.equal(result.data.rooms[0].selected, true);
});

test('send records the initiating provider identity and starts relay from that agent message', () => {
  const state = stateFixture();
  const calls = [];
  const controller = control.createController({
    state,
    storage: memoryStorage(),
    roomMessage(room, kind, id, name, text, persistNow) {
      calls.push(['message', room.id, kind, id, name, text, persistNow]);
      return { id: 'msg-provider', senderKind: kind, senderId: id, senderName: name, text };
    },
    startRelay(room, message) { calls.push(['relay', room.id, message.id]); },
    persist() { calls.push(['persist']); },
    renderAll() { calls.push(['render']); }
  });
  const result = controller.handle({ source: eveSource, command: { action: 'send', text: 'Astro, run the smoke.', relay: true } });
  assert.equal(result.ok, true);
  assert.equal(result.silent, true);
  assert.deepEqual(calls[0], ['message', 'room-1', 'agent', 'eve', 'Eve', 'Astro, run the smoke.', false]);
  assert.deepEqual(calls[1], ['relay', 'room-1', 'msg-provider']);
});

test('send can record without relaying and remains durable', () => {
  const state = stateFixture();
  const calls = [];
  const controller = control.createController({
    state,
    storage: memoryStorage(),
    roomMessage() { return { id: 'msg-note' }; },
    startRelay() { calls.push('relay'); },
    persist() { calls.push('persist'); },
    renderAll() { calls.push('render'); }
  });
  const result = controller.handle({ source: astroSource, command: { action: 'send', text: 'Local status note', relay: false } });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['persist', 'render']);
});

test('provider control refuses out-of-band send while that room is already relaying', () => {
  const state = stateFixture();
  state.rooms[0].relay.active = true;
  const controller = control.createController({
    state,
    storage: memoryStorage(),
    roomMessage() { throw new Error('should not record'); },
    startRelay() {},
    persist() {},
    renderAll() {}
  });
  const result = controller.handle({ source: eveSource, command: { action: 'send', text: 'collision' } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DEX_CONTROL_ROOM_BUSY');
});

test('unbound provider cannot enumerate or inject into Dex rooms', () => {
  const state = stateFixture();
  const controller = control.createController({
    state,
    storage: memoryStorage(),
    roomMessage() {},
    startRelay() {},
    persist() {},
    renderAll() {}
  });
  const result = controller.handle({
    source: { targetClassId: 'online-origin', targetId: 99, providerId: 'chatgpt', url: 'https://chatgpt.com/c/not-bound' },
    command: { action: 'rooms' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DEX_CONTROL_NOT_BOUND');
});

test('targets reports visible online and local targets on demand', () => {
  const state = stateFixture();
  state.tabs = [
    { id: 10, providerId: 'chatgpt', providerName: 'ChatGPT', title: 'Eve', url: 'https://chatgpt.com/c/room-one' },
    { id: 30, providerId: 'muse', providerName: 'Muse', title: 'Muse', url: 'https://muse.ai/' }
  ];
  state.localTargets = [
    { id: 'local:antigravity-existing:86660', targetTypeId: 'existing-session', providerId: 'local-antigravity-existing', providerName: 'Antigravity CLI', title: 'Astro' }
  ];
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}
  });
  const result = controller.handle({ source: eveSource, command: { action: 'targets' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.online.map((target) => target.providerId), ['chatgpt', 'muse']);
  assert.equal(result.data.local[0].targetId, 'local:antigravity-existing:86660');
});

test('bound provider can create a room with itself as the first participant', () => {
  const state = stateFixture();
  const calls = [];
  let nextId = 0;
  const controller = control.createController({
    state,
    storage: memoryStorage(),
    roomMessage() {},
    startRelay() {},
    persist() { calls.push('persist'); },
    renderAll() { calls.push('render'); },
    uid(prefix) { nextId += 1; return `${prefix}-new-${nextId}`; },
    createRoom() {
      return {
        id: 'room-new',
        name: 'Dex Room 3',
        userName: 'User',
        members: [],
        messages: [],
        settings: { autoRelay: true, maxTurns: 8, contextMessages: 8 },
        relay: { active: false, waitingFor: null }
      };
    }
  });
  const result = controller.handle({
    source: eveSource,
    command: { action: 'create_room', name: 'Eve + Muse', selfName: 'Eve' }
  });
  assert.equal(result.ok, true);
  assert.equal(state.rooms.at(-1).name, 'Eve + Muse');
  assert.equal(state.rooms.at(-1).members[0].name, 'Eve');
  assert.equal(state.rooms.at(-1).members[0].binding.url, eveSource.url);
  assert.equal(state.activeRoomId, 'room-new');
  assert.deepEqual(calls, ['persist', 'render']);
});

test('provider can add an exact visible Muse tab to an authorized idle room', () => {
  const state = stateFixture();
  state.tabs = [
    { id: 30, providerId: 'muse', providerName: 'Muse', title: 'Muse Main', url: 'https://muse.ai/' }
  ];
  const calls = [];
  const controller = control.createController({
    state,
    storage: memoryStorage(),
    roomMessage() {},
    startRelay() {},
    persist() { calls.push('persist'); },
    renderAll() { calls.push('render'); },
    uid() { return 'agent-muse'; }
  });
  const result = controller.handle({
    source: eveSource,
    command: {
      action: 'add_agent',
      room: 'Core Room',
      targetClassId: 'online-origin',
      targetId: 30,
      providerId: 'muse',
      name: 'Muse'
    }
  });
  assert.equal(result.ok, true);
  const added = state.rooms[0].members.at(-1);
  assert.equal(added.id, 'agent-muse');
  assert.equal(added.name, 'Muse');
  assert.equal(added.binding.providerId, 'muse');
  assert.equal(added.binding.url, 'https://muse.ai/');
  assert.deepEqual(calls, ['persist', 'render']);
});

test('provider control refuses duplicate or unavailable agent bindings', () => {
  const state = stateFixture();
  state.tabs = [
    { id: 10, providerId: 'chatgpt', providerName: 'ChatGPT', title: 'Eve', url: 'https://chatgpt.com/c/room-one' }
  ];
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}
  });
  const duplicate = controller.handle({
    source: eveSource,
    command: { action: 'add_agent', room: 'Core Room', targetClassId: 'online-origin', targetId: 10 }
  });
  assert.equal(duplicate.code, 'DEX_CONTROL_DUPLICATE_AGENT');
  const missing = controller.handle({
    source: eveSource,
    command: { action: 'add_agent', room: 'Core Room', targetClassId: 'online-origin', targetId: 999 }
  });
  assert.equal(missing.code, 'DEX_CONTROL_TARGET_NOT_FOUND');
});



test('clear_chat removes only room history and preserves room identity, members, and settings', () => {
  const state = stateFixture();
  const room = state.rooms[0];
  room.messages = [
    { id: 'm1', senderKind: 'user', text: 'old' },
    { id: 'm2', senderKind: 'agent', text: 'reply' }
  ];
  room.settings = { autoRelay: true, maxTurns: 8, contextMessages: 8 };
  const memberIds = room.members.map((member) => member.id);
  const calls = [];
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {},
    persist() { calls.push('persist'); }, renderAll() { calls.push('render'); }
  });
  const result = controller.handle({ source: eveSource, command: { action: 'clear_chat' } });
  assert.equal(result.ok, true);
  assert.equal(result.data.messages, 0);
  assert.equal(room.name, 'Core Room');
  assert.deepEqual(room.members.map((member) => member.id), memberIds);
  assert.deepEqual(room.settings, { autoRelay: true, maxTurns: 8, contextMessages: 8 });
  assert.equal(room.messages.length, 0);
  assert.equal(room.relay.lastStopReason, 'Chat cleared');
  assert.deepEqual(calls, ['persist', 'render']);
});

test('clear_chat refuses to erase history while the room is actively relaying', () => {
  const state = stateFixture();
  state.rooms[0].messages = [{ id: 'm1', text: 'keep me' }];
  state.rooms[0].relay.active = true;
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}
  });
  const result = controller.handle({ source: eveSource, command: { action: 'clear_chat' } });
  assert.equal(result.code, 'DEX_CONTROL_ROOM_BUSY');
  assert.equal(state.rooms[0].messages.length, 1);
});


test('onboard returns compact self-service room identity, participants, commands, and boundaries', () => {
  const state = stateFixture();
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}
  });
  const result = controller.handle({ source: eveSource, command: { action: 'onboard' } });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'onboard');
  assert.equal(result.data.self.name, 'Eve');
  assert.equal(result.data.self.providerId, 'chatgpt');
  assert.equal(result.data.room.name, 'Core Room');
  assert.deepEqual(result.data.room.members.map((entry) => entry.name), ['Eve', 'Astro']);
  assert.equal(result.data.commands.includes('status'), true);
  assert.equal(result.data.commands.includes('checkpoint'), true);
  assert.equal(result.data.commands.includes('read_checkpoint'), true);
  assert.equal(result.data.commands.includes('delete_room'), true);
  assert.match(result.data.continuity.continuityRules.join(' '), /restart or context reset/);
  assert.match(result.data.rules.join(' '), /do not gain direct localhost or private-repository access/);
  assert.match(result.data.rules.join(' '), /intentionally bounded/);
});


test('provider can rename itself without changing its binding or logical member id', () => {
  const state = stateFixture();
  const room = state.rooms[0];
  const originalBinding = { ...room.members[0].binding };
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}
  });
  const result = controller.handle({ source: eveSource, command: { action: 'rename_self', name: 'Eve Prime' } });
  assert.equal(result.ok, true);
  assert.equal(room.members[0].id, 'eve');
  assert.equal(room.members[0].name, 'Eve Prime');
  assert.deepEqual(room.members[0].binding, originalBinding);
});

test('provider can become an observer while remaining authorized in the room', () => {
  const state = stateFixture();
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}
  });
  const result = controller.handle({ source: astroSource, command: { action: 'set_self_relay', enabled: false } });
  assert.equal(result.ok, true);
  assert.equal(result.data.relayEnabled, false);
  assert.equal(state.rooms[0].members[1].relayEnabled, false);
  assert.equal(control.authorizedRooms(state.rooms, astroSource)[0].id, 'room-1');
  const onboard = controller.handle({ source: astroSource, command: { action: 'onboard' } });
  assert.equal(onboard.data.self.relayEnabled, false);
});


test('provider can save and recover a durable checkpoint without starting a relay', () => {
  const state = stateFixture();
  const calls = [];
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() { calls.push('relay'); },
    persist() { calls.push('persist'); }, renderAll() { calls.push('render'); }
  });
  const saved = controller.handle({
    source: eveSource,
    command: { action: 'checkpoint', note: 'Completed health pass. Next: move orchestration server-side.' }
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.checkpoint.memberId, 'eve');
  assert.deepEqual(calls, ['persist', 'render']);

  const read = controller.handle({ source: eveSource, command: { action: 'read_checkpoint' } });
  assert.equal(read.ok, true);
  assert.match(read.data.checkpoint.note, /move orchestration server-side/);

  const status = controller.handle({ source: eveSource, command: { action: 'status' } });
  assert.match(status.data.checkpoint.note, /Completed health pass/);
});


test('onboarding derives native continuity guidance from declared provider capabilities', () => {
  const state = stateFixture();
  state.rooms[0].members[0].binding.providerId = 'muse';
  state.rooms[0].members[0].binding.providerName = 'Muse';
  state.rooms[0].members[0].binding.url = 'https://muse.ai/';
  state.providers = [{
    id: 'muse',
    name: 'Muse',
    agentFeatures: { persistentCloudComputer: true, backgroundTasks: true, proactiveMessages: true, approvals: true }
  }];
  const source = {
    targetClassId: 'online-origin', targetId: 10, providerId: 'muse', url: 'https://muse.ai/'
  };
  const controller = control.createController({
    state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}
  });
  const result = controller.handle({ source, command: { action: 'onboard' } });
  assert.equal(result.ok, true);
  assert.equal(result.data.continuity.providerFeatures.persistentCloudComputer, true);
  assert.match(result.data.continuity.providerNativeGuidance.join(' '), /persistent files\/workspace/);
  assert.match(result.data.continuity.continuityRules.join(' '), /report provider-native persistence/);
});


test('provider-control busy guard depends only on durable room runtime markers', () => {
  const idle = { id: 'room-1', relay: { active: false, waitingFor: null } };
  assert.equal(control.roomBusy({ turn: { room: { id: 'room-1' } }, queue: [{ roomId: 'room-1' }] }, idle), false);
  assert.equal(control.roomBusy({}, { ...idle, relay: { active: true, waitingFor: null } }), true);
  assert.equal(control.roomBusy({}, { ...idle, relay: { active: false, waitingFor: 'eve' } }), true);
  assert.equal(control.roomBusy({}, { ...idle, pendingTurn: { memberId: 'eve' } }), true);
  assert.equal(control.roomBusy({}, { ...idle, recovery: { requestId: 'dex-turn-1' } }), true);
});

test('status reports recovery journal ownership', () => {
  const state = stateFixture(), room = state.rooms[0];
  room.relay = { active: true, waitingFor: 'astro' };
  room.recovery = { requestId: 'dex-turn-next', memberId: 'astro', dispatched: true, interruptedAt: null };
  const controller = control.createController({ state, storage: memoryStorage(), roomMessage() {}, startRelay() {}, stopRoom() {}, persist() {}, renderAll() {} });
  const data = controller.handle({ source: eveSource, command: { action: 'status' } }).data;
  assert.equal(data.recoveryPending, true);
  assert.equal(data.recoveryInterrupted, false);
  assert.equal(data.recoveryRequestId, 'dex-turn-next');
  assert.equal(data.recoveryMemberId, 'astro');
  assert.equal(data.recoveryMemberName, 'Astro');
});

