(() => {
  function formatTarget(tab = {}, provider = {}, { titlePrefix = '', health = tab.health || null } = {}) {
    const url = tab.url || tab.pendingUrl || '';
    return {
      id: tab.id,
      windowId: tab.windowId,
      title: `${titlePrefix}${tab.title || provider.name || 'Provider'}`,
      url,
      targetClassId: 'online-origin',
      targetTypeId: 'browser-tab',
      targetTypeName: 'Browser Tab',
      providerId: provider.id,
      providerName: provider.name,
      transport: 'browser-extension',
      sessionOrigin: 'browser',
      concreteTargetIdentity: {
        kind: 'browser-tab', tabId: tab.id, windowId: tab.windowId,
        providerId: provider.id, url
      },
      capabilities: { ...(provider.capabilities || {}) },
      ...(health ? { health } : {})
    };
  }

  const api = { formatTarget };
  globalThis.BrowserAiBridgeTargetMetadata = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
