const test = require('node:test');
const assert = require('node:assert/strict');
const handoff = require('../dex/handoff-packet.js');

function snapshot() {
  return {
    activeRoomId: 'room-1',
    rooms: [{
      id: 'room-1',
      name: 'Eve + Muse',
      relay: { active: false, remaining: 0, waitingFor: null, lastStopReason: 'Idle' },
      members: [{
        id: 'muse', name: 'Muse', relayEnabled: true,
        binding: { targetClassId: 'online-origin', providerId: 'muse', targetId: 17, url: 'https://muse.ai/' }
      }],
      agentCheckpoints: {
        muse: { memberId: 'muse', memberName: 'Muse', providerId: 'muse', note: 'Next: inspect scheduler ownership.', at: '2026-09-18T22:30:00.000Z' }
      },
      messages: [{ id: 'm1', senderKind: 'agent', senderName: 'Muse', text: 'x'.repeat(900), at: '2026-09-18T22:31:00.000Z' }]
    }]
  };
}

test('handoff packet is compact and carries durable checkpoint plus recent room context', () => {
  const packet = handoff.buildHandoffPacket({
    snapshot: snapshot(),
    diagnostics: { serverSessionId: 's1', extensionConnected: true, dexUiConnected: true, onlineTargets: 3, localTargets: 1, providerBlocks: [], stateRepair: { repairs: [], issues: [] } },
    durability: { turnLedger: { reliable: true, active: 0 }, incidents: { count: 0, last: null } },
    gitHead: 'abc123',
    generatedAt: '2026-09-18T22:32:00.000Z'
  });
  assert.equal(packet.gitHead, 'abc123');
  assert.equal(packet.rooms[0].members[0].checkpoint.note, 'Next: inspect scheduler ownership.');
  assert.ok(packet.rooms[0].recentMessages[0].text.length <= 320);
  assert.equal(packet.next.code, 'READY');
});

test('handoff prioritizes deterministic recovery and provider blockers', () => {
  const recovering = snapshot();
  recovering.rooms[0].recovery = { requestId: 'turn-1', memberId: 'muse', sourceMessageId: 'm1', dispatched: true };
  assert.equal(handoff.buildHandoffPacket({
    snapshot: recovering,
    diagnostics: { extensionConnected: true, providerBlocks: [], stateRepair: { issues: [] } }
  }).next.code, 'RECOVER_INTERRUPTED_TURN');

  assert.equal(handoff.buildHandoffPacket({
    snapshot: snapshot(),
    diagnostics: { extensionConnected: true, providerBlocks: [{ providerId: 'grok' }], stateRepair: { issues: [] } }
  }).next.code, 'PROVIDER_BLOCKED');
});

test('handoff makes extension outage explicit instead of asking an agent to infer it', () => {
  const packet = handoff.buildHandoffPacket({
    snapshot: snapshot(),
    diagnostics: { extensionConnected: false, providerBlocks: [], stateRepair: { issues: [] } }
  });
  assert.equal(packet.next.code, 'RESTORE_EXTENSION');
});
