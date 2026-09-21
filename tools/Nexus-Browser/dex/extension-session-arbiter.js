'use strict';

function createExtensionSessionArbiter({ isOpen = () => true, now = () => Date.now() } = {}) {
  const sessions = new Map();
  let primary = null;

  function liveEntries(exclude = null) {
    return [...sessions.entries()].filter(([socket]) => socket !== exclude && isOpen(socket));
  }

  function best(exclude = null, { requireTabs = false } = {}) {
    const candidates = liveEntries(exclude)
      .filter(([, state]) => state.hasSnapshot && (!requireTabs || state.tabs.length > 0))
      .sort((a, b) => (b[1].tabs.length - a[1].tabs.length) || (b[1].updatedAt - a[1].updatedAt));
    if (candidates.length) return candidates[0][0];
    if (requireTabs) return null;
    return liveEntries(exclude)[0]?.[0] || null;
  }

  function ensurePrimary() {
    if (primary && isOpen(primary) && sessions.has(primary)) return primary;
    primary = best();
    return primary;
  }

  function register(socket) {
    if (!sessions.has(socket)) {
      sessions.set(socket, { hasSnapshot: false, tabs: [], providers: [], target: null, connectedAt: now(), updatedAt: 0 });
    }
    if (!ensurePrimary()) primary = socket;
    return current();
  }

  function update(socket, snapshot = {}) {
    register(socket);
    const state = sessions.get(socket);
    state.hasSnapshot = true;
    state.tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
    state.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
    state.target = snapshot.target || null;
    state.updatedAt = now();

    ensurePrimary();
    const primaryState = sessions.get(primary);
    if (socket === primary && state.tabs.length === 0) {
      const replacement = best(socket, { requireTabs: true });
      if (replacement) primary = replacement;
    } else if (socket !== primary && state.tabs.length > 0
        && (!primaryState?.hasSnapshot || primaryState.tabs.length === 0)) {
      primary = socket;
    }
    return current();
  }

  function drop(socket) {
    const wasPrimary = socket === primary;
    sessions.delete(socket);
    if (wasPrimary) primary = null;
    ensurePrimary();
    return { ...current(), wasPrimary };
  }

  function current() {
    ensurePrimary();
    const state = primary ? sessions.get(primary) : null;
    return {
      socket: primary,
      snapshot: state?.hasSnapshot ? { tabs: state.tabs, providers: state.providers, target: state.target } : null,
      sessionCount: liveEntries().length
    };
  }

  function isPrimary(socket) {
    ensurePrimary();
    return socket === primary;
  }

  function diagnostics() {
    ensurePrimary();
    const live = liveEntries();
    const state = primary ? sessions.get(primary) : null;
    return {
      connected: live.length,
      primaryReady: !!state?.hasSnapshot,
      primaryTabs: state?.hasSnapshot ? state.tabs.length : null,
      standby: live.filter(([socket]) => socket !== primary).map(([, item]) => ({
        ready: item.hasSnapshot,
        tabs: item.hasSnapshot ? item.tabs.length : null
      }))
    };
  }

  return { register, update, drop, current, isPrimary, diagnostics };
}

module.exports = { createExtensionSessionArbiter };
