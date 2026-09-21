const test = require('node:test');
const assert = require('node:assert/strict');
const continuity = require('../public/dex-agent-continuity.js');

function room() {
  return {
    id: 'room-1',
    members: [{ id: 'muse', name: 'Muse', binding: { providerId: 'muse' } }],
    messages: []
  };
}

test('agent checkpoint persists compact durable continuation state', () => {
  const value = room();
  const result = continuity.writeCheckpoint(
    value,
    value.members[0],
    'Goal: stabilize Dex. Completed: provider health. Next: move scheduler server-side.',
    '2026-09-18T22:30:00.000Z'
  );
  assert.equal(result.ok, true);
  assert.equal(value.agentCheckpoints.muse.providerId, 'muse');
  assert.match(value.agentCheckpoints.muse.note, /Next: move scheduler server-side/);
  assert.equal(continuity.checkpointFor(value, 'muse').at, '2026-09-18T22:30:00.000Z');
});

test('checkpoint rejects empty notes and caps oversized notes', () => {
  const value = room();
  assert.equal(continuity.writeCheckpoint(value, value.members[0], '   ').code, 'DEX_CHECKPOINT_EMPTY');
  const result = continuity.writeCheckpoint(value, value.members[0], 'x'.repeat(5000));
  assert.equal(result.checkpoint.note.length, continuity.MAX_NOTE_CHARS);
});

test('onboarding continuity is provider-neutral and returns saved checkpoint', () => {
  const value = room();
  continuity.writeCheckpoint(value, value.members[0], 'Current blocker: none.');
  const data = continuity.onboardingGuidance(value, value.members[0], { agentFeatures: { persistentCloudComputer: true, backgroundTasks: true, approvals: true } });
  assert.equal(data.checkpoint.providerId, 'muse');
  assert.match(data.continuityRules.join(' '), /provider-neutral/);
  assert.match(data.continuityRules.join(' '), /restart or context reset/);
  assert.equal(data.providerFeatures.persistentCloudComputer, true);
  assert.match(data.providerNativeGuidance.join(' '), /persistent files\/workspace/);
  assert.match(data.providerNativeGuidance.join(' '), /approval boundaries/);
});
