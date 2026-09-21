(() => {
  const runtimeConfig = globalThis.NexusBrowserRuntimeConfig
    || (typeof require === 'function' ? require('./runtime-config') : null);
  if (!runtimeConfig) throw new Error('Nexus Browser runtime configuration is unavailable.');
  const DEX_URL = runtimeConfig.dexUrl;

  async function ensureDexUiTab(chromeApi = globalThis.chrome, url = DEX_URL) {
    if (!chromeApi?.tabs?.query || !chromeApi?.tabs?.create) {
      return { ok: false, code: 'TABS_UNAVAILABLE' };
    }
    let tabs = [];
    try { tabs = await chromeApi.tabs.query({ url: runtimeConfig.tabPattern }); } catch {}
    const existing = tabs.find((tab) => !tab.discarded) || tabs[0] || null;
    if (existing?.id != null) {
      if (existing.discarded && chromeApi.tabs.reload) {
        try { await chromeApi.tabs.reload(existing.id, { bypassCache: true }); } catch {}
      }
      return { ok: true, created: false, tabId: existing.id };
    }
    try {
      const created = await chromeApi.tabs.create({ url, active: false });
      return { ok: true, created: true, tabId: created?.id ?? null };
    } catch (error) {
      return { ok: false, code: 'DEX_UI_OPEN_FAILED', message: error.message };
    }
  }

  const api = { DEX_URL, ensureDexUiTab };
  globalThis.BrowserAiBridgeDexUiEnsure = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
