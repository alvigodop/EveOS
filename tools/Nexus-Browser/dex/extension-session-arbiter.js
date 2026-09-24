'use strict';

function createExtensionSessionArbiter({ isOpen = () => true, now = () => Date.now(), maxTransitions = 24 } = {}) {
  const sessions = new Map();
  let primary = null;
  let nextSessionId = 1;
  let connectionEpoch = 0;
  const recentTransitions = [];

  function sessionId(socket) { return sessions.get(socket)?.sessionId || null; }
  function record(type, detail = {}) {
    recentTransitions.push({ at: now(), type, ...detail });
    while (recentTransitions.length > maxTransitions) recentTransitions.shift();
  }
  function setPrimary(socket, reason) {
    if (socket === primary) return false;
    const previousSessionId = sessionId(primary);
    primary = socket || null;
    record('primary-changed', { reason, previousSessionId, nextSessionId: sessionId(primary) });
    return true;
  }

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

  function ensurePrimary(reason = 'primary-unavailable') {
    if (primary && isOpen(primary) && sessions.has(primary)) return primary;
    setPrimary(best(), reason);
    return primary;
  }

  function register(socket) {
    if (!sessions.has(socket)) {
      const state = {
        sessionId: `extension-${nextSessionId++}`, connectionEpoch: ++connectionEpoch,
        hasSnapshot: false, tabs: [], providers: [], target: null,
        connectedAt: now(), updatedAt: 0, snapshotCount: 0
      };
      sessions.set(socket, state);
      record('connected', { sessionId: state.sessionId, connectionEpoch: state.connectionEpoch });
    }
    if (!ensurePrimary('first-live-session')) setPrimary(socket, 'first-live-session');
    return current();
  }

  function update(socket, snapshot = {}) {
    register(socket);
    const state = sessions.get(socket);
    const tabsBefore = state.tabs.length;
    const providersBefore = state.providers.map((provider) => provider.id).filter(Boolean).sort();
    state.hasSnapshot = true;
    state.tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
    state.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
    state.target = snapshot.target || null;
    state.updatedAt = now();
    state.snapshotCount += 1;
    const providersAfter = state.providers.map((provider) => provider.id).filter(Boolean).sort();
    if (tabsBefore !== state.tabs.length || providersBefore.join('|') !== providersAfter.join('|')) {
      record('snapshot-changed', {
        sessionId: state.sessionId, connectionEpoch: state.connectionEpoch,
        tabsBefore, tabsAfter: state.tabs.length,
        providersBefore, providersAfter
      });
    }

    ensurePrimary();
    const primaryState = sessions.get(primary);
    if (socket === primary && state.tabs.length === 0) {
      const replacement = best(socket, { requireTabs: true });
      if (replacement) setPrimary(replacement, 'primary-empty-richer-standby');
    } else if (socket !== primary && state.tabs.length > 0
        && (!primaryState?.hasSnapshot || state.tabs.length > primaryState.tabs.length)) {
      setPrimary(socket, primaryState?.hasSnapshot ? 'richer-populated-session' : 'first-ready-session');
    }
    return current();
  }

  function drop(socket, { closeCode = null, closeReason = '' } = {}) {
    const wasPrimary = socket === primary;
    const state = sessions.get(socket);
    record('disconnected', {
      sessionId: state?.sessionId || null, connectionEpoch: state?.connectionEpoch || null,
      closeCode, closeReason: String(closeReason || ''), wasPrimary
    });
    sessions.delete(socket);
    if (wasPrimary) setPrimary(null, 'primary-disconnected');
    ensurePrimary('promote-after-disconnect');
    return { ...current(), wasPrimary };
  }

  function current() {
    ensurePrimary();
    const state = primary ? sessions.get(primary) : null;
    return {
      socket: primary,
      snapshot: state?.hasSnapshot ? { tabs: state.tabs, providers: state.providers, target: state.target } : null,
      sessionCount: liveEntries().length,
      primarySessionId: state?.sessionId || null,
      primaryConnectionEpoch: state?.connectionEpoch || null
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
      primarySessionId: state?.sessionId || null,
      primaryConnectionEpoch: state?.connectionEpoch || null,
      standby: live.filter(([socket]) => socket !== primary).map(([, item]) => ({
        sessionId: item.sessionId, connectionEpoch: item.connectionEpoch,
        ready: item.hasSnapshot, tabs: item.hasSnapshot ? item.tabs.length : null
      })),
      recentTransitions: recentTransitions.map((entry) => ({ ...entry }))
    };
  }

  return { register, update, drop, current, isPrimary, diagnostics };
}

module.exports = { createExtensionSessionArbiter };
