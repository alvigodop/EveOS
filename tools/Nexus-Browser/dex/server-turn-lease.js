const TURN_IDLE_TIMEOUT_MS = 4 * 60 * 1000;
const TURN_ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000;
const TURN_TIMEOUT_MS = TURN_IDLE_TIMEOUT_MS;
const LEASE_PERSIST_INTERVAL_MS = 15 * 1000;

function activityFromTransport(msg = {}) {
  if (['prompt_accepted', 'prompt_dispatched'].includes(msg.type)) return { event: msg.type };
  if (msg.type === 'response_partial') return { event: msg.type, progress: true };
  if (msg.type === 'response_activity') {
    return {
      event: msg.event || msg.type,
      generating: msg.isGenerating === true ? true : msg.isGenerating === false ? false : null,
      progress: msg.progress === true
    };
  }
  if (msg.type === 'activity_update') return { event: msg.type };
  return null;
}

function createServerTurnLease({
  load,
  save,
  roomById,
  getCurrent,
  onTimeout,
  now = () => new Date().toISOString(),
  nowMs = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  let timer = null;
  let lastPersistAtMs = null;
  let lastPersistRequestId = null;

  function clear() {
    if (timer) clearTimer(timer);
    timer = null;
  }

  function state() {
    const current = getCurrent?.();
    if (!current) return null;
    const startedAtMs = Number(current.startedAtMs ?? nowMs());
    const lastActivityAtMs = Number(current.lastActivityAtMs ?? startedAtMs);
    return {
      current,
      startedAtMs,
      lastActivityAtMs,
      generationState: current.generationState || 'unknown'
    };
  }

  function persist(current, fields, { force = false } = {}) {
    const stampMs = nowMs();
    const sameRequest = lastPersistRequestId === current.requestId;
    if (!force && sameRequest && Number.isFinite(lastPersistAtMs)
        && stampMs - lastPersistAtMs < LEASE_PERSIST_INTERVAL_MS) return false;
    const snapshot = load();
    const room = roomById(snapshot, current.roomId);
    if (!room?.recovery) return false;
    Object.assign(room.recovery, fields);
    save(snapshot);
    lastPersistAtMs = stampMs;
    lastPersistRequestId = current.requestId;
    return true;
  }

  function arm(requestId) {
    clear();
    const lease = state();
    if (!lease || lease.current.requestId !== requestId) return false;
    const tick = nowMs();
    const idleRemaining = TURN_IDLE_TIMEOUT_MS - Math.max(0, tick - lease.lastActivityAtMs);
    const absoluteRemaining = TURN_ABSOLUTE_TIMEOUT_MS - Math.max(0, tick - lease.startedAtMs);
    const delay = Math.max(1, Math.min(idleRemaining, absoluteRemaining));
    timer = setTimer(async () => {
      const next = state();
      if (!next || next.current.requestId !== requestId) return;
      const at = nowMs();
      const absoluteElapsed = Math.max(0, at - next.startedAtMs);
      const idleElapsed = Math.max(0, at - next.lastActivityAtMs);
      if (absoluteElapsed >= TURN_ABSOLUTE_TIMEOUT_MS) {
        return onTimeout({
          code: 'RESPONSE_TIMEOUT_ABSOLUTE',
          message: 'Agent turn exceeded the absolute server-owned safety ceiling.'
        });
      }
      if (idleElapsed >= TURN_IDLE_TIMEOUT_MS) {
        const active = next.generationState === 'active';
        return onTimeout({
          code: active ? 'RESPONSE_TIMEOUT_ACTIVE' : 'RESPONSE_TIMEOUT',
          message: active
            ? 'Agent generation stopped reporting activity before the server lease expired.'
            : 'Agent response stopped reporting activity before the server lease expired.'
        });
      }
      return arm(requestId);
    }, delay);
    return true;
  }

  function begin() {
    const current = getCurrent?.();
    if (!current) return false;
    const stampMs = nowMs();
    const stamp = now();
    Object.assign(current, {
      startedAtMs: stampMs,
      lastActivityAtMs: stampMs,
      lastProgressAtMs: stampMs,
      lastActivityEvent: 'dispatch',
      generationState: 'unknown'
    });
    persist(current, {
      lastActivityAt: stamp,
      lastProgressAt: stamp,
      lastActivityEvent: 'dispatch',
      generationState: 'unknown'
    }, { force: true });
    return arm(current.requestId);
  }

  function touch({ event = 'activity', generating = null, progress = false } = {}) {
    const current = getCurrent?.();
    if (!current) return false;
    const stampMs = nowMs();
    const stamp = now();
    const previousGenerationState = current.generationState || 'unknown';
    current.lastActivityAtMs = stampMs;
    current.lastActivityEvent = event;
    if (progress) current.lastProgressAtMs = stampMs;
    if (generating === true) current.generationState = 'active';
    else if (generating === false) current.generationState = 'idle';

    const fields = {
      lastActivityAt: stamp,
      lastProgressAt: new Date(current.lastProgressAtMs).toISOString(),
      lastActivityEvent: event,
      generationState: current.generationState || 'unknown'
    };
    const generationChanged = current.generationState !== previousGenerationState;
    const dispatchBoundary = event === 'prompt_accepted' || event === 'prompt_dispatched';
    persist(current, fields, { force: generationChanged || dispatchBoundary });
    return arm(current.requestId);
  }

  function diagnostics() {
    const lease = state();
    if (!lease) return null;
    const snapshot = load();
    const room = roomById(snapshot, lease.current.roomId);
    return {
      elapsedMs: Math.max(0, nowMs() - lease.startedAtMs),
      lastActivityAt: room?.recovery?.lastActivityAt || null,
      lastProgressAt: room?.recovery?.lastProgressAt || null,
      lastActivityEvent: lease.current.lastActivityEvent || null,
      generationState: lease.current.generationState || 'unknown'
    };
  }

  return { begin, touch, clear, arm, diagnostics };
}

module.exports = {
  TURN_TIMEOUT_MS,
  TURN_IDLE_TIMEOUT_MS,
  TURN_ABSOLUTE_TIMEOUT_MS,
  LEASE_PERSIST_INTERVAL_MS,
  activityFromTransport,
  createServerTurnLease
};
