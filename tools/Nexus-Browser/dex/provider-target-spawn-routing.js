const EXPIRED_SPAWN_TTL_MS = 120000;

function createProviderTargetSpawnRouting({
  safeSend,
  getExtensionSocket,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  const pending = new Map();
  const expiredSpawns = new Map();

  function extension() {
    return typeof getExtensionSocket === 'function' ? getExtensionSocket() : null;
  }

  function pruneExpired() {
    const stamp = now();
    for (const [requestId, expiresAt] of expiredSpawns) {
      if (expiresAt <= stamp) expiredSpawns.delete(requestId);
    }
  }

  function request(type, payload = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const socket = extension();
      if (!socket) {
        const error = new Error('Browser extension bridge is offline.');
        error.code = 'EXTENSION_OFFLINE';
        reject(error);
        return;
      }
      const requestId = String(payload.requestId || '');
      if (!requestId) {
        const error = new Error('Managed target request requires a requestId.');
        error.code = 'DEX_CONTROL_BAD_REQUEST';
        reject(error);
        return;
      }
      const timer = setTimer(() => {
        pending.delete(requestId);
        if (type === 'spawn_target') {
          expiredSpawns.set(requestId, now() + EXPIRED_SPAWN_TTL_MS);
          pruneExpired();
        }
        const error = new Error(`Managed target ${type} timed out.`);
        error.code = 'DEX_CONTROL_TARGET_TIMEOUT';
        reject(error);
      }, timeoutMs);
      pending.set(requestId, { type, resolve, reject, timer });
      if (!safeSend(socket, { type, ...payload })) {
        clearTimer(timer);
        pending.delete(requestId);
        const error = new Error('Browser extension bridge is offline.');
        error.code = 'EXTENSION_OFFLINE';
        reject(error);
      }
    });
  }

  function spawn({ requestId, providerId }) {
    return request('spawn_target', {
      requestId: `spawn-${requestId}`,
      providerId
    }, 40000).then((msg) => msg.target);
  }

  function close({ requestId, targetId, providerId }) {
    return request('close_target', {
      requestId: `close-${requestId}`,
      tabId: Number(targetId),
      providerId
    }).then((msg) => ({
      ok: true,
      alreadyClosed: !!msg.alreadyClosed,
      tabId: Number(targetId),
      providerId
    }));
  }

  function closeExpiredSpawn(msg) {
    const requestId = String(msg?.requestId || '');
    pruneExpired();
    if (msg?.type !== 'target_spawned' || !expiredSpawns.has(requestId)) return false;
    expiredSpawns.delete(requestId);
    const target = msg.target || {};
    const tabId = Number(target.id);
    if (!Number.isInteger(tabId) || !target.providerId) return true;
    safeSend(extension(), {
      type: 'close_target',
      requestId: `expired-${requestId}`,
      tabId,
      providerId: target.providerId
    });
    return true;
  }

  function observe(msg) {
    const requestId = String(msg?.requestId || '');
    const entry = pending.get(requestId);
    if (!entry) {
      if (closeExpiredSpawn(msg)) return true;
      if (msg?.type === 'target_closed' && requestId.startsWith('expired-spawn-')) return true;
      return false;
    }

    if (msg.type === 'error') {
      clearTimer(entry.timer);
      pending.delete(requestId);
      const error = new Error(msg.message || 'Managed provider target operation failed.');
      error.code = msg.code || 'DEX_CONTROL_TARGET_FAILED';
      error.detail = msg.detail || null;
      entry.reject(error);
      return true;
    }

    const expected = entry.type === 'spawn_target' ? 'target_spawned' : 'target_closed';
    if (msg.type !== expected) return false;
    clearTimer(entry.timer);
    pending.delete(requestId);
    entry.resolve(msg);
    return true;
  }

  function failAll(message = 'Browser extension bridge disconnected during managed target operation.') {
    for (const [requestId, entry] of pending) {
      clearTimer(entry.timer);
      pending.delete(requestId);
      if (entry.type === 'spawn_target') expiredSpawns.set(requestId, now() + EXPIRED_SPAWN_TTL_MS);
      const error = new Error(message);
      error.code = 'EXTENSION_OFFLINE';
      entry.reject(error);
    }
    pruneExpired();
  }

  return { spawn, close, observe, failAll, pending, expiredSpawns, pruneExpired };
}

module.exports = { EXPIRED_SPAWN_TTL_MS, createProviderTargetSpawnRouting };
