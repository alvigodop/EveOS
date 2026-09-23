const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareImport, inputPath } = require('../scripts/import-legacy-rooms');

const NOW = new Date('2026-09-23T12:00:00.000Z');
function room(id, messages = []) {
  return {
    id, name: id, members: [{ id: 'agent-1' }], messages,
    relay: { active: false, remaining: 0, waitingFor: null },
    updatedAt: '2026-09-20T12:00:00.000Z'
  };
}
function snapshot(rooms) {
  return { version: 1, rooms, activeRoomId: rooms[0]?.id || null, savedAt: '2026-09-20T12:00:00.000Z' };
}

test('imports legacy rooms without replacing current rooms or transcript IDs', () => {
  const source = snapshot([room('old', [{ id: 'm1', text: 'private' }])]);
  const target = snapshot([room('new')]);
  const result = prepareImport(source, target, NOW);
  assert.equal(result.addedRooms, 1);
  assert.equal(result.addedMessages, 1);
  assert.deepEqual(result.snapshot.rooms.map((value) => value.id), ['new', 'old']);
  assert.equal(result.snapshot.activeRoomId, 'old');
  assert.equal(result.snapshot.rooms[1].messages[0].id, 'm1');
  assert.equal(source.rooms.length, 1);
  assert.equal(prepareImport(source, result.snapshot, NOW).addedRooms, 0);
});

test('expires stale recovery but keeps transcript and can be retried', () => {
  const old = room('old', [{ id: 'm1', text: 'keep' }]);
  old.recovery = { memberId: 'agent-1', sourceMessageId: 'm1', startedAt: '2026-09-20T12:00:00.000Z' };
  const source = snapshot([old]);
  const result = prepareImport(source, snapshot([]), NOW);
  assert.deepEqual(result.repairs, ['STALE_RECOVERY']);
  assert.equal(result.snapshot.rooms[0].recovery, undefined);
  assert.equal(result.snapshot.rooms[0].messages[0].text, 'keep');
  assert.equal(prepareImport(source, result.snapshot, NOW).addedRooms, 0);
});

test('refuses conflicting IDs, live work, and broken relationship IDs', () => {
  const source = snapshot([room('same')]);
  const target = snapshot([room('same', [{ id: 'm1', text: 'newer' }])]);
  assert.throws(() => prepareImport(source, target, NOW), /different data/);
  source.rooms[0].relay.active = true;
  assert.throws(() => prepareImport(source, snapshot([]), NOW), /active relay/);
  source.rooms[0].relay.active = false;
  source.rooms[0].members.push({ id: 'agent-1' });
  assert.throws(() => prepareImport(source, snapshot([]), NOW), /duplicate member ID/);
});

test('requires an absolute source and resolves legacy snapshot location', () => {
  assert.throws(() => inputPath('relative'), /absolute/);
  assert.match(inputPath(require('node:path').resolve('legacy')), /\.browser-ai-bridge[\\/]dex-state\.json$/);
});
