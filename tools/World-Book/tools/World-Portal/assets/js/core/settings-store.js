const STORAGE_KEY = "world-portal.settings.v1";
const LEGACY_STORAGE_KEYS = Object.freeze(["cartoon-earth-lab.settings.v1"]);

function storageAvailable() {
  try {
    const testKey = `${STORAGE_KEY}.test`;
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function compatibleValue(value, fallback) {
  if (typeof fallback === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof fallback === "boolean") {
    return typeof value === "boolean" ? value : fallback;
  }
  if (typeof fallback === "string") {
    return typeof value === "string" ? value : fallback;
  }
  if (Array.isArray(fallback)) {
    return Array.isArray(value) ? [...value] : [...fallback];
  }
  if (fallback && typeof fallback === "object") {
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...value } : { ...fallback };
  }
  return fallback;
}

export function createSettingsStore(defaults) {
  const available = storageAvailable();
  const keys = Object.keys(defaults);
  let saveTimer = 0;

  function load() {
    if (!available) return { ...defaults };
    try {
      const current = window.localStorage.getItem(STORAGE_KEY);
      const legacy = LEGACY_STORAGE_KEYS
        .map((key) => window.localStorage.getItem(key))
        .find(Boolean);
      const raw = current || legacy;
      if (!raw) return { ...defaults };
      if (!current && legacy) window.localStorage.setItem(STORAGE_KEY, legacy);
      const parsed = JSON.parse(raw);
      return Object.fromEntries(keys.map((key) => [
        key,
        compatibleValue(parsed?.[key], defaults[key]),
      ]));
    } catch {
      return { ...defaults };
    }
  }

  function saveNow(state) {
    if (!available) return;
    const payload = Object.fromEntries(keys.map((key) => [key, state[key]]));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be disabled or full; the app should continue normally.
    }
  }

  function scheduleSave(state) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveNow(state), 120);
  }

  function clear() {
    window.clearTimeout(saveTimer);
    if (!available) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Reloading still restores in-memory defaults when storage is unavailable.
    }
  }

  return { available, load, saveNow, scheduleSave, clear };
}
