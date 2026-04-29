/**
 * Unified State Store Apply Shared Helpers
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applySharedReady) return;
    if (!ns.captureReady) {
        console.warn('[EveDataStore] Capture helpers missing; apply shared helpers not initialized.');
        return;
    }

    const getLibraryStateModule = ns.getLibraryStateModule;
    const getLibraryStorageModule = ns.getLibraryStorageModule;
    const getConfig = ns.getConfig;
    const getBookmarkFolders = ns.getBookmarkFolders;
    const cloneQuickPins = ns.cloneQuickPins;
    const cloneConnections = ns.cloneConnections;
    const KNOWLEDGE_STORAGE_KEYS = Array.isArray(ns.KNOWLEDGE_STORAGE_KEYS) ? ns.KNOWLEDGE_STORAGE_KEYS : [];
    const normalizeKnowledgeContextKey = typeof ns.normalizeKnowledgeContextKey === 'function'
        ? ns.normalizeKnowledgeContextKey
        : function (value) {
            const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
            return normalized || '__global__';
        };
    const parseKnowledgeStorageKey = typeof ns.parseKnowledgeStorageKey === 'function'
        ? ns.parseKnowledgeStorageKey
        : function (storageKey) {
            const rawKey = String(storageKey || '').trim();
            if (!rawKey) return null;
            for (const fieldKey of KNOWLEDGE_STORAGE_KEYS) {
                if (rawKey === fieldKey) {
                    return { contextKey: '__global__', fieldKey };
                }
                const suffix = `_${fieldKey}`;
                if (!rawKey.endsWith(suffix)) continue;
                let contextKey = rawKey.slice(0, -suffix.length);
                if (!contextKey) contextKey = '__global__';
                if ((fieldKey === 'apiSearchCachePool' || fieldKey === 'apiSearchPrefs') && contextKey.startsWith('api_')) {
                    contextKey = contextKey.slice(4);
                }
                return { contextKey: normalizeKnowledgeContextKey(contextKey), fieldKey };
            }
            return null;
        };

    function cloneValue(value, fallbackValue) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return fallbackValue;
        }
    }

    function getKnowledgeStorageKeysFromLocalStorage() {
        if (typeof localStorage === 'undefined' || typeof localStorage.length !== 'number') return [];
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const storageKey = localStorage.key(index);
            if (parseKnowledgeStorageKey(storageKey)) keys.push(storageKey);
        }
        return keys;
    }

    function deleteKnowledgeBucket(contextKey) {
        const normalizedContext = normalizeKnowledgeContextKey(contextKey);
        if (normalizedContext === '__global__') {
            KNOWLEDGE_STORAGE_KEYS.forEach((fieldKey) => {
                try {
                    localStorage.removeItem(fieldKey);
                } catch (error) {}
            });
            return;
        }

        const previousContext = window.StorageManager?.categoryContext;
        try {
            if (window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
                window.StorageManager.setCategoryContext(normalizedContext);
            }
            KNOWLEDGE_STORAGE_KEYS.forEach((fieldKey) => {
                if (window.StorageManager && typeof window.StorageManager.deleteData === 'function') {
                    window.StorageManager.deleteData(fieldKey);
                    return;
                }
                try {
                    localStorage.removeItem(`${normalizedContext}_${fieldKey}`);
                    if (fieldKey === 'apiSearchCachePool' || fieldKey === 'apiSearchPrefs') {
                        localStorage.removeItem(`api_${normalizedContext}_${fieldKey}`);
                    }
                } catch (error) {}
            });
        } finally {
            if (window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
                window.StorageManager.setCategoryContext(previousContext || null);
            }
        }
    }

    function saveKnowledgeBucket(contextKey, bucket) {
        const normalizedContext = normalizeKnowledgeContextKey(contextKey);
        const source = bucket && typeof bucket === 'object' ? bucket : {};
        if (normalizedContext === '__global__') {
            KNOWLEDGE_STORAGE_KEYS.forEach((fieldKey) => {
                if (!Object.prototype.hasOwnProperty.call(source, fieldKey)) return;
                try {
                    localStorage.setItem(fieldKey, JSON.stringify(source[fieldKey]));
                } catch (error) {
                    console.warn('[EveDataStore] Failed to restore global knowledge bucket field:', fieldKey, error);
                }
            });
            return;
        }

        const previousContext = window.StorageManager?.categoryContext;
        try {
            if (window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
                window.StorageManager.setCategoryContext(normalizedContext);
            }
            KNOWLEDGE_STORAGE_KEYS.forEach((fieldKey) => {
                if (!Object.prototype.hasOwnProperty.call(source, fieldKey)) return;
                const value = cloneValue(source[fieldKey], source[fieldKey]);
                if (window.StorageManager && typeof window.StorageManager.saveData === 'function') {
                    window.StorageManager.saveData(fieldKey, value);
                    return;
                }
                try {
                    localStorage.setItem(`${normalizedContext}_${fieldKey}`, JSON.stringify(value));
                } catch (error) {
                    console.warn('[EveDataStore] Failed to restore knowledge bucket field:', fieldKey, error);
                }
            });
        } finally {
            if (window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
                window.StorageManager.setCategoryContext(previousContext || null);
            }
        }
    }

    function refreshKnowledgeRuntime() {
        try {
            const currentContext = String(window.currentCategoryCtx || window.StorageManager?.categoryContext || '').trim();
            if (currentContext && window.StorageManager && typeof window.StorageManager.setCategoryContext === 'function') {
                window.StorageManager.setCategoryContext(currentContext);
            }
            if (window.WikiManager && typeof window.WikiManager.refreshCacheStores === 'function') {
                window.WikiManager.refreshCacheStores();
            }
            if (window.WikiManager && window.StorageManager && typeof window.StorageManager.loadData === 'function') {
                window.WikiManager.wikiEntries = window.StorageManager.loadData('wikiEntries', []);
                window.WikiManager.fandomDomains = window.StorageManager.loadData('fandomDomains', []);
                window.WikiManager.wikiCategories = window.StorageManager.loadData('wikiCategories', []);
                window.WikiManager.wikiCacheStore = window.StorageManager.loadData('wikiCacheStore', {});
                window.WikiManager.fandomCacheStore = window.StorageManager.loadData('wikiDataStore', { searchResults: {} });
            }
        } catch (error) {
            console.warn('[EveDataStore] Failed to refresh knowledge runtime after apply:', error);
        }
    }

    function applyKnowledgeState(knowledgeState, contexts = null) {
        if (!knowledgeState || typeof knowledgeState !== 'object') return;

        const incomingBuckets = knowledgeState.scopedStorage && typeof knowledgeState.scopedStorage === 'object'
            ? knowledgeState.scopedStorage
            : {};
        const normalizedContexts = contexts == null
            ? null
            : Array.from(new Set(
                (Array.isArray(contexts) ? contexts : [contexts])
                    .map((value) => normalizeKnowledgeContextKey(value))
                    .filter(Boolean)
            ));

        if (normalizedContexts == null) {
            getKnowledgeStorageKeysFromLocalStorage().forEach((storageKey) => {
                try {
                    localStorage.removeItem(storageKey);
                } catch (error) {}
            });
            Object.entries(incomingBuckets).forEach(([contextKey, bucket]) => {
                saveKnowledgeBucket(contextKey, bucket);
            });
            refreshKnowledgeRuntime();
            return;
        }

        normalizedContexts.forEach((contextKey) => deleteKnowledgeBucket(contextKey));
        normalizedContexts.forEach((contextKey) => {
            if (!Object.prototype.hasOwnProperty.call(incomingBuckets, contextKey)) return;
            saveKnowledgeBucket(contextKey, incomingBuckets[contextKey]);
        });
        refreshKnowledgeRuntime();
    }

    function setLinks(newLinks) {
        const sanitized = newLinks.map(entry => ({ ...entry }));
        if (typeof window.setLiveLinks === 'function') window.setLiveLinks(sanitized);
        else {
            if (window.eveState) window.eveState.links = sanitized;
            window.links = sanitized;
            if (typeof links !== 'undefined') links = sanitized;
        }
        if (typeof saveData === 'function') saveData({
            source: 'data-state-links-set',
            meta: { replacedLinks: true, linkCount: sanitized.length }
        });
    }

    function setConfig(newConfig) {
        const baseConfig = getConfig();
        const merged = { ...baseConfig, ...newConfig };
        if (typeof config !== 'undefined') {
            config = merged;
        } else {
            window.config = merged;
        }
        if (typeof saveConfig === 'function') saveConfig();
    }

    function setBookmarkFolders(newBookmarkFolders) {
        const sanitized = (newBookmarkFolders && typeof newBookmarkFolders === 'object')
            ? JSON.parse(JSON.stringify(newBookmarkFolders))
            : {};
        if (typeof bookmarkFolders !== 'undefined') {
            bookmarkFolders = sanitized;
        } else {
            window.bookmarkFolders = sanitized;
        }
        if (typeof saveData === 'function') saveData({
            source: 'data-state-folder-store-set',
            meta: { replacedFolderStore: true }
        });
    }

    function setQuickPins(newQuickPins) {
        const sanitized = Array.isArray(newQuickPins)
            ? JSON.parse(JSON.stringify(newQuickPins))
            : [];
        if (window.EveQuickPins?.writeStore) {
            window.EveQuickPins.writeStore(sanitized, { persist: false });
        } else if (typeof quickPins !== 'undefined') {
            quickPins = sanitized;
        } else {
            window.quickPins = sanitized;
        }
        if (typeof saveData === 'function') saveData({
            skipRender: true,
            skipSuggestions: true,
            source: 'data-state-quick-pins-set',
            meta: { nonIndexing: true, quickPins: true }
        });
    }

    function applyLibraryCategories(categories, workspaceId = null) {
        if (!categories || typeof categories !== 'object') return;
        const stateModule = getLibraryStateModule();
        if (!stateModule) return;
        
        const targetWorkspace = workspaceId || getConfig()?.activeWorkspace || 'main';
        
        Object.entries(categories).forEach(([categoryName, data]) => {
            if (typeof data === 'object') {
                if (stateModule.setCategoryLibrary.length >= 3) {
                    stateModule.setCategoryLibrary(categoryName, data, targetWorkspace);
                } else {
                    stateModule.setCategoryLibrary(categoryName, data);
                }
            }
        });
        const storageModule = getLibraryStorageModule();
        if (storageModule?.saveLibrary) storageModule.saveLibrary();
    }

    function applyConnections(workspaceId, connections) {
        if (!Array.isArray(connections)) return;
        const existing = cloneConnections();
        const linkIds = new Set(connections.map(conn => conn.linkId).filter(Boolean));
        const filtered = existing.filter(conn => String(conn.workspace) !== String(workspaceId) && !linkIds.has(conn.linkId));
        const annotated = connections.map(conn => ({ ...conn, workspace: workspaceId }));
        const next = filtered.concat(annotated);
        if (window.EveLibrary?.ConnectionsAPI?.setAll) {
            window.EveLibrary.ConnectionsAPI.setAll(next);
        } else {
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = next;
        }
    }

    Object.assign(ns, {
        setLinks,
        setConfig,
        setBookmarkFolders,
        setQuickPins,
        applyLibraryCategories,
        applyConnections,
        getBookmarkFolders,
        cloneQuickPins,
        applyKnowledgeState
    });

    ns.applySharedReady = true;
})();
