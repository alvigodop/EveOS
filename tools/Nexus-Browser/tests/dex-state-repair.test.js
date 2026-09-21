const test = require('node:test');
const assert = require('node:assert/strict');
const { repairSnapshot } = require('../dex/state-repair.js');

test('state repair clears stopped relay residue without touching valid transcript data', () => {
  const input = {
    rooms: [{
      id: 'room-1',
      members: [{ id: 'eve' }],
      messages: [{ id: 'm1', text: 'keep' }],
      relay: { active: false, remaining: 4, waitingFor: 'eve', lastStopReason: 'Stopped' }
    }]
  };
  const result = repairSnapshot(input);
  assert.equal(result.snapshot.rooms[0].relay.remaining, 0);
  assert.equal(result.snapshot.rooms[0].relay.waitingFor, null);
  assert.equal(result.snapshot.rooms[0].messages[0].text, 'keep');
  assert.equal(result.repairs[0].code, 'STOPPED_RELAY_RESIDUE');
});

test('state repair expires stale or structurally invalid recovery journals', () => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const input = {
    rooms: [{
      id: 'room-1',
      members: [{ id: 'eve' }],
      messages: [{ id: 'm1' }],
      relay: { active: false, remaining: 0, waitingFor: null },
      recovery: { memberId: 'eve', sourceMessageId: 'm1', startedAt: old }
    }]
  };
  const result = repairSnapshot(input, { maxRecoveryAgeMs: 1000 });
  assert.equal(result.snapshot.rooms[0].recovery, undefined);
  assert.equal(result.repairs[0].code, 'STALE_RECOVERY');
  assert.match(result.snapshot.rooms[0].relay.lastStopReason, /expired/);
});

test('state repair reports duplicate member ids instead of guessing which identity to delete', () => {
  const result = repairSnapshot({
    rooms: [{
      id: 'room-1',
      members: [{ id: 'same' }, { id: 'same' }],
      messages: [],
      relay: { active: false, remaining: 0, waitingFor: null }
    }]
  });
  assert.equal(result.issues[0].code, 'DUPLICATE_MEMBER_ID');
  assert.equal(result.snapshot.rooms[0].members.length, 2);
});
