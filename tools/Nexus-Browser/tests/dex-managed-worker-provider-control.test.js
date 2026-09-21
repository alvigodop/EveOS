const test = require('node:test');
const assert = require('node:assert/strict');
const control = require('../public/dex-provider-control.js');

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
  providerName: 'ChatGPT',
  url: 'https://chatgpt.com/c/parent'
};

function stateFixture() {
  return {
    rooms: [{
      id: 'room-1',
      name: 'Worker Room',
      relay: { active: false, waitingFor: null },
      messages: [],
      members: [{
        id: 'eve',
        name: 'Eve',
        binding: { ...eveSource }
      }]
    }],
    tabs: [],
    localTargets: [],
    providers: [
      { id: 'chatgpt', name: 'ChatGPT', orchestration: { spawnable: true } },
      { id: 'muse', name: 'Muse', orchestration: { spawnable: true } },
      { id: 'other', name: 'Other', orchestration: { spawnable: false } }
    ]
  };
}

function controller(state, calls = []) {
  return control.createController({
    state,
    storage: memoryStorage(),
    roomMessage() {},
    startRelay() {},
    persist() { calls.push('persist'); },
    renderAll() { calls.push('render'); },
    uid() { return 'agent-managed-muse'; }
  });
}

function managedMember() {
  return {
    id: 'managed-muse',
    name: 'Muse Worker',
    binding: {
      targetClassId: 'online-origin',
      targetId: 31,
      providerId: 'muse',
      providerName: 'Muse',
      url: 'https://muse.ai/thread/worker',
      managedByDex: true
    }
  };
}

test('server-verified spawned target becomes a durable managed worker', () => {
  const state = stateFixture();
  const calls = [];
  const result = controller(state, calls).handle({
    source: eveSource,
    command: {
      action: 'spawn_agent',
      room: 'Worker Room',
      providerId: 'muse',
      name: 'Muse Worker',
      spawnedTarget: {
        id: 31,
        providerId: 'muse',
        providerName: 'Muse',
        title: 'Fresh Muse',
        url: 'https://muse.ai/thread/new'
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.addedMemberId, 'agent-managed-muse');
  assert.equal(result.data.managedByDex, true);
  const added = state.rooms[0].members.at(-1);
  assert.equal(added.binding.managedByDex, true);
  assert.equal(added.binding.targetId, 31);
  assert.equal(added.binding.providerId, 'muse');
  assert.deepEqual(calls, ['persist', 'render']);
});

test('spawn target must match the provider requested by the online parent', () => {
  const state = stateFixture();
  const result = controller(state).handle({
    source: eveSource,
    command: {
      action: 'spawn_agent',
      room: 'Worker Room',
      providerId: 'muse',
      spawnedTarget: {
        id: 31,
        providerId: 'chatgpt',
        providerName: 'ChatGPT',
        url: 'https://chatgpt.com/'
      }
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DEX_CONTROL_SPAWN_TARGET_MISMATCH');
  assert.equal(state.rooms[0].members.length, 1);
});

test('managed workers with the same fresh-chat URL remain distinct by exact tab id', () => {
  const one = {
    targetClassId: 'online-origin',
    targetId: 101,
    providerId: 'chatgpt',
    url: 'https://chatgpt.com/',
    managedByDex: true
  };
  const two = { ...one, targetId: 102 };
  assert.notEqual(control.bindingFingerprint(one), control.bindingFingerprint(two));
  assert.match(control.bindingFingerprint(one), /online-managed:chatgpt:101/);
});

test('ordinary remove and room deletion refuse to orphan managed browser workers', () => {
  const state = stateFixture();
  state.rooms[0].members.push(managedMember());
  const ctl = controller(state);

  const remove = ctl.handle({
    source: eveSource,
    command: { action: 'remove_agent', room: 'Worker Room', member: 'managed-muse' }
  });
  assert.equal(remove.code, 'DEX_CONTROL_MANAGED_AGENT');

  const removeRoom = ctl.handle({
    source: eveSource,
    command: { action: 'delete_room', room: 'Worker Room' }
  });
  assert.equal(removeRoom.code, 'DEX_CONTROL_MANAGED_WORKERS_PRESENT');
  assert.equal(state.rooms[0].members.some((member) => member.id === 'managed-muse'), true);
});

test('despawn removes only the managed member and returns exact browser cleanup identity', () => {
  const state = stateFixture();
  state.rooms[0].members.push(managedMember());
  const calls = [];
  const result = controller(state, calls).handle({
    source: eveSource,
    command: { action: 'despawn_agent', room: 'Worker Room', member: 'managed-muse' }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.removedMemberId, 'managed-muse');
  assert.deepEqual(result.data.managedTarget, {
    targetId: 31,
    providerId: 'muse',
    url: 'https://muse.ai/thread/worker'
  });
  assert.equal(state.rooms[0].members.some((member) => member.id === 'managed-muse'), false);
  assert.deepEqual(calls, ['persist', 'render']);
});

test('onboarding exposes managed worker commands and only registry-declared spawn providers', () => {
  const state = stateFixture();
  const result = controller(state).handle({
    source: eveSource,
    command: { action: 'onboard' }
  });

  assert.equal(result.ok, true);
  assert.ok(result.data.commands.includes('spawn_agent'));
  assert.ok(result.data.commands.includes('despawn_agent'));
  assert.deepEqual(
    result.data.spawnProviders.map((entry) => entry.providerId),
    ['chatgpt', 'muse']
  );
});
