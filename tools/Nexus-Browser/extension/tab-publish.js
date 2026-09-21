(() => {
  function normalizedTab(tab = {}) {
    return {
      id: Number(tab.id),
      providerId: String(tab.providerId || ''),
      title: String(tab.title || ''),
      url: String(tab.url || ''),
      health: tab.health ? {
        state: String(tab.health.state || ''), blocking: !!tab.health.blocking,
        action: String(tab.health.action || ''), summary: String(tab.health.summary || ''),
        cooldownUntil: tab.health.cooldownUntil || null
      } : null
    };
  }

  function tabsSignature(tabs = [], target = null) {
    const normalized = [...tabs]
      .map(normalizedTab)
      .sort((a, b) => String(a.providerId).localeCompare(String(b.providerId)) || a.id - b.id || a.url.localeCompare(b.url));
    return JSON.stringify({ tabs: normalized, target: target ? normalizedTab(target) : null });
  }

  function createDebouncedPublisher(callback, delayMs = 350, timers = globalThis) {
    let timer = null;
    return {
      schedule() {
        if (timer != null) timers.clearTimeout(timer);
        timer = timers.setTimeout(() => {
          timer = null;
          Promise.resolve(callback()).catch(() => {});
        }, delayMs);
      },
      cancel() {
        if (timer != null) timers.clearTimeout(timer);
        timer = null;
      },
      pending: () => timer != null
    };
  }

  function createTabPublishController({
    loadTabs,
    resolveTarget,
    publicProviders,
    send,
    onError = () => {},
    delayMs = 350,
    timers = globalThis
  }) {
    let lastSignature = '';

    async function publish({ force = false } = {}) {
      try {
        const tabs = await loadTabs();
        const target = resolveTarget(tabs);
        const signature = tabsSignature(tabs, target);
        if (!force && signature === lastSignature) return false;
        const sent = !!send({ type: 'tabs_update', providers: publicProviders(), tabs, target });
        if (sent) lastSignature = signature;
        return sent;
      } catch (error) {
        onError(error);
        return false;
      }
    }

    const debounced = createDebouncedPublisher(() => publish(), delayMs, timers);
    return {
      publish,
      schedule: () => debounced.schedule(),
      reset() {
        lastSignature = '';
        debounced.cancel();
      },
      signature: () => lastSignature
    };
  }

  const api = { normalizedTab, tabsSignature, createDebouncedPublisher, createTabPublishController };
  globalThis.BrowserAiBridgeTabPublish = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
