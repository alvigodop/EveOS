'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const control = require('../public/dex-provider-control.js');

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

function room(id = 'room-1') {
  return {
    id, name: 'Scope Room', userName: 'Drift', members: [], messages: [],
    settings: { autoRelay: true, maxTurns: 2, contextMessages: 4 },
    relay: { active: false, waitingFor: null }
  };
}

const localTarget = {
  id: 'local:antigravity-cli:managed', targetClassId: 'local-origin',
  targetTypeId: 'terminal-agent', targetTypeName: 'Terminal Agent',
  providerId: 'local-antigravity-cli', providerName: 'Antigravity CLI',
  title: 'Antigravity CLI · Spawned Session', transport: 'persistent-stream-json',
  sessionOrigin: 'spawned', capabilities: { chat: true, captureLatest: false },
  concreteTargetIdentity: { kind: 'adapter-target', targetId: 'local:antigravity-cli:managed' }
};

test('provider-control room creation preserves verified local target scope metadata', () => {
  const state = { rooms: [] };
  const controller = control.createController({
    state, storage: storage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {},
    createRoom: () => room('room-created'), uid: () => 'agent-astro'
  });
  const result = controller.handle({
    source: { ...localTarget, targetId: localTarget.id },
    command: { action: 'create_room', name: 'Nova + Astro', selfName: 'Astro' }
  });
  const binding = state.rooms[0].members[0].binding;
  assert.equal(result.ok, true);
  assert.equal(binding.targetTypeId, 'terminal-agent');
  assert.equal(binding.transport, 'persistent-stream-json');
  assert.equal(binding.sessionOrigin, 'spawned');
  assert.deepEqual(binding.capabilities, localTarget.capabilities);
  assert.deepEqual(binding.concreteTargetIdentity, localTarget.concreteTargetIdentity);
});

test('provider-control added online participant uses the same surface contract', () => {
  const source = { targetClassId: 'local-origin', targetId: localTarget.id, providerId: localTarget.providerId };
  const state = {
    rooms: [{ ...room(), members: [{ id: 'astro', name: 'Astro', binding: source }] }],
    tabs: [{
      id: 42, targetClassId: 'online-origin', targetTypeId: 'browser-tab', targetTypeName: 'Browser Tab',
      providerId: 'chatgpt', providerName: 'ChatGPT', title: 'Nova', url: 'https://chatgpt.com/c/nova',
      transport: 'browser-extension', sessionOrigin: 'browser', capabilities: { chat: true, captureLatest: true },
      concreteTargetIdentity: { kind: 'browser-tab', tabId: 42, windowId: 7, providerId: 'chatgpt', url: 'https://chatgpt.com/c/nova' }
    }]
  };
  const controller = control.createController({
    state, storage: storage(), roomMessage() {}, startRelay() {}, persist() {}, renderAll() {}, uid: () => 'agent-nova'
  });
  const result = controller.handle({ source, command: {
    action: 'add_agent', room: 'room-1', targetClassId: 'online-origin', targetId: 42, providerId: 'chatgpt', name: 'Nova'
  } });
  const binding = state.rooms[0].members[1].binding;
  assert.equal(result.ok, true);
  assert.equal(binding.targetTypeId, 'browser-tab');
  assert.equal(binding.transport, 'browser-extension');
  assert.equal(binding.sessionOrigin, 'browser');
  assert.equal(binding.concreteTargetIdentity.tabId, 42);
});
