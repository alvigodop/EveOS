window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CacheRuntime = api.CacheRuntime || {};
    if (rt.storageReady || !rt.sharedReady) return;

    async function withScopedContext(categoryName, callback) {
        const manager = window.StorageManager;
        if (!manager || typeof manager.setCategoryContext !== 'function') {
            return await callback(null);
        }

        const previousContext = manager.categoryContext;
        const nextContext = rt.normalizeCategoryName(categoryName);
        if (nextContext) {
            manager.setCategoryContext(nextContext);
        }

        try {
            return await callback(manager);
        } finally {
            manager.setCategoryContext(previousContext || null);
        }
    }

    async function loadScopedValue(key, defaultValue, categoryName) {
        return await withScopedContext(categoryName, async function (manager) {
            const normalizedCategory = rt.normalizeCategoryName(categoryName);
            const fullKey = manager && typeof manager._getPrefixedKey === 'function'
                ? manager._getPrefixedKey(key, normalizedCategory)
                : `${normalizedCategory}_${key}`;

            if (manager && typeof manager.loadHeavyData === 'function' && key === rt.CACHE_KEY) {
                const value = await manager.loadHeavyData(key, defaultValue, normalizedCategory);
                if (value !== undefined && value !== null && value !== defaultValue) {
                    console.log(`API Cache: Loaded [${fullKey}] from IDB`);
                    return value;
                }
            }

            if (manager && typeof manager.loadData === 'function') {
                const value = manager.loadData(key);
                if (value) {
                    console.log(`API Cache: Loaded [${fullKey}] from StorageManager`);
                    return value;
                }
            }

            try {
                const raw = localStorage.getItem(fullKey);
                if (raw) {
                    console.log(`API Cache: Loaded [${fullKey}] from localStorage fallback`);
                    return JSON.parse(raw);
                }
            } catch (error) {
                console.warn(`API Cache: Failed to load [${fullKey}] from localStorage`, error);
            }

            return defaultValue;
        });
    }

    async function saveScopedValue(key, value, categoryName) {
        return await withScopedContext(categoryName, async function (manager) {
            const normalizedCategory = rt.normalizeCategoryName(categoryName);
            const fullKey = manager && typeof manager._getPrefixedKey === 'function'
                ? manager._getPrefixedKey(key, normalizedCategory)
                : `${normalizedCategory}_${key}`;

            if (manager && typeof manager.saveHeavyData === 'function' && key === rt.CACHE_KEY) {
                const ok = await manager.saveHeavyData(key, value, normalizedCategory);
                if (ok) console.log(`API Cache: Saved [${fullKey}] to IDB`);
                return ok;
            }

            if (manager && typeof manager.saveData === 'function') {
                const ok = manager.saveData(key, value);
                if (ok) console.log(`API Cache: Saved [${fullKey}] to StorageManager`);
                return ok;
            }

            console.warn(`API Cache: No storage manager available to save [${key}]. Falling back to localStorage.`);
            try {
                localStorage.setItem(fullKey, JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn(`API Cache: Failed to save [${fullKey}] to localStorage`, error);
                return false;
            }
        });
    }

    async function deleteScopedValue(key, categoryName) {
        return await withScopedContext(categoryName, async function (manager) {
            if (manager && typeof manager.deleteHeavyData === 'function' && key === rt.CACHE_KEY) {
                return await manager.deleteHeavyData(key);
            }
            if (manager && typeof manager.deleteData === 'function') {
                return manager.deleteData(key);
            }

            try {
                localStorage.removeItem(rt.fallbackStorageKey(key, categoryName));
                return true;
            } catch (error) {
                console.warn('API Cache: Failed to delete scoped value', key, error);
                return false;
            }
        });
    }

    async function loadPool(categoryName) {
        const normalized = rt.normalizeCategoryName(categoryName);
        if (rt._memoryPools[normalized]) {
            const pool = rt._memoryPools[normalized];
            rt.prunePool(pool);
            return pool;
        }

        if (!rt._poolLoadPromises[normalized]) {
            rt._poolLoadPromises[normalized] = loadScopedValue(rt.CACHE_KEY, { queries: {}, order: [] }, categoryName)
                .then(function (raw) {
                    const pool = rt.ensurePoolShape(raw);
                    rt.prunePool(pool);
                    rt._memoryPools[normalized] = pool;
                    return pool;
                })
                .finally(function () {
                    delete rt._poolLoadPromises[normalized];
                });
        }

        return await rt._poolLoadPromises[normalized];
    }

    async function ensurePoolLoaded(categoryName) {
        if (!categoryName) return;
        const normalized = rt.normalizeCategoryName(categoryName);
        if (rt._memoryPools[normalized]) return rt._memoryPools[normalized];
        return await loadPool(categoryName);
    }

    async function savePool(pool, categoryName) {
        const normalized = rt.normalizeCategoryName(categoryName);
        const nextPool = rt.prunePool(rt.ensurePoolShape(pool));
        rt._memoryPools[normalized] = nextPool;
        return await saveScopedValue(rt.CACHE_KEY, nextPool, categoryName);
    }

    async function loadPrefs(categoryName) {
        const stored = await loadScopedValue(rt.PREFS_KEY, {}, categoryName);
        return {
            liveResults: stored?.liveResults === true,
            hybridResults: stored?.hybridResults !== false,
            ttlMs: Number(stored?.ttlMs) > 0 ? Number(stored.ttlMs) : rt.DEFAULT_TTL_MS,
            openMode: stored?.openMode === 'newtab' ? 'newtab' : 'popup'
        };
    }

    async function savePrefs(nextPrefs, categoryName) {
        const normalizedCategory = rt.normalizeCategoryName(categoryName);
        const previousWrite = rt._prefsWrites[normalizedCategory] || Promise.resolve();
        const nextWrite = previousWrite
            .catch(function () { return null; })
            .then(async function () {
                const currentPrefs = await loadPrefs(categoryName);
                const incomingPrefs = nextPrefs && typeof nextPrefs === 'object' ? { ...nextPrefs } : {};
                if (typeof incomingPrefs.hybridSearch === 'boolean' && typeof incomingPrefs.hybridResults !== 'boolean') {
                    incomingPrefs.hybridResults = incomingPrefs.hybridSearch;
                }
                const merged = {
                    ...currentPrefs,
                    ...incomingPrefs
                };
                if (!(Number(merged.ttlMs) > 0)) {
                    merged.ttlMs = rt.DEFAULT_TTL_MS;
                }
                merged.liveResults = merged.liveResults === true;
                merged.hybridResults = merged.hybridResults !== false;
                merged.openMode = merged.openMode === 'newtab' ? 'newtab' : 'popup';
                await saveScopedValue(rt.PREFS_KEY, merged, categoryName);
                return merged;
            });

        rt._prefsWrites[normalizedCategory] = nextWrite.finally(function () {
            if (rt._prefsWrites[normalizedCategory] === nextWrite) {
                delete rt._prefsWrites[normalizedCategory];
            }
        });

        return await nextWrite;
    }

    async function clearAll(categoryName) {
        const normalized = rt.normalizeCategoryName(categoryName);
        delete rt._memoryPools[normalized];
        await deleteScopedValue(rt.CACHE_KEY, categoryName);
        await deleteScopedValue(rt.PREFS_KEY, categoryName);
        return true;
    }

    Object.assign(rt, {
        withScopedContext,
        loadScopedValue,
        saveScopedValue,
        deleteScopedValue,
        loadPool,
        ensurePoolLoaded,
        savePool,
        loadPrefs,
        savePrefs,
        clearAll
    });

    rt.storageReady = true;
})(window.EveOS.API);
