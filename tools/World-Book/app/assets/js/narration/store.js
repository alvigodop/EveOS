(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const SETTINGS_KEY = "eveWorldBookNarrationSettings";
  const DB_NAME = "eve-world-book-narration";
  const STORE_NAME = "audio-passages";
  const defaults = {
    enabled: true,
    engine: "browser",
    browserVoice: "",
    geminiVoice: "Aoede",
    rate: 1,
    pitch: 1,
    volume: 1,
    strictVerbatim: true,
    backgroundPrefetch: true,
    routeToAudioflix: false,
    cacheMb: 192,
    cacheDays: 30,
  };
  let dbPromise = null;
  const hostRequests = new Map();

  function hosts() {
    const values = [];
    if (window.parent && window.parent !== window) values.push(window.parent);
    if (window.opener && !window.opener.closed) values.push(window.opener);
    return values;
  }

  function isHostEvent(event) {
    if (!hosts().includes(event.source)) return false;
    if (event.origin === "null") return true;
    try {
      const host = new URL(event.origin).hostname.toLowerCase();
      return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    } catch (_error) {
      return false;
    }
  }

  function postHost(message) {
    const targets = hosts();
    targets.forEach(target => target.postMessage(message, "*"));
    return targets.length > 0;
  }

  function requestHost(message, timeoutMs = 3000) {
    const targets = hosts();
    if (!targets.length) return Promise.resolve({ ok: false, reason: "standalone" });
    const requestId = `reader-host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise(resolve => {
      const timeout = window.setTimeout(() => {
        hostRequests.delete(requestId);
        resolve({ ok: false, reason: "timeout" });
      }, timeoutMs);
      hostRequests.set(requestId, value => {
        window.clearTimeout(timeout);
        resolve(value);
      });
      targets.forEach(target => target.postMessage({ ...message, requestId }, "*"));
    });
  }

  window.addEventListener("message", event => {
    const data = event.data;
    if (!isHostEvent(event) || data?.type !== "eve-world-book-narration-result") return;
    const finish = hostRequests.get(data.requestId);
    if (!finish) return;
    hostRequests.delete(data.requestId);
    finish(data);
  });

  function settings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch (_error) {
      return { ...defaults };
    }
  }

  function saveSettings(patch, options = {}) {
    const next = { ...settings(), ...(patch || {}) };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (_error) {}
    window.dispatchEvent(new CustomEvent("eve:world-book-narration-settings", { detail: next }));
    if (options.notifyHost !== false) {
      postHost({ type: "eve-world-book-narration-settings-change", settings: next });
    }
    return next;
  }

  function openDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      console.warn("Narration audio cache unavailable:", error);
      dbPromise = null;
      return null;
    });
    return dbPromise;
  }

  async function transact(mode, callback) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try { result = callback(store); } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(result?.result ?? result ?? null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Narration cache transaction was aborted."));
    });
  }

  async function getAudio(key) {
    const record = await transact("readonly", store => store.get(key));
    if (!record) return null;
    record.lastUsed = Date.now();
    void transact("readwrite", store => store.put(record));
    return record;
  }

  async function putAudio(record) {
    const value = { ...record, createdAt: Date.now(), lastUsed: Date.now(), size: record.pcm?.byteLength || 0 };
    await transact("readwrite", store => store.put(value));
    await prune();
    return value;
  }

  async function allAudio() {
    return (await transact("readonly", store => store.getAll())) || [];
  }

  async function stats() {
    const rows = await allAudio();
    return {
      count: rows.length,
      bytes: rows.reduce((sum, row) => sum + Number(row.size || 0), 0),
      sources: new Set(rows.map(row => String(row.sourceId || "unknown"))).size,
    };
  }

  async function inventory() {
    const rows = await allAudio();
    return rows
      .sort((a, b) => Number(b.lastUsed || 0) - Number(a.lastUsed || 0))
      .map(row => ({
        key: String(row.key || ""),
        sourceId: String(row.sourceId || "unknown"),
        sourceTitle: String(row.sourceTitle || "Unknown source"),
        passageIndex: Math.max(0, Number(row.passageIndex) || 0),
        passagePreview: String(row.passagePreview || ""),
        voice: String(row.voice || ""),
        narrationPolicy: String(row.narrationPolicy || "legacy"),
        size: Math.max(0, Number(row.size) || 0),
        createdAt: Number(row.createdAt) || 0,
        lastUsed: Number(row.lastUsed) || 0,
      }));
  }

  async function deleteAudio(key) {
    if (!key) return;
    await transact("readwrite", store => store.delete(String(key)));
  }

  async function clearSource(sourceId) {
    const target = String(sourceId || "");
    if (!target) return 0;
    const rows = (await allAudio()).filter(row => String(row.sourceId || "") === target);
    if (rows.length) {
      await transact("readwrite", store => rows.forEach(row => store.delete(row.key)));
    }
    return rows.length;
  }

  async function prune() {
    const rows = await allAudio();
    const config = settings();
    const maxBytes = Math.max(16, Number(config.cacheMb) || 192) * 1024 * 1024;
    const cutoff = Date.now() - Math.max(1, Number(config.cacheDays) || 30) * 86400000;
    rows.sort((a, b) => Number(a.lastUsed || 0) - Number(b.lastUsed || 0));
    const remove = rows.filter(row => Number(row.lastUsed || 0) < cutoff);
    const retained = rows.filter(row => Number(row.lastUsed || 0) >= cutoff);
    let total = retained.reduce((sum, row) => sum + Number(row.size || 0), 0);
    while (total > maxBytes && retained.length) {
      const oldest = retained.shift();
      total -= Number(oldest.size || 0);
      remove.push(oldest);
    }
    if (remove.length) await transact("readwrite", store => remove.forEach(row => store.delete(row.key)));
  }

  async function clearAudio() {
    await transact("readwrite", store => store.clear());
  }

  WB.NarrationHost = { post: postHost, request: requestHost, isHostEvent };
  WB.NarrationStore = {
    defaults,
    settings,
    saveSettings,
    getAudio,
    putAudio,
    stats,
    inventory,
    deleteAudio,
    clearSource,
    prune,
    clearAudio,
  };
})();
