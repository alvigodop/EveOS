const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isDisposableProofRoom,
  cleanupDisposableSnapshot
} = require('../dex/disposable-room-cleanup');
const providerControl = require('../public/dex-provider-control');

function room(id, name, extra = {}) {
  return {
    id, name,
    members: [],
    relay: { active: false, waitingFor: null },
    pendingTurn: null,
    recovery: null,
    ...extra
  };
}

test('disposable cleanup recognizes tagged rooms and only the two pre-tagging legacy rooms', () => {
  assert.equal(isDisposableProofRoom(room('t', 'Any', {
    lifecycle: { disposable: true, kind: 'managed-worker-proof' }
  })), true);
  assert.equal(isDisposableProofRoom(room('l1', 'Managed Worker Live Proof')), true);
  assert.equal(isDisposableProofRoom(room('l2', 'Managed Worker Live Proof R15')), true);
  assert.equal(isDisposableProofRoom(room('prod', 'Meridian + Compass — Wren Growth Lab')), false);
  assert.equal(isDisposableProofRoom(room('lookalike', 'Managed Worker Live Proof R99')), false);
});

test('cleanup closes managed targets before deleting idle disposable and legacy rooms', async () => {
  const snapshot = {
    activeRoomId: 'legacy',
    rooms: [
      room('prod', 'Production Room'),
      room('legacy', 'Managed Worker Live Proof', {
        members: [{
          id: 'worker',
          binding: {
            targetClassId: 'online-origin',
            targetId: 77,
            providerId: 'muse',
            url: 'https://muse.ai/thread/old',
            managedByDex: true
          }
        }]
      }),
      room('r15', 'Managed Worker Live Proof R15'),
      room('tagged', 'Proof 2026', {
        lifecycle: { disposable: true, kind: 'managed-worker-proof' }
      })
    ]
  };
  const closed = [];
  const result = await cleanupDisposableSnapshot(snapshot, {
    closeTarget: async (target) => {
      closed.push(target);
      return { ok: true, alreadyClosed: true };
    },
    makeRequestId: (targetId) => `cleanup-${targetId}`
  });

  assert.deepEqual(result.deleted.map((entry) => entry.id).sort(), ['legacy', 'r15', 'tagged']);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.closedTargets.length, 1);
  assert.equal(result.closedTargets[0].targetId, 77);
  assert.equal(result.closedTargets[0].alreadyClosed, true);
  assert.deepEqual(result.snapshot.rooms.map((entry) => entry.id), ['prod']);
  assert.equal(result.snapshot.activeRoomId, 'prod');
  assert.equal(closed[0].requestId, 'cleanup-77');
});

test('busy or recovering disposable rooms are skipped without target cleanup', async () => {
  const snapshot = {
    activeRoomId: 'prod',
    rooms: [
      room('prod', 'Production Room'),
      room('busy', 'Busy Proof', {
        lifecycle: { disposable: true, kind: 'managed-worker-proof' },
        relay: { active: true, waitingFor: null }
      }),
      room('recovery', 'Recovery Proof', {
        lifecycle: { disposable: true, kind: 'managed-worker-proof' },
        recovery: { requestId: 'turn-1' }
      })
    ]
  };
  let closeCalls = 0;
  const result = await cleanupDisposableSnapshot(snapshot, {
    closeTarget: async () => { closeCalls += 1; return { ok: true }; }
  });
  assert.equal(result.deleted.length, 0);
  assert.equal(result.skipped.length, 2);
  assert.equal(closeCalls, 0);
  assert.equal(result.snapshot.rooms.length, 3);
});

test('managed target close failure preserves the room instead of orphaning cleanup state', async () => {
  const snapshot = {
    activeRoomId: 'prod',
    rooms: [
      room('prod', 'Production Room'),
      room('tagged', 'Proof', {
        lifecycle: { disposable: true, kind: 'managed-worker-proof' },
        members: [{
          id: 'worker',
          binding: {
            targetClassId: 'online-origin',
            targetId: 88,
            providerId: 'muse',
            managedByDex: true
          }
        }]
      })
    ]
  };
  const error = Object.assign(new Error('close failed'), { code: 'TARGET_CLOSE_FAILED' });
  const result = await cleanupDisposableSnapshot(snapshot, {
    closeTarget: async () => { throw error; }
  });
  assert.equal(result.deleted.length, 0);
  assert.equal(result.skipped[0].reason, 'managed-target-close-failed');
  assert.equal(result.snapshot.rooms.some((entry) => entry.id === 'tagged'), true);
});

test('cleanup preserves one final room as a safety fallback', async () => {
  const snapshot = {
    activeRoomId: 'only',
    rooms: [room('only', 'Managed Worker Live Proof R15')]
  };
  const result = await cleanupDisposableSnapshot(snapshot);
  assert.equal(result.deleted.length, 0);
  assert.equal(result.skipped[0].reason, 'last-room-safety');
  assert.equal(result.snapshot.rooms[0].id, 'only');
});


test('provider-created managed-worker proof rooms persist an explicit disposable lifecycle tag', () => {
  const state = { rooms: [], tabs: [], localTargets: [], providers: [] };
  const source = {
    targetClassId: 'online-origin', targetId: 10, providerId: 'chatgpt',
    providerName: 'ChatGPT', url: 'https://chatgpt.com/c/proof'
  };
  const controller = providerControl.createController({
    state,
    storage: { getItem() { return null; }, setItem() {} },
    roomMessage() {},
    startRelay() {},
    persist() {},
    renderAll() {},
    uid() { return 'agent-proof'; },
    createRoom() {
      return {
        id: 'room-proof', name: 'Dex Room', userName: 'User',
        members: [], messages: [],
        settings: { autoRelay: true, maxTurns: 8, contextMessages: 8 },
        relay: { active: false, waitingFor: null }
      };
    }
  });
  const result = controller.handle({
    source,
    command: {
      action: 'create_room', name: 'Managed Worker Proof',
      disposable: true, purpose: 'managed-worker-proof'
    }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(state.rooms[0].lifecycle, {
    disposable: true,
    kind: 'managed-worker-proof',
    createdBy: 'provider-control'
  });
});
