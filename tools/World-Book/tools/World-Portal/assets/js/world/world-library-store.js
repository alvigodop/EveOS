const DATABASE_NAME = "world-portal-library";
const DATABASE_VERSION = 2;
const STORE_NAME = "worlds";
const ACTIVE_WORLD_KEY = "world-portal.active-world.v1";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error("World library could not open."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore(mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, mode, { durability: "strict" });
    } catch {
      transaction = database.transaction(STORE_NAME, mode);
    }
    const store = transaction.objectStore(STORE_NAME);
    let result;
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("World library transaction failed."));
    };
    transaction.onabort = transaction.onerror;
    try {
      result = action(store);
      if (result instanceof IDBRequest) {
        const request = result;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => transaction.abort();
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  }));
}

export async function listStoredWorlds() {
  const records = await withStore("readonly", (store) => store.getAll());
  return Array.isArray(records) ? records : [];
}

export function saveStoredWorld(record) {
  return withStore("readwrite", (store) => store.put(record));
}

export function deleteStoredWorld(worldId) {
  return withStore("readwrite", (store) => store.delete(worldId));
}

export function readActiveWorldId() {
  try {
    return window.localStorage.getItem(ACTIVE_WORLD_KEY) || "earth";
  } catch {
    return "earth";
  }
}

export function writeActiveWorldId(worldId) {
  try {
    window.localStorage.setItem(ACTIVE_WORLD_KEY, worldId);
  } catch {
    // The active world still changes for the current session.
  }
}
