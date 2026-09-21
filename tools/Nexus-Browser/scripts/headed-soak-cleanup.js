const fs = require('node:fs');
const { readDiagnostics } = require('./bridge-doctor.js');

function staleSoakRoom(room) {
  return /^Dex Transport Soak\s/.test(String(room?.name || ''))
    && room?.relay?.active !== true
    && !room?.relay?.waitingFor
    && !room?.pendingTurn;
}

async function serverOnline() {
  try {
    await readDiagnostics();
    return true;
  } catch {
    return false;
  }
}

function atomicWrite(filePath, value) {
  const temp = `${filePath}.${process.pid}.cleanup.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), 'utf8');
  fs.renameSync(temp, filePath);
}

async function cleanupStaleOffline(filePath, { isServerOnline = serverOnline } = {}) {
  if (await isServerOnline()) {
    throw Object.assign(
      new Error('Stop the Nexus Browser server before stale-soak offline cleanup, then rerun --cleanup-stale.'),
      { code: 'SOAK_CLEANUP_SERVER_RUNNING' }
    );
  }

  let snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch {
    throw Object.assign(new Error('Dex state file is unavailable or invalid.'), { code: 'SOAK_CLEANUP_STATE_INVALID' });
  }

  const rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
  const stale = rooms.filter(staleSoakRoom);
  if (!stale.length) return { ok: true, status: 'CLEAN', deleted: [] };

  const deletedIds = new Set(stale.map((room) => room.id));
  const remaining = rooms.filter((room) => !deletedIds.has(room.id));
  snapshot.rooms = remaining;
  if (!remaining.some((room) => room.id === snapshot.activeRoomId)) {
    snapshot.activeRoomId = remaining[0]?.id || null;
  }
  snapshot.savedAt = new Date().toISOString();
  atomicWrite(filePath, snapshot);

  return {
    ok: true,
    status: 'CLEANED',
    deleted: stale.map((room) => ({ id: room.id, name: room.name }))
  };
}

module.exports = { staleSoakRoom, serverOnline, cleanupStaleOffline };
