const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../dex/server-scheduler-state.js');

function room() {
  return {
    id: 'room-1',
    members: [{ id: 'eve', relayEnabled: true }, { id: 'wren', relayEnabled: true }],
    messages: [{ id: 'm1', senderKind: 'agent', senderId: 'eve', text: 'go' }],
    relay: { active: true, remaining: 2, waitingFor: null, lastStopReason: 'Running' }
  };
}

test('localhost scheduler queues the next participant and consumes one turn budget', () => {
  const value = room();
  assert.equal(state.enqueueNext(value, value.messages[0], '2026-09-18T23:50:00.000Z'), true);
  assert.equal(value.relay.remaining, 1);
  assert.equal(value.relay.waitingFor, 'wren');
  assert.deepEqual(value.pendingTurn, {
    memberId: 'wren',
    sourceMessageId: 'm1',
    queuedAt: '2026-09-18T23:50:00.000Z',
    retryCount: 0
  });
});

test('pending rooms are ordered deterministically by durable queue time', () => {
  const one = room();
  const two = { ...room(), id: 'room-2', members: room().members.map((item) => ({ ...item })), messages: room().messages.map((item) => ({ ...item })) };
  state.queueTurn(two, two.members[1], two.messages[0], '2026-09-18T23:51:00.000Z');
  state.queueTurn(one, one.members[1], one.messages[0], '2026-09-18T23:50:00.000Z');
  assert.deepEqual(state.pendingRooms({ rooms: [two, one] }).map((item) => item.id), ['room-1', 'room-2']);
});

test('online resolution prefers exact target id then exact saved URL', () => {
  const member = { binding: { targetId: 9, providerId: 'future-provider', url: 'https://future.example/chat/1' } };
  const tabs = [
    { id: 2, providerId: 'future-provider', url: 'https://future.example/chat/1' },
    { id: 9, providerId: 'future-provider', url: 'https://future.example/chat/2' }
  ];
  assert.equal(state.resolveOnline(member, tabs).id, 9);
  member.binding.targetId = 99;
  assert.equal(state.resolveOnline(member, tabs).id, 2);
});

test('stopping a room removes all server runtime markers', () => {
  const value = room();
  value.pendingTurn = { memberId: 'wren', sourceMessageId: 'm1' };
  value.recovery = { requestId: 'dex-turn-1' };
  state.setStopped(value, 'Stopped by test', '2026-09-18T23:52:00.000Z');
  assert.equal(value.relay.active, false);
  assert.equal(value.relay.waitingFor, null);
  assert.equal(value.relay.remaining, 0);
  assert.equal(value.pendingTurn, undefined);
  assert.equal(value.recovery, undefined);
});

test('turn budget is bounded independently of provider identity', () => {
  assert.equal(state.safeBudget(0, 8), 1);
  assert.equal(state.safeBudget(500, 8), 500);
  assert.equal(state.safeBudget(999, 8), 500);
  assert.equal(state.safeBudget('bad', 8), 8);
});


test('durable retry notBefore prevents wakeups from shortening backoff', () => {
  const value = room();
  state.queueTurn(
    value,
    value.members[1],
    value.messages[0],
    '2026-09-19T00:00:00.000Z',
    2,
    '2026-09-19T00:00:05.000Z'
  );
  const snapshot = { rooms: [value] };
  const before = Date.parse('2026-09-19T00:00:00.000Z');
  assert.deepEqual(state.duePendingRooms(snapshot, before), []);
  assert.equal(state.nextPendingDelay(snapshot, before), 5000);
  assert.equal(state.duePendingRooms(snapshot, before + 4999).length, 0);
  assert.equal(state.duePendingRooms(snapshot, before + 5000)[0].id, value.id);
});
