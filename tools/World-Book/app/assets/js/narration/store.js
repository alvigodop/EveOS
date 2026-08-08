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
    cacheMb: 192,
    cacheDays: 30,
  };
  let dbPromise = null;

  function settings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch (_error) {
      return { ...defaults };
    }
  }

  function saveSettings(patch) {
    const next = { ...settings(), ...(patch || {}) };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (_error) {}
    window.dispatchEvent(new CustomEvent("eve:world-book-narration-settings", { detail: next }));
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
    return { count: rows.length, bytes: rows.reduce((sum, row) => sum + Number(row.size || 0), 0) };
  }

  async function prune() {
    const rows = await allAudio();
    const config = settings();
    const maxBytes = Math.max(16, Number(config.cacheMb) || 192) * 1024 * 1024;
    const cutoff = Date.now() - Math.max(1, Number(config.cacheDays) || 30) * 86400000;
    rows.sort((a, b) => Number(a.lastUsed || 0) - Number(b.lastUsed || 0));
    let total = rows.reduce((sum, row) => sum + Number(row.size || 0), 0);
    const remove = rows.filter(row => Number(row.lastUsed || 0) < cutoff || (total > maxBytes && (total -= Number(row.size || 0)) >= 0));
    if (remove.length) await transact("readwrite", store => remove.forEach(row => store.delete(row.key)));
  }

  async function clearAudio() {
    await transact("readwrite", store => store.clear());
  }

  WB.NarrationStore = { defaults, settings, saveSettings, getAudio, putAudio, stats, prune, clearAudio };
})();
