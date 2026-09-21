(() => {
  function cleanUrl(value) {
    return String(value || '').trim();
  }

  function sameUrl(left, right) {
    const a = cleanUrl(left).replace(/\/$/, '');
    const b = cleanUrl(right).replace(/\/$/, '');
    return !!a && a === b;
  }

  async function findExisting({ provider, url, chromeApi = globalThis.chrome }) {
    if (!provider || !url || !chromeApi?.tabs?.query) return null;
    let tabs = [];
    try { tabs = await chromeApi.tabs.query({ url: provider.matchPatterns }); } catch {}
    return tabs.find((tab) => sameUrl(tab.url || tab.pendingUrl, url)) || null;
  }

  async function ensure({ provider, url, chromeApi = globalThis.chrome, open = false }) {
    const existing = await findExisting({ provider, url, chromeApi });
    if (existing) return { tab: existing, created: false };
    if (!open || !chromeApi?.tabs?.create) return { tab: null, created: false };
    const created = await chromeApi.tabs.create({ url, active: false });
    return { tab: created || null, created: !!created };
  }

  const api = { cleanUrl, sameUrl, findExisting, ensure };
  globalThis.BrowserAiBridgeTargetResurrection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
