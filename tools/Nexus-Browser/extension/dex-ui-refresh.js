(() => {
  const runtimeConfig = globalThis.NexusBrowserRuntimeConfig
    || (typeof require === 'function' ? require('./runtime-config') : null);
  if (!runtimeConfig) throw new Error('Nexus Browser runtime configuration is unavailable.');
  const WS_URL = runtimeConfig.websocketUrl;
  const HEALTH_URL = runtimeConfig.healthUrl;
  let socket = null;
  let reconnectTimer = null;
  let connectInFlight = false;
  let lastSessionId = '';
  let lastAssetRevision = '';

  // Dex tabs already own their websocket, room state and asset revision policy.
  // This observer may request a fresh target snapshot, but must never reload tabs:
  // doing so races the viewer's own reconnect and resets live dispatch UI.
  function handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(String(raw?.data ?? raw)); } catch { return { kind: 'invalid' }; }
    if (msg?.type !== 'server_session' || !msg.id) return { kind: 'ignored' };
    const next = String(msg.id);
    const revision = String(msg.assetRevision || '');
    const changed = !!lastSessionId && lastSessionId !== next;
    lastSessionId = next;
    if (revision) lastAssetRevision = revision;
    if (changed && socket && typeof WebSocket !== 'undefined' && socket.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ type: 'request_tabs' })); } catch {}
    }
    return { kind: changed ? 'soft-restart' : 'handshake', sessionId: next, assetRevision: lastAssetRevision };
  }

  async function localRelayReady(fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') return false;
    try {
      const response = await fetchImpl(HEALTH_URL, { cache: 'no-store' });
      return !!response?.ok;
    } catch { return false; }
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
    } finally { connectInFlight = false; }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime) connect().catch(() => scheduleReconnect());

  const api = { handleMessage, localRelayReady, connect };
  globalThis.BrowserAiBridgeDexUiRefresh = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();