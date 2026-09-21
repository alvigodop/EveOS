const LEGACY_DISPOSABLE_ROOMS = new Set([
  'Managed Worker Live Proof',
  'Managed Worker Live Proof R15'
]);

function isBusy(room = {}) {
  return room.relay?.active === true
    || !!room.relay?.waitingFor
    || !!room.pendingTurn
    || !!room.recovery;
}

function isDisposableProofRoom(room = {}) {
  if (room.lifecycle?.disposable === true && room.lifecycle?.kind === 'managed-worker-proof') return true;
  return LEGACY_DISPOSABLE_ROOMS.has(String(room.name || '').trim());
}

function managedTargets(room = {}) {
  return (room.members || [])
    .map((member) => member.binding)
    .filter((binding) => binding?.managedByDex === true
      && binding.targetClassId === 'online-origin'
      && Number.isInteger(Number(binding.targetId))
      && !!binding.providerId)
    .map((binding) => ({
      targetId: Number(binding.targetId),
      providerId: binding.providerId,
      url: binding.url || ''
    }));
}

async function cleanupDisposableSnapshot(snapshot, {
  closeTarget,
  makeRequestId = (targetId) => `cleanup-disposable-${Date.now()}-${targetId}`
} = {}) {
  const rooms = Array.isArray(snapshot?.rooms) ? snapshot.rooms : [];
  const candidates = rooms.filter(isDisposableProofRoom);
  const deleted = [], skipped = [], closedTargets = [];
  const deletable = new Set();
  const protectedLastRoomId = candidates.length === rooms.length && candidates.length ? candidates[0].id : null;

  for (const room of candidates) {
    if (room.id === protectedLastRoomId) {
      skipped.push({ id: room.id, name: room.name, reason: 'last-room-safety' });
      continue;
    }
    if (isBusy(room)) {
      skipped.push({ id: room.id, name: room.name, reason: 'busy-or-recovering' });
      continue;
    }
    let cleanupFailed = false;
    for (const target of managedTargets(room)) {
      if (typeof closeTarget !== 'function') {
        skipped.push({ id: room.id, name: room.name, reason: 'managed-target-cleanup-unavailable', target });
        cleanupFailed = true;
        break;
      }
      try {
        const result = await closeTarget({
          requestId: makeRequestId(target.targetId),
          targetId: target.targetId,
          providerId: target.providerId
        });
        closedTargets.push({ ...target, alreadyClosed: !!result?.alreadyClosed });
      } catch (error) {
        skipped.push({
          id: room.id, name: room.name, reason: 'managed-target-close-failed',
          target, code: error.code || null, message: error.message
        });
        cleanupFailed = true;
        break;
      }
    }
    if (!cleanupFailed) deletable.add(room.id);
  }

  const finalRooms = rooms.filter((room) => !deletable.has(room.id));
  for (const room of rooms) {
    if (deletable.has(room.id)) deleted.push({ id: room.id, name: room.name });
  }
  const next = {
    ...snapshot,
    rooms: finalRooms,
    activeRoomId: finalRooms.some((room) => room.id === snapshot?.activeRoomId)
      ? snapshot.activeRoomId
      : (finalRooms[0]?.id || null),
    savedAt: new Date().toISOString()
  };
  return { snapshot: next, deleted, skipped, closedTargets };
}

function createDisposableRoomCleanup({ load, save, closeTarget, broadcastState } = {}) {
  return {
    async run(requestId = '') {
      const snapshot = typeof load === 'function' ? load() : null;
      const result = await cleanupDisposableSnapshot(snapshot || { rooms: [] }, { closeTarget });
      const saved = result.deleted.length && typeof save === 'function' ? save(result.snapshot) : snapshot;
      if (result.deleted.length && typeof broadcastState === 'function') broadcastState(saved);
      return {
        type: 'cleanup_disposable_rooms_result',
        requestId: requestId || null,
        ok: result.skipped.length === 0,
        deleted: result.deleted,
        skipped: result.skipped,
        closedTargets: result.closedTargets,
        remainingRooms: Array.isArray(saved?.rooms) ? saved.rooms.length : 0,
        activeRoomId: saved?.activeRoomId || null
      };
    }
  };
}

module.exports = {
  LEGACY_DISPOSABLE_ROOMS, isBusy, isDisposableProofRoom, managedTargets,
  cleanupDisposableSnapshot, createDisposableRoomCleanup
};
