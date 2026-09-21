(() => {
  function createCache({ ttlMs = 15000, now = Date.now } = {}) {
    const values = new Map();

    function key(tabId, providerId) {
      return `${Number(tabId)}:${String(providerId || '')}`;
    }

    function fresh(tabId, providerId) {
      const saved = values.get(key(tabId, providerId));
      return !!saved && now() - saved < ttlMs;
    }

    function mark(tabId, providerId) {
      values.set(key(tabId, providerId), now());
    }

    function invalidate(tabId = null) {
      if (tabId == null) { values.clear(); return; }
      const prefix = `${Number(tabId)}:`;
      for (const candidate of values.keys()) if (candidate.startsWith(prefix)) values.delete(candidate);
    }

    return { fresh, mark, invalidate };
  }

  const api = { createCache };
  globalThis.BrowserAiBridgeAdapterReadinessCache = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
