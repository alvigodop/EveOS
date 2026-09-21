(() => {
  const revisionApi = globalThis.BrowserAiBridgeProviderAdapterRevision
    || (typeof module !== 'undefined' && module.exports ? require('./content/provider-adapter-revision.js') : null);
  if (!revisionApi) throw new Error('Provider adapter revision module failed to load.');
  const ADAPTER_REVISION = revisionApi.ADAPTER_REVISION;
  const PING = { type: 'provider_adapter_revision_ping' };

  async function probe(tabId, chromeApi = globalThis.chrome) {
    try {
      const result = await chromeApi.tabs.sendMessage(Number(tabId), PING);
      return {
        ok: !!result?.ok && result.adapter === 'provider-adapter-revision',
        revision: Number(result?.revision || 0)
      };
    } catch {
      return { ok: false, revision: 0 };
    }
  }

  function current(status) {
    return !!status?.ok && status.revision === ADAPTER_REVISION;
  }

  async function groupReady(tabId, group, chromeApi = globalThis.chrome) {
    try {
      const result = await chromeApi.tabs.sendMessage(Number(tabId), { type: group.pingType });
      return !!result?.ok && (!group.expectedAdapter || result.adapter === group.expectedAdapter);
    } catch {
      return false;
    }
  }

  async function providerReady(tabId, provider, chromeApi = globalThis.chrome) {
    if (!provider?.groups?.length) return false;
    for (const group of provider.groups) {
      if (!(await groupReady(tabId, group, chromeApi))) return false;
    }
    return true;
  }

  async function waitForCurrent(tabId, provider, chromeApi = globalThis.chrome, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const tab = await chromeApi.tabs.get(Number(tabId)).catch(() => null);
      if (!tab) throw new Error('Provider tab disappeared while refreshing its adapter revision.');
      if (tab.status === 'complete') {
        const status = await probe(tabId, chromeApi);
        if (current(status) && await providerReady(tabId, provider, chromeApi)) return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const error = new Error('Provider tab did not load the current complete adapter stack after refresh.');
    error.code = 'PROVIDER_ADAPTER_REVISION_STALE';
    throw error;
  }

  async function ensure(tabId, provider, chromeApi = globalThis.chrome) {
    if (!Number.isInteger(Number(tabId)) || !provider) {
      const error = new Error('Provider adapter freshness requires an exact tab and provider.');
      error.code = 'PROVIDER_ADAPTER_TARGET_INVALID';
      throw error;
    }
    const before = await probe(tabId, chromeApi);
    if (current(before) && await providerReady(tabId, provider, chromeApi)) {
      return { ok: true, refreshed: false, revision: ADAPTER_REVISION };
    }
    await chromeApi.tabs.reload(Number(tabId), { bypassCache: true });
    await waitForCurrent(tabId, provider, chromeApi);
    return { ok: true, refreshed: true, revision: ADAPTER_REVISION, previousRevision: before.revision || 0 };
  }

  const api = {
    ADAPTER_REVISION, PING, probe, current, groupReady, providerReady, waitForCurrent, ensure
  };
  globalThis.BrowserAiBridgeProviderAdapterFreshness = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
