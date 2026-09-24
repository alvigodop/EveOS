(() => {
  const SETTLE_MS = 120;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function activeTabInWindow(tabsApi, windowId) {
    try {
      const tabs = await tabsApi.query({ active: true, windowId });
      return tabs?.[0] || null;
    } catch { return null; }
  }

  async function prepare(tabId, chromeApi, { sleepImpl = sleep } = {}) {
    const tab = await chromeApi.tabs.get(tabId);
    if (!tab?.id || tab.windowId == null) throw new Error('Background dispatch target has no browser window.');
    const win = await chromeApi.windows.get(tab.windowId);
    const previous = await activeTabInWindow(chromeApi.tabs, tab.windowId);
    const restoreState = win?.state === 'minimized' ? 'minimized' : null;
    const restoreTabId = previous?.id != null && Number(previous.id) !== Number(tab.id) ? Number(previous.id) : null;

    if (restoreState) await chromeApi.windows.update(tab.windowId, { state: 'normal' });
    if (tab.active !== true) await chromeApi.tabs.update(tab.id, { active: true, autoDiscardable: false });
    else if (tab.autoDiscardable !== false) await chromeApi.tabs.update(tab.id, { autoDiscardable: false });
    if (restoreState || tab.active !== true) await sleepImpl(SETTLE_MS);

    return {
      tabId: Number(tab.id), windowId: Number(tab.windowId), restoreState, restoreTabId,
      activated: tab.active !== true, restoredFromMinimized: !!restoreState
    };
  }

  async function restore(session, chromeApi) {
    if (!session) return;
    try {
      if (session.restoreTabId != null) await chromeApi.tabs.update(session.restoreTabId, { active: true });
    } catch {}
    try {
      if (session.restoreState) await chromeApi.windows.update(session.windowId, { state: session.restoreState });
    } catch {}
  }

  async function sendMessage(tabId, message, chromeApi = globalThis.chrome, options = {}) {
    let session = null;
    try {
      session = await prepare(tabId, chromeApi, options);
      return await chromeApi.tabs.sendMessage(tabId, message);
    } finally {
      await restore(session, chromeApi);
    }
  }

  const api = { SETTLE_MS, activeTabInWindow, prepare, restore, sendMessage };
  if (typeof globalThis !== 'undefined') globalThis.BrowserAiBridgeBackgroundDispatch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
