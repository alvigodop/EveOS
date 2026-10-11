'use strict';
const assert = require('node:assert/strict');
const { createProviderControlRouting } = require('../../dex/provider-control-routing');
const receipt = require('../../dex/provider-control-receipt');
const { exactBinding } = require('../../public/dex-members');

function socket(role, clientKind) { return { role, clientKind, sent: [] }; }
function resultFor(ws, requestId = null) {
  const results = ws.sent.filter((entry) => entry.type === 'provider_control_result');
  return requestId ? results.find((entry) => entry.requestId === requestId) : results.at(-1);
}
function admissionFor(ws, requestId = null) {
  const receipts = ws.sent.filter((entry) => entry.type === 'provider_control_received');
  return requestId ? receipts.find((entry) => entry.requestId === requestId) : receipts.at(-1);
}
function entryFixture() {
  return { rooms: [{ id: 'room-1', name: 'Stress Room',
    members: [{ id: 'eve', binding: { targetClassId: 'online-origin', targetId: 4,
      providerId: 'chatgpt', url: 'https://chatgpt.com/c/stress' } }, { id: 'astro', binding: { targetClassId: 'local-origin',
      targetId: 'local:antigravity-existing:86660', providerId: 'local-antigravity-existing' } }] }] };
}
function harness(validateSource = async () => true, overrides = {}) {
  const dex = socket('ui', 'dex'), uiSockets = new Set([dex]), state = entryFixture();
  const safeSend = (ws, payload) => { ws.sent.push(payload); return true; };
  const routing = createProviderControlRouting({ uiSockets, safeSend, validateSource,
    getState: () => state, ...overrides });
  return { dex, uiSockets, safeSend, routing, state };
}
async function waitUntil(predicate, attempts = 25) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return true;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return false;
}
// Seed the same durable intent produced by response_final; never bypass authorization.
function rememberOrigin(state, source, command) {
  const room = state.rooms.find((entry) => (!command.room || entry.id === command.room
    || entry.name === command.room) && entry.members.some((member) => exactBinding(member.binding, source)));
  assert.ok(room, 'the fixture origin must match an exact authorized room');
  const executorMember = room.members.find((member) => exactBinding(member.binding, source));
  const sourceMessage = { id: 'fixture-source', senderKind: 'user', text: 'Authorized control request' };
  const agentMessage = { id: 'fixture-agent', senderKind: 'agent', senderId: executorMember.id,
    text: 'Executing the exact control request' };
  room.messages = [...(room.messages || []), sourceMessage, agentMessage];
  receipt.rememberIntent(room, { executorMember, sourceMessage, command, agentMessage,
    turnRequestId: 'fixture-turn', at: '2026-09-20T04:36:00.000Z' });
  assert.ok(receipt.findIntent(state, source, command), 'exact durable intent is required');
}
module.exports = { socket, resultFor, admissionFor, entryFixture, harness, waitUntil, rememberOrigin };
