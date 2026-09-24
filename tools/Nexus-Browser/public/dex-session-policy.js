(() => {
  const SESSION_KEY = 'browser-ai-bridge.dex.server-session.v1';
  const REVISION_KEY = 'browser-ai-bridge.dex.asset-revision.v1';
  const RELOADED_KEY = 'browser-ai-bridge.dex.reloaded-revisions.v1';

  function createSessionPolicy({
    storage = globalThis.sessionStorage,
    onSoftResync = () => {},
    onAssetChange = () => {}
  } = {}) {
    let seenHandshake = false;
    let session = '';
    let revision = '';

    function observe(id, assetRevision = '') {
      const nextSession = String(id || '');
      if (!nextSession) return { kind: 'invalid' };
      const nextRevision = String(assetRevision || '');
      const first = !seenHandshake;
      const changedSession = !!session && session !== nextSession;
      const changedAssets = !!revision && !!nextRevision && revision !== nextRevision;
      session = nextSession;
      if (nextRevision) revision = nextRevision;
      seenHandshake = true;
      try {
        storage?.setItem?.(SESSION_KEY, session);
        if (nextRevision) storage?.setItem?.(REVISION_KEY, nextRevision);
      } catch {}

      // The initial handshake describes the scripts already loaded by the viewer. A
      // new process with the same asset revision only needs socket/state resync.
      if (first) return { kind: 'handshake', session, revision };
      if (changedSession) onSoftResync({ session, revision });

      if (changedAssets) {
        let reloaded = [];
        try {
          const parsed = JSON.parse(storage?.getItem?.(RELOADED_KEY) || '[]');
          if (Array.isArray(parsed)) reloaded = parsed.filter((item) => typeof item === 'string');
        } catch {}
        if (!reloaded.includes(nextRevision)) {
          reloaded.push(nextRevision);
          try { storage?.setItem?.(RELOADED_KEY, JSON.stringify(reloaded.slice(-32))); } catch {}
          onAssetChange({ session, revision: nextRevision });
          return { kind: 'asset-change', session, revision: nextRevision };
        }
      }
      return { kind: changedSession ? 'soft-restart' : 'same-session', session, revision };
    }

    return { observe };
  }

  const api = { SESSION_KEY, REVISION_KEY, RELOADED_KEY, createSessionPolicy };
  globalThis.BrowserAiBridgeDexSessionPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();