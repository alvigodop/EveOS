'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProviderControlRouting } = require('../dex/provider-control-routing');
const { rememberOrigin } = require('./helpers/dex-provider-control-fixture');
const source = { targetClassId: 'local-origin', providerId: 'local-antigravity-existing',
  targetId: 'local:antigravity-existing:9' };
function harness() {
  let state = { rooms: [{
    id: 'room-1', name: 'Eve + Astro',
    members: [{ id: 'eve', name: 'Eve', binding: { targetClassId: 'online-origin',
      targetId: 42, providerId: 'chatgpt', url: 'https://chatgpt.com/c/eve' } },
      { id: 'astro', name: 'Astro', binding: source }],
    relay: { active: false, waitingFor: null, remaining: 0 },
    recovery: { requestId: 'old-interrupted', memberId: 'eve',
      sourceMessageId: 'source', dispatched: true, passiveAt: new Date().toISOString() },
    messages: [{ id: 'source', senderKind: 'user', text: 'Old task' }]
  }] };
  const ws = { role: 'provider-control-extension', sent: [] }, events = [];
  const routing = createProviderControlRouting({
    uiSockets: new Set(), safeSend(socket, payload) { socket.sent.push(payload); return true; },
    validateSource: async () => true,
    ensureDexClient() { throw Error('Interrupted sends must not require UI'); },
    getDexClient: () => null, getState: () => structuredClone(state),
    saveState(next) { state = structuredClone(next); return structuredClone(state); },
    broadcastState(next) { events.push(next); },
    now: () => Date.parse('2026-09-18T23:52:00.000Z')
  });
  return { routing, ws, events, get state() { return state; } };
}
function request(requestId) {
  return { type: 'provider_control_request', requestId, source,
    command: { action: 'send', room: 'room-1', text: 'One new request', relay: true } };
}
test('paused recovery accepts one authenticated Local-Origin queued send even when Dex UI is offline', async () => {
  const h = harness();
  assert.equal(await h.routing.handle(h.ws, request('ctl-1')), true);
  const result = h.ws.sent.find((x) => x.type === 'provider_control_result');
  assert.equal(result.result.ok, true);
  assert.equal(result.result.data.deliveryState, 'queued');
  assert.equal(h.state.rooms[0].messages.length, 2);
  assert.equal(h.state.rooms[0].deferredRelays.length, 1);
  assert.equal(h.state.rooms[0].relay.active, false);
  assert.equal(h.events.length, 1);
});

test('paused Online-Origin SEND requires and consumes an exact durable intent', async () => {
  const h = harness(), online = h.state.rooms[0].members[0].binding;
  const input = { ...request('online-1'), source: online };
  rememberOrigin(h.state, online, input.command);
  await h.routing.handle(h.ws, input);
  const result = h.ws.sent.find((x) => x.type === 'provider_control_result');
  assert.equal(result.result.ok, true);
  assert.equal(result.result.data.deliveryState, 'queued');
  assert.equal(result.originReceipt.roomId, 'room-1');
  assert.equal(h.state.rooms[0].deferredRelays.length, 1);
  assert.equal(h.state.rooms[0].pendingProviderControlReceipt, undefined);
  assert.equal(h.state.rooms[0].messages.filter((x) => x.controlReceipt).length, 1);
});

test('paused Online-Origin unsolicited SEND is rejected without mutating the inbox', async () => {
  const h = harness(), online = h.state.rooms[0].members[0].binding;
  await h.routing.handle(h.ws, { ...request('online-denied'), source: online });
  assert.equal(h.ws.sent.find((x) => x.type === 'provider_control_result')
    .result.code, 'DEX_CONTROL_ORIGIN_REQUIRED');
  assert.equal(h.state.rooms[0].messages.length, 1);
  assert.equal(h.state.rooms[0].deferredRelays, undefined);
  assert.equal(h.events.length, 0);
});
test('retrying the same interrupted send does not create a second message', async () => {
  const h = harness();
  await h.routing.handle(h.ws, request('ctl-1'));
  await h.routing.handle(h.ws, request('ctl-1'));
  assert.equal(h.state.rooms[0].messages.length, 2);
  assert.equal(h.state.rooms[0].deferredRelays.length, 1);
  assert.equal(h.ws.sent.filter((x) => x.type === 'provider_control_result')
    .every((x) => x.result.ok), true);
});
