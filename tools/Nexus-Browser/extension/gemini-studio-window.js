(() => {
  function isAiStudioTab(tab) {
    const url = String(tab?.url || tab?.pendingUrl || '');
    if (url.startsWith('https://aistudio.google.com') || url.startsWith('http://aistudio.google.com')) return true;
    const title = String(tab?.title || '').toLowerCase();
    return title.includes('google ai studio') || title.includes('ai studio');
  }

  function canonicalStudioUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.hostname !== 'aistudio.google.com') return '';
      return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
    } catch {
      return '';
    }
  }

  function sameStudioConversation(a, b) {
    const left = canonicalStudioUrl(a);
    const right = canonicalStudioUrl(b);
    return !!left && !!right && left === right;
  }

  async function getWindow(tab, windowsApi) {
    if (tab?.windowId == null || !windowsApi?.get) return null;
    try { return await windowsApi.get(tab.windowId); }
    catch { return null; }
  }

  async function windowTabs(tab, tabsApi) {
    if (tab?.windowId == null || !tabsApi?.query) return [];
    try { return await tabsApi.query({ windowId: tab.windowId }); }
    catch { return []; }
  }

  async function normalizeStudioWindow(tab, tabsApi, windowsApi, { restoreIfMinimized = true } = {}) {
    if (!tab) return tab;

    // A bridge popup contains one AI Studio tab, so there is no reason to activate/focus it.
    // Only disable discarding. chrome.tabs.update({active:true}) is intentionally avoided here
    // because popup selection must never participate in foreground-window arbitration.
    try {
      if (tabsApi?.update && tab.autoDiscardable !== false) {
        await tabsApi.update(tab.id, { autoDiscardable: false });
      }
    } catch {}

    if (restoreIfMinimized) {
      try {
        if (windowsApi?.get && windowsApi?.update && tab.windowId != null) {
          const win = await windowsApi.get(tab.windowId);
          if (win?.state === 'minimized') {
            // Restore visibility without requesting foreground focus. Windows is free to deny
            // focus-stealing, so the bridge must not trigger a focus contest with other apps.
            await windowsApi.update(tab.windowId, { state: 'normal', focused: false });
          }
        }
      } catch {}
    }

    try { return await tabsApi?.get?.(tab.id) || tab; }
    catch { return tab; }
  }

  async function waitForTabReady(tabId, tabsApi, timeoutMs = 12000) {
    const started = Date.now();
    let latest = null;
    while (Date.now() - started < timeoutMs) {
      try {
        latest = await tabsApi.get(tabId);
        if (latest?.status === 'complete') return latest;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return latest || tabsApi.get(tabId);
  }

  async function popupTabFromWindow(created, tabsApi) {
    const embedded = created?.tabs?.find((tab) => isAiStudioTab(tab)) || created?.tabs?.[0];
    if (embedded?.id != null) return embedded;
    if (created?.id == null || !tabsApi?.query) return null;
    const tabs = await tabsApi.query({ windowId: created.id });
    return tabs.find((tab) => isAiStudioTab(tab)) || tabs[0] || null;
  }

  async function findExistingAiStudioPopup(tabsApi, windowsApi, currentTabId = null, expectedUrl = '') {
    if (!windowsApi?.getAll) return null;
    try {
      // Only real Chrome popup windows qualify. A normal one-tab browser window is NOT a
      // bridge popup and must never be silently adopted.
      const popups = await windowsApi.getAll({ populate: true, windowTypes: ['popup'] });
      const candidates = [];
      for (const win of popups || []) {
        if (win?.type !== 'popup') continue;
        for (const tab of win.tabs || []) {
          if (!isAiStudioTab(tab)) continue;
          if (currentTabId != null && tab.id === currentTabId) continue;
          candidates.push({ tab, windowId: win.id });
        }
      }
      if (!candidates.length) return null;

      const wanted = canonicalStudioUrl(expectedUrl);
      if (wanted) {
        const exact = candidates.find(({ tab }) => sameStudioConversation(tab.url || tab.pendingUrl, expectedUrl));
        return exact || null;
      }
      return candidates[0];
    } catch {
      return null;
    }
  }

  async function ensureAiStudioBridgePopup(tab, {
    tabsApi = globalThis.chrome?.tabs,
    windowsApi = globalThis.chrome?.windows,
    width = 360,
    height = 420
  } = {}) {
    if (!isAiStudioTab(tab) || !tabsApi) return { tab, detached: false, cloned: false };

    const win = await getWindow(tab, windowsApi);
    const alreadyBridgePopup = win?.type === 'popup';
    if (alreadyBridgePopup || !windowsApi?.create) {
      const normalized = await normalizeStudioWindow(tab, tabsApi, windowsApi, { restoreIfMinimized: true });
      return {
        tab: normalized,
        detached: false,
        cloned: false,
        windowId: tab.windowId ?? null
      };
    }

    const existing = await findExistingAiStudioPopup(tabsApi, windowsApi, tab.id, tab.url || tab.pendingUrl || '');
    if (existing?.tab?.id != null) {
      const normalized = await normalizeStudioWindow(existing.tab, tabsApi, windowsApi, { restoreIfMinimized: true });
      return {
        tab: normalized,
        detached: false,
        cloned: false,
        windowId: existing.windowId ?? null
      };
    }

    const created = await windowsApi.create({
      url: tab.url,
      type: 'popup',
      width,
      height,
      focused: false
    });
    let popupTab = await popupTabFromWindow(created, tabsApi);
    if (!popupTab?.id) throw new Error('AI Studio bridge popup opened without a target tab.');
    popupTab = await waitForTabReady(popupTab.id, tabsApi);
    popupTab = await normalizeStudioWindow(popupTab, tabsApi, windowsApi, { restoreIfMinimized: true });
    return {
      tab: popupTab,
      detached: true,
      cloned: true,
      sourceTabId: tab.id,
      windowId: created?.id ?? popupTab?.windowId ?? null
    };
  }

  async function keepAiStudioPopupReady(tab, {
    tabsApi = globalThis.chrome?.tabs,
    windowsApi = globalThis.chrome?.windows
  } = {}) {
    if (!isAiStudioTab(tab)) return tab;
    return normalizeStudioWindow(tab, tabsApi, windowsApi, { restoreIfMinimized: true });
  }

  const api = {
    isAiStudioTab,
    canonicalStudioUrl,
    sameStudioConversation,
    findExistingAiStudioPopup,
    normalizeStudioWindow,
    ensureAiStudioBridgePopup,
    ensureAiStudioDetached: ensureAiStudioBridgePopup,
    keepAiStudioPopupReady
  };

  if (typeof globalThis !== 'undefined') globalThis.BrowserAiBridgeGeminiStudioWindow = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();