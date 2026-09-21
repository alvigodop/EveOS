(() => {
  const KEY = 'browser-ai-bridge.selected-target.v1';

  function createStore(storage = globalThis.chrome?.storage?.local) {
    async function read() {
      if (!storage?.get) return null;
      try {
        const result = await storage.get(KEY);
        const value = result?.[KEY];
        if (!value || !Number.isInteger(Number(value.tabId)) || !value.providerId) return null;
        return {
          tabId: Number(value.tabId),
          providerId: String(value.providerId),
          url: String(value.url || '')
        };
      } catch {
        return null;
      }
    }

    async function write(tabId, providerId, url = '') {
      if (!storage?.set || !Number.isInteger(Number(tabId)) || !providerId) return false;
      try {
        await storage.set({
          [KEY]: {
            tabId: Number(tabId), providerId: String(providerId),
            url: String(url || ''), savedAt: Date.now()
          }
        });
        return true;
      } catch {
        return false;
      }
    }

    async function clear() {
      if (!storage?.remove) return false;
      try { await storage.remove(KEY); return true; }
      catch { return false; }
    }

    return { read, write, clear };
  }

  const api = { KEY, createStore };
  globalThis.BrowserAiBridgeTargetState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
