const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDexStateStore } = require('../dex/state-store.js');

test('Dex state store persists room snapshots atomically across recreation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-state-'));
  const filePath = path.join(dir, 'dex-state.json');
  const first = createDexStateStore({ filePath });
  first.save({
    rooms: [{ id: 'room-1', name: 'Durable room', updatedAt: '2026-09-18T08:00:00.000Z' }],
    activeRoomId: 'room-1',
    savedAt: '2026-09-18T08:01:00.000Z'
  });
  const second = createDexStateStore({ filePath });
  const loaded = second.load();
  assert.equal(loaded.rooms[0].name, 'Durable room');
  assert.equal(loaded.activeRoomId, 'room-1');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Dex state store tolerates missing or malformed files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-state-'));
  const filePath = path.join(dir, 'dex-state.json');
  fs.writeFileSync(filePath, '{bad json', 'utf8');
  assert.equal(createDexStateStore({ filePath }).load(), null);
  fs.rmSync(dir, { recursive: true, force: true });
});


test('Dex state store applies deterministic repair before persisting a stopped room snapshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-state-'));
  const filePath = path.join(dir, 'dex-state.json');
  const store = createDexStateStore({ filePath });
  store.save({
    rooms: [{
      id: 'room-1', members: [{ id: 'eve' }], messages: [],
      relay: { active: false, remaining: 3, waitingFor: 'eve', lastStopReason: 'Stopped' }
    }],
    activeRoomId: 'room-1'
  });
  const loaded = createDexStateStore({ filePath });
  assert.equal(loaded.load().rooms[0].relay.remaining, 0);
  assert.equal(loaded.load().rooms[0].relay.waitingFor, null);
  fs.rmSync(dir, { recursive: true, force: true });
});
