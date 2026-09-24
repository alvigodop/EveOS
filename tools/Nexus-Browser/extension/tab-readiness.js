(() => {
  async function documentReady(tabId, chromeApi) {
    if (!chromeApi.scripting?.executeScript) return false;
    try {
      const result = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: () => document.readyState !== 'loading'
      });
      return result?.[0]?.result === true;
    } catch { return false; }
  }

  async function waitForTabComplete(tabId, chromeApi = globalThis.chrome, {
    timeoutMs = 15000,
    pollMs = 100,
    nowImpl = Date.now,
    sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    const deadline = nowImpl() + timeoutMs;
    while (nowImpl() < deadline) {
      const tab = await chromeApi.tabs.get(tabId);
      if (tab.status === 'complete' || await documentReady(tabId, chromeApi)) return tab;
      await sleepImpl(pollMs);
    }
    throw new Error('Timed out waiting for target tab runtime readiness.');
  }

  const api = { documentReady, waitForTabComplete };
  if (typeof globalThis !== 'undefined') globalThis.BrowserAiBridgeTabReadiness = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
