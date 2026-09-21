const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanupStaleOffline, staleSoakRoom } = require('../scripts/headed-soak-cleanup.js');

test('stale soak matcher includes inactive temporary soak rooms and excludes production or busy rooms', () => {
  assert.equal(staleSoakRoom({
    name: 'Dex Transport Soak abc', relay: { active: false, waitingFor: null }
  }), true);
  assert.equal(staleSoakRoom({
    name: 'Meridian + Compass — Wren Growth Lab', relay: { active: false },
    recovery: { interruptedAt: new Date().toISOString() }
  }), false);
  assert.equal(staleSoakRoom({
    name: 'Dex Transport Soak active', relay: { active: true, waitingFor: null }
  }), false);
  assert.equal(staleSoakRoom({
    name: 'Dex Transport Soak waiting', relay: { active: false, waitingFor: 'agent-x' }
  }), false);
  assert.equal(staleSoakRoom({
    name: 'Dex Transport Soak pending', relay: { active: false, waitingFor: null }, pendingTurn: { memberId: 'agent-x' }
  }), false);
});

test('offline cleanup atomically removes only inactive temporary soak rooms', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-soak-cleanup-'));
  const file = path.join(dir, 'dex-state.json');
  const stale = {
    id: 'soak', name: 'Dex Transport Soak deadbeef',
    relay: { active: false, waitingFor: null },
    members: [], messages: []
  };
  const keep = {
    id: 'growth', name: 'Meridian + Compass — Wren Growth Lab',
    relay: { active: false }, members: [], messages: []
  };
  fs.writeFileSync(file, JSON.stringify({ version: 1, rooms: [stale, keep], activeRoomId: 'soak', savedAt: new Date().toISOString() }));
  try {
    const result = await cleanupStaleOffline(file, { isServerOnline: async () => false });
    assert.equal(result.status, 'CLEANED');
    assert.deepEqual(result.deleted.map((room) => room.id), ['soak']);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(saved.rooms.map((room) => room.id), ['growth']);
    assert.equal(saved.activeRoomId, 'growth');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('offline cleanup refuses to mutate state while bridge is online', async () => {
  await assert.rejects(
    () => cleanupStaleOffline('unused.json', { isServerOnline: async () => true }),
    (error) => error.code === 'SOAK_CLEANUP_SERVER_RUNNING'
  );
});
