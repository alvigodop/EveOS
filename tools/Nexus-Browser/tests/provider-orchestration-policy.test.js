const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../dex/provider-orchestration-policy.js');

const source = {
  targetClassId: 'online-origin',
  targetId: 10,
  providerId: 'chatgpt',
  url: 'https://chatgpt.com/c/parent'
};

function snapshot() {
  return {
    rooms: [{
      id: 'room-1',
      name: 'Worker Room',
      relay: { active: false, waitingFor: null },
      members: [{
        id: 'parent',
        name: 'Parent',
        binding: { ...source }
      }]
    }]
  };
}

test('spawn authorization requires an exact authorized idle room and online source', () => {
  const state = snapshot();
  assert.equal(policy.authorizeSpawn(state, source, {
    room: 'room-1',
    providerId: 'muse'
  }).ok, true);

  assert.equal(policy.authorizeSpawn(state, {
    targetClassId: 'local-origin',
    targetId: 'local:x',
    providerId: 'local-antigravity-cli'
  }, {
    room: 'room-1',
    providerId: 'muse'
  }).code, 'DEX_CONTROL_ONLINE_REQUIRED');

  assert.equal(policy.authorizeSpawn(state, source, {
    providerId: 'muse'
  }).code, 'DEX_CONTROL_ROOM_REQUIRED');

  state.rooms[0].relay.active = true;
  assert.equal(policy.authorizeSpawn(state, source, {
    room: 'room-1',
    providerId: 'muse'
  }).code, 'DEX_CONTROL_ROOM_BUSY');
});

test('spawn authorization enforces the global managed worker bound', () => {
  const state = snapshot();
  for (let index = 0; index < policy.MAX_MANAGED_AGENTS; index += 1) {
    state.rooms[0].members.push({
      id: `worker-${index}`,
      binding: {
        targetClassId: 'online-origin',
        targetId: 100 + index,
        providerId: 'muse',
        managedByDex: true
      }
    });
  }
  assert.equal(policy.authorizeSpawn(state, source, {
    room: 'room-1',
    providerId: 'muse'
  }).code, 'DEX_CONTROL_SPAWN_LIMIT');
});

test('despawn authorization resolves only non-self managed browser workers', () => {
  const state = snapshot();
  state.rooms[0].members.push({
    id: 'worker',
    name: 'Muse Worker',
    binding: {
      targetClassId: 'online-origin',
      targetId: 77,
      providerId: 'muse',
      url: 'https://muse.ai/thread/worker',
      managedByDex: true
    }
  });

  const allowed = policy.authorizeDespawn(state, source, {
    room: 'Worker Room',
    member: 'Muse Worker'
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.memberId, 'worker');
  assert.deepEqual(allowed.target, {
    targetId: 77,
    providerId: 'muse',
    url: 'https://muse.ai/thread/worker'
  });

  assert.equal(policy.authorizeDespawn(state, source, {
    room: 'room-1',
    member: 'parent'
  }).code, 'DEX_CONTROL_SELF_DESPAWN');

  state.rooms[0].members[1].binding.managedByDex = false;
  assert.equal(policy.authorizeDespawn(state, source, {
    room: 'room-1',
    member: 'worker'
  }).code, 'DEX_CONTROL_NOT_MANAGED');
});
