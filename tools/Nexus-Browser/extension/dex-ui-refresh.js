(() => {
  const runtimeConfig = globalThis.NexusBrowserRuntimeConfig
    || (typeof require === 'function' ? require('./runtime-config') : null);
  if (!runtimeConfig) throw new Error('Nexus Browser runtime configuration is unavailable.');
  const WS_URL = runtimeConfig.websocketUrl;
  const HEALTH_URL = runtimeConfig.healthUrl;
  const DEX_URL = runtimeConfig.tabPattern;
  let socket = null;
  let reconnectTimer = null;
  let connectInFlight = false;
  let lastSessionId = null;
  let firstSession = true;

  async function reloadDexTabs() {
    if (!globalThis.chrome?.tabs?.query || !globalThis.chrome?.tabs?.reload) return 0;
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: DEX_URL }); }
    catch { return 0; }
    let reloaded = 0;
    for (const tab of tabs) {
      if (!Number.isInteger(tab?.id)) continue;
      try {
        await chrome.tabs.reload(tab.id, { bypassCache: true });
        reloaded += 1;
      } catch {}
    }
    return reloaded;
  }

  function handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(String(raw?.data ?? raw)); } catch { return; }
    if (msg?.type !== 'server_session' || !msg.id) return;
    const next = String(msg.id);
    const changed = !!lastSessionId && lastSessionId !== next;
    lastSessionId = next;
    if (!firstSession && !changed) return;
    firstSession = false;
    reloadDexTabs().catch(() => {});
  }

  async function localRelayReady(fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') return false;
    try {
      const response = await fetchImpl(HEALTH_URL, { cache: 'no-store' });
      return !!response?.ok;
    } catch {
      return false;
    }
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect().catch(() => {}), 1200);
  }

  async function connect() {
    clearTimeout(reconnectTimer);
    if (connectInFlight) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    connectInFlight = true;
    try {
      if (!(await localRelayReady())) return scheduleReconnect();
      try { socket = new WebSocket(WS_URL); }
      catch { return scheduleReconnect(); }
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'hello', role: 'ui', clientKind: 'ui-refresh' }));
      });
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', () => {
        socket = null;
        scheduleReconnect();
      });
      socket.addEventListener('error', () => {});
    } finally {
      connectInFlight = false;
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime) connect().catch(() => scheduleReconnect());

  const api = { reloadDexTabs, handleMessage, localRelayReady, connect };
  globalThis.BrowserAiBridgeDexUiRefresh = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
