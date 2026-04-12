// --- STORAGE & INIT ---
const EVE_LINKS_KEY = 'eveV22Data';
const EVE_CONFIG_KEY = 'eveV22Config';
const EVE_BOOKMARK_FOLDERS_KEY = 'eveV22BookmarkFolders';
const EVE_QUICK_PINS_KEY = 'eveV22QuickPins';
const EVE_CONSTELLATION_DETACHED_KEY = 'eveV22ConstellationDetached';
const EVE_NOTES_KEY = 'eveV22Notes';
const EVE_THEME_BOOT_KEY = 'eveV22ThemeBoot';
const EVE_CORE_IDB_PREFIX = 'core_';

// --- [NEW] SMART COMPRESSION HELPERS ---
const LZ_PREFIX = '_LZ_';

function smartCompress(data) {
    if (typeof LZString === 'undefined' || !data) return typeof data === 'string' ? data : JSON.stringify(data);
    const json = typeof data === 'string' ? data : JSON.stringify(data);

    // Only compress if significant size (>1KB) to avoid overhead
    if (json.length < 1024) return json;

    try {
        const compressed = LZString.compressToUTF16(json);
        const packed = LZ_PREFIX + compressed;

        // Safety check: only use if it actually saved space
        if (packed.length < json.length) {
            const savings = Math.round((1 - packed.length / json.length) * 100);
            console.log(`Storage (Core): Compressed [${savings}% saved] from ${(json.length / 1024).toFixed(1)}KB to ${(packed.length / 1024).toFixed(1)}KB.`);
            return packed;
        }
    } catch (e) {
        console.warn('Storage: Compression failed:', e);
        return json;
    }
    return json;
}

function smartDecompress(str, fallback = null) {
    if (typeof str !== 'string' || !str) return str;
    if (!str.startsWith(LZ_PREFIX)) return str;

    // Hard safety: if compressed but no library, return fallback to prevent JSON.parse crash
    if (typeof LZString === 'undefined') {
        console.warn('Storage: LZString library missing during decompression attempt.');
        return fallback;
    }

    try {
        const raw = str.slice(LZ_PREFIX.length);
        const decompressed = LZString.decompressFromUTF16(raw);
        return decompressed || fallback;
    } catch (e) {
        console.error('Storage: Decompression failed:', e);
        return fallback;
    }
}

function cloneStoredValue(value) {
    if (value == null) return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

const EveCoreStorage = {
    _memoryFallback: Object.create(null),
    _writeQueue: Object.create(null),
    _idbCheckPromise: null,
    _warnedBackends: new Set(),
    _status: {
        backend: 'pending',
        indexeddbAvailable: null,
        degraded: false,
        reason: ''
    },

    _idbKey: function (key) {
        return `${EVE_CORE_IDB_PREFIX}${String(key || '').trim()}`;
    },

    _emitStatus: function () {
        window.dispatchEvent(new CustomEvent('eve:storage-backend', {
            detail: { ...this._status }
        }));
    },

    _setStatus: function (patch) {
        const nextStatus = {
            ...this._status,
            ...(patch && typeof patch === 'object' ? patch : {})
        };
        const changed = JSON.stringify(nextStatus) !== JSON.stringify(this._status);
        this._status = nextStatus;
        if (changed) {
            this._emitStatus();
        }
        return { ...this._status };
    },

    _warnFallback: function (backend, reason) {
        const warningKey = `${backend}:${reason || ''}`;
        if (this._warnedBackends.has(warningKey)) return;
        this._warnedBackends.add(warningKey);

        const message = backend === 'memory'
            ? 'Persistent storage is unavailable. Changes will only survive for this session.'
            : 'IndexedDB is unavailable. EveOS is using localStorage fallback mode.';

        console.warn(`Core Storage: ${message}`, reason || '');
        if (typeof window.showToast === 'function') {
            window.showToast(message, 'warning');
        }
    },

    canUseIndexedDb: async function () {
        if (window.IDBStore && typeof window.IDBStore.isAvailable === 'function' && window.IDBStore.isAvailable()) {
            this._setStatus({
                backend: 'indexeddb',
                indexeddbAvailable: true,
                degraded: false,
                reason: ''
            });
            return true;
        }

        if (this._status.indexeddbAvailable === false) {
            return false;
        }

        if (!window.IDBStore || typeof window.IDBStore.init !== 'function') {
            this._setStatus({
                backend: 'localstorage',
                indexeddbAvailable: false,
                degraded: true,
                reason: 'IndexedDB wrapper unavailable'
            });
            this._warnFallback('localstorage', 'IndexedDB wrapper unavailable');
            return false;
        }

        if (!this._idbCheckPromise) {
            this._idbCheckPromise = Promise.resolve()
                .then(() => window.IDBStore.init())
                .then(() => {
                    this._setStatus({
                        backend: 'indexeddb',
                        indexeddbAvailable: true,
                        degraded: false,
                        reason: ''
                    });
                    return true;
                })
                .catch((error) => {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: String(error?.message || error || 'IndexedDB init failed')
                    });
                    this._warnFallback('localstorage', error?.message || error);
                    return false;
                })
                .finally(() => {
                    this._idbCheckPromise = null;
                });
        }

        return await this._idbCheckPromise;
    },

    getStatus: function () {
        return { ...this._status };
    },

    _removeLocalKeys: function (keys) {
        (Array.isArray(keys) ? keys : []).forEach(function (key) {
            if (!key) return;
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`Core Storage: Failed to remove legacy key [${key}]`, error);
            }
        });
    },

    _writeLocalRaw: function (key, serializedValue, pruneRatio = 0.5) {
        try {
            localStorage.setItem(key, serializedValue);
            return true;
        } catch (error) {
            if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22)) {
                console.warn(`Core Storage: Quota exceeded for [${key}]. Attempting emergency prune...`);
                if (window.CCMaintenance && typeof window.CCMaintenance.emergencyPrune === 'function') {
                    window.CCMaintenance.emergencyPrune(pruneRatio);
                    try {
                        localStorage.setItem(key, serializedValue);
                        return true;
                    } catch (retryError) {
                        console.error(`Core Storage: Final localStorage write failure for [${key}]`, retryError);
                    }
                }
            } else {
                console.error(`Core Storage: Failed localStorage write for [${key}]`, error);
            }
            return false;
        }
    },

    _writeLocalJson: function (key, value, pruneRatio = 0.5) {
        return this._writeLocalRaw(key, smartCompress(value), pruneRatio);
    },

    _writeLocalText: function (key, value, pruneRatio = 0.1) {
        return this._writeLocalRaw(key, smartCompress(String(value || '')), pruneRatio);
    },

    _readLocalJson: function (key, defaultValue) {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return cloneStoredValue(defaultValue);
            const decoded = smartDecompress(raw, null);
            if (decoded == null) return cloneStoredValue(defaultValue);
            return JSON.parse(decoded);
        } catch (error) {
            console.warn(`Core Storage: Failed to read local JSON key [${key}]`, error);
            return cloneStoredValue(defaultValue);
        }
    },

    _readLocalText: function (key, defaultValue = '') {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return String(defaultValue || '');
            const decoded = smartDecompress(raw, defaultValue);
            return typeof decoded === 'string' ? decoded : String(defaultValue || '');
        } catch (error) {
            console.warn(`Core Storage: Failed to read local text key [${key}]`, error);
            return String(defaultValue || '');
        }
    },

    _enqueueWrite: function (key, task) {
        const queueKey = String(key || 'core');
        const previous = this._writeQueue[queueKey] || Promise.resolve();
        const next = previous
            .catch(function () { return null; })
            .then(task);

        this._writeQueue[queueKey] = next.finally(() => {
            if (this._writeQueue[queueKey] === next) {
                delete this._writeQueue[queueKey];
            }
        });

        return next;
    },

    saveJson: async function (key, value, options = {}) {
        const storageKey = String(key || '').trim();
        if (!storageKey) return false;

        const cleanupLocalKeys = Array.isArray(options.cleanupLocalKeys) && options.cleanupLocalKeys.length
            ? options.cleanupLocalKeys.slice()
            : [options.localFallbackKey || storageKey];
        const mirrorLocalKey = String(options.mirrorLocalKey || '').trim() || null;
        const mirrorValue = options.mirrorValue;
        const localFallbackKey = String(options.localFallbackKey || storageKey).trim();

        return await this._enqueueWrite(storageKey, async () => {
            const clonedValue = cloneStoredValue(value);
            const canUseIdb = await this.canUseIndexedDb();

            if (canUseIdb) {
                try {
                    const saved = await window.IDBStore.set(this._idbKey(storageKey), clonedValue);
                    if (saved !== false) {
                        this._setStatus({
                            backend: 'indexeddb',
                            indexeddbAvailable: true,
                            degraded: false,
                            reason: ''
                        });
                        delete this._memoryFallback[storageKey];
                        if (mirrorLocalKey) {
                            this._writeLocalJson(mirrorLocalKey, mirrorValue, options.mirrorPruneRatio || 0.1);
                        }
                        this._removeLocalKeys(cleanupLocalKeys.filter(function (localKey) {
                            return localKey && localKey !== mirrorLocalKey;
                        }));
                        return true;
                    }
                } catch (error) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: String(error?.message || error || 'IndexedDB write failed')
                    });
                    this._warnFallback('localstorage', error?.message || error);
                }
            }

            const wroteFallback = this._writeLocalJson(localFallbackKey, clonedValue, options.localPruneRatio || 0.5);
            if (mirrorLocalKey && mirrorLocalKey !== localFallbackKey) {
                this._writeLocalJson(mirrorLocalKey, mirrorValue, options.mirrorPruneRatio || 0.1);
            }

            if (wroteFallback) {
                this._setStatus({
                    backend: 'localstorage',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: this._status.reason || 'IndexedDB unavailable'
                });
                this._warnFallback('localstorage', this._status.reason);
                return true;
            }

            this._memoryFallback[storageKey] = clonedValue;
            this._setStatus({
                backend: 'memory',
                indexeddbAvailable: false,
                degraded: true,
                reason: 'Persistent storage unavailable'
            });
            this._warnFallback('memory', 'Persistent storage unavailable');
            return false;
        });
    },

    loadJson: async function (key, defaultValue, options = {}) {
        const storageKey = String(key || '').trim();
        if (!storageKey) return cloneStoredValue(defaultValue);

        if (Object.prototype.hasOwnProperty.call(this._memoryFallback, storageKey)) {
            return cloneStoredValue(this._memoryFallback[storageKey]);
        }

        const canUseIdb = await this.canUseIndexedDb();
        if (canUseIdb) {
            try {
                const value = await window.IDBStore.get(this._idbKey(storageKey));
                if (value !== undefined) {
                    return cloneStoredValue(value);
                }
            } catch (error) {
                this._setStatus({
                    backend: 'localstorage',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: String(error?.message || error || 'IndexedDB read failed')
                });
                this._warnFallback('localstorage', error?.message || error);
            }
        }

        const legacyKeys = Array.isArray(options.legacyKeys) && options.legacyKeys.length
            ? options.legacyKeys.slice()
            : [options.localFallbackKey || storageKey];
        let found = false;
        let localValue = cloneStoredValue(defaultValue);

        for (let index = 0; index < legacyKeys.length; index += 1) {
            const legacyKey = legacyKeys[index];
            if (!legacyKey) continue;
            try {
                if (localStorage.getItem(legacyKey) == null) continue;
            } catch (error) {
                continue;
            }
            localValue = this._readLocalJson(legacyKey, defaultValue);
            found = true;
            break;
        }

        if (found) {
            if (canUseIdb && options.migrateLegacy !== false) {
                void this.saveJson(storageKey, localValue, {
                    localFallbackKey: options.localFallbackKey || storageKey,
                    cleanupLocalKeys: legacyKeys,
                    mirrorLocalKey: options.mirrorLocalKey,
                    mirrorValue: options.mirrorValue
                });
            } else if (!canUseIdb) {
                this._setStatus({
                    backend: 'localstorage',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: this._status.reason || 'IndexedDB unavailable'
                });
            }
            return cloneStoredValue(localValue);
        }

        return cloneStoredValue(defaultValue);
    },

    saveText: async function (key, value, options = {}) {
        const storageKey = String(key || '').trim();
        if (!storageKey) return false;

        return await this._enqueueWrite(storageKey, async () => {
            const textValue = String(value || '');
            const localFallbackKey = String(options.localFallbackKey || storageKey).trim();
            const canUseIdb = await this.canUseIndexedDb();

            if (canUseIdb) {
                try {
                    const saved = await window.IDBStore.set(this._idbKey(storageKey), textValue);
                    if (saved !== false) {
                        delete this._memoryFallback[storageKey];
                        this._removeLocalKeys([localFallbackKey]);
                        return true;
                    }
                } catch (error) {
                    this._setStatus({
                        backend: 'localstorage',
                        indexeddbAvailable: false,
                        degraded: true,
                        reason: String(error?.message || error || 'IndexedDB write failed')
                    });
                    this._warnFallback('localstorage', error?.message || error);
                }
            }

            if (this._writeLocalText(localFallbackKey, textValue, options.localPruneRatio || 0.1)) {
                this._setStatus({
                    backend: 'localstorage',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: this._status.reason || 'IndexedDB unavailable'
                });
                this._warnFallback('localstorage', this._status.reason);
                return true;
            }

            this._memoryFallback[storageKey] = textValue;
            this._setStatus({
                backend: 'memory',
                indexeddbAvailable: false,
                degraded: true,
                reason: 'Persistent storage unavailable'
            });
            this._warnFallback('memory', 'Persistent storage unavailable');
            return false;
        });
    },

    loadText: async function (key, defaultValue = '', options = {}) {
        const storageKey = String(key || '').trim();
        if (!storageKey) return String(defaultValue || '');

        if (Object.prototype.hasOwnProperty.call(this._memoryFallback, storageKey)) {
            return String(this._memoryFallback[storageKey] || '');
        }

        const canUseIdb = await this.canUseIndexedDb();
        if (canUseIdb) {
            try {
                const value = await window.IDBStore.get(this._idbKey(storageKey));
                if (value !== undefined) {
                    return String(value || '');
                }
            } catch (error) {
                this._setStatus({
                    backend: 'localstorage',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: String(error?.message || error || 'IndexedDB read failed')
                });
                this._warnFallback('localstorage', error?.message || error);
            }
        }

        const legacyKey = String(options.localFallbackKey || storageKey).trim();
        let hasLegacy = false;
        try {
            hasLegacy = localStorage.getItem(legacyKey) != null;
        } catch (error) {
            hasLegacy = false;
        }

        if (hasLegacy) {
            const textValue = this._readLocalText(legacyKey, defaultValue);
            if (canUseIdb && options.migrateLegacy !== false) {
                void this.saveText(storageKey, textValue, {
                    localFallbackKey: legacyKey
                });
            } else if (!canUseIdb) {
                this._setStatus({
                    backend: 'localstorage',
                    indexeddbAvailable: false,
                    degraded: true,
                    reason: this._status.reason || 'IndexedDB unavailable'
                });
            }
            return textValue;
        }

        return String(defaultValue || '');
    },

    getThemeBootConfig: function (nextConfig) {
        const configValue = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
        return {
            theme: configValue.theme || 'dark',
            accent: configValue.accent || '',
            background: configValue.background || '',
            bgColor: configValue.bgColor || '',
            cardColor: configValue.cardColor || '',
            popupColor: configValue.popupColor || ''
        };
    },

    syncThemeBootConfig: function (nextConfig) {
        this._writeLocalJson(EVE_THEME_BOOT_KEY, this.getThemeBootConfig(nextConfig), 0.05);
    },

    clearAll: async function () {
        this._memoryFallback = Object.create(null);
        this._writeQueue = Object.create(null);
        try {
            if (window.IDBStore && typeof window.IDBStore.clear === 'function') {
                await window.IDBStore.clear();
            }
        } catch (error) {
            console.warn('Core Storage: Failed to clear IndexedDB store', error);
        }
    }
};

window.EveCoreStorage = EveCoreStorage;

function persistCoreStateAsync(sanitizedLinks) {
    if (!window.EveCoreStorage) return;

    void Promise.all([
        window.EveCoreStorage.saveJson(EVE_LINKS_KEY, sanitizedLinks, {
            localFallbackKey: EVE_LINKS_KEY,
            cleanupLocalKeys: [EVE_LINKS_KEY]
        }),
        window.EveCoreStorage.saveJson(EVE_BOOKMARK_FOLDERS_KEY, (
            (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object')
                ? bookmarkFolders
                : {}
        ), {
            localFallbackKey: EVE_BOOKMARK_FOLDERS_KEY,
            cleanupLocalKeys: [EVE_BOOKMARK_FOLDERS_KEY]
        }),
        window.EveCoreStorage.saveJson(EVE_QUICK_PINS_KEY, (
            (typeof quickPins !== 'undefined' && Array.isArray(quickPins))
                ? quickPins
                : []
        ), {
            localFallbackKey: EVE_QUICK_PINS_KEY,
            cleanupLocalKeys: [EVE_QUICK_PINS_KEY]
        }),
        window.EveCoreStorage.saveJson(EVE_CONSTELLATION_DETACHED_KEY, (
            (window.constellationDetachedChains && typeof window.constellationDetachedChains === 'object')
                ? window.constellationDetachedChains
                : {}
        ), {
            localFallbackKey: EVE_CONSTELLATION_DETACHED_KEY,
            cleanupLocalKeys: [EVE_CONSTELLATION_DETACHED_KEY]
        })
    ]).catch((error) => {
        console.error('Core Storage: Failed to persist heavy core state', error);
    });
}

var _saveDataTimer = 0;

function saveData(options = {}) {
    const skipRender = !!options.skipRender;
    const skipSuggestions = !!options.skipSuggestions;

    // Immediate: dispatch event for reactive listeners
    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'saveData' } }));

    // Debounce the expensive work: sanitize + persist + render
    if (_saveDataTimer) clearTimeout(_saveDataTimer);
    _saveDataTimer = setTimeout(function () {
        _saveDataTimer = 0;

        const sanitizedLinks = Array.isArray(links)
            ? links.map((link) => {
                if (!link || typeof link !== 'object') return link;
                const nextLink = { ...link };
                delete nextLink.pinned;
                return nextLink;
            })
            : [];

        persistCoreStateAsync(sanitizedLinks);

        // In perf mode, skip the full DOM rebuild — actions handle their own UI updates
        if (window._evePerfMode) return;

        if (!skipRender && typeof renderDashboard === 'function') renderDashboard();
        if (!skipSuggestions && typeof updateSuggestions === 'function') updateSuggestions();
    }, 100);
}

var _saveConfigTimer = 0;

function saveConfig() {
    if (_saveConfigTimer) clearTimeout(_saveConfigTimer);
    _saveConfigTimer = setTimeout(function () {
        _saveConfigTimer = 0;
        _saveConfigImmediate();
    }, 150);
}

function _saveConfigImmediate() {
    if (window.EveCoreStorage) {
        window.EveCoreStorage.syncThemeBootConfig(config);
        void window.EveCoreStorage.saveJson(EVE_CONFIG_KEY, config, {
            localFallbackKey: EVE_CONFIG_KEY,
            cleanupLocalKeys: [EVE_CONFIG_KEY],
            mirrorLocalKey: EVE_THEME_BOOT_KEY,
            mirrorValue: window.EveCoreStorage.getThemeBootConfig(config),
            mirrorPruneRatio: 0.05
        }).catch((error) => {
            console.error('Core Storage: Failed to persist config', error);
        });
    } else {
        try {
            localStorage.setItem(EVE_CONFIG_KEY, smartCompress(config));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
                if (window.CCMaintenance && typeof CCMaintenance.emergencyPrune === 'function') {
                    CCMaintenance.emergencyPrune(0.3);
                    try {
                        localStorage.setItem(EVE_CONFIG_KEY, JSON.stringify(config));
                    } catch (retryError) { }
                }
            }
        }
    }
    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'saveConfig' } }));
}

// Add save functions to global state object
if (window.eveState) {
    window.eveState.saveData = saveData;
    window.eveState.saveConfig = saveConfig;
}

async function loadData() {
    const storage = window.EveCoreStorage;
    const loadedLinks = storage
        ? await storage.loadJson(EVE_LINKS_KEY, [], { legacyKeys: [EVE_LINKS_KEY] })
        : [];
    if (Array.isArray(loadedLinks)) {
        links = loadedLinks;
    }

    const loadedBookmarkFolders = storage
        ? await storage.loadJson(EVE_BOOKMARK_FOLDERS_KEY, {}, { legacyKeys: [EVE_BOOKMARK_FOLDERS_KEY] })
        : {};
    bookmarkFolders = (loadedBookmarkFolders && typeof loadedBookmarkFolders === 'object') ? loadedBookmarkFolders : {};

    const loadedQuickPins = storage
        ? await storage.loadJson(EVE_QUICK_PINS_KEY, [], { legacyKeys: [EVE_QUICK_PINS_KEY] })
        : [];
    quickPins = Array.isArray(loadedQuickPins) ? loadedQuickPins : [];

    const loadedDetached = storage
        ? await storage.loadJson(EVE_CONSTELLATION_DETACHED_KEY, {}, { legacyKeys: [EVE_CONSTELLATION_DETACHED_KEY] })
        : {};
    window.constellationDetachedChains = (loadedDetached && typeof loadedDetached === 'object') ? loadedDetached : {};
    if (window.eveState) {
        window.eveState.constellationDetachedChains = window.constellationDetachedChains;
    }

    const loadedConfig = storage
        ? await storage.loadJson(EVE_CONFIG_KEY, {}, {
            legacyKeys: [EVE_CONFIG_KEY],
            mirrorLocalKey: EVE_THEME_BOOT_KEY,
            mirrorValue: storage.getThemeBootConfig(config)
        })
        : {};
    if (loadedConfig && typeof loadedConfig === 'object') {
        config = { ...config, ...loadedConfig };

        // --- Migration: ensure recursive subTabs on all workspaces ---
        const wsHelpers = window.EveWorkspaceHelpers;
        if (wsHelpers && Array.isArray(config.workspaces) && wsHelpers.needsMigration(config.workspaces)) {
            config.workspaces = wsHelpers.sanitize(config.workspaces);
            console.log('[Storage] Migrated workspaces to recursive sub-tab format.');
        }
    }
    if (storage) {
        storage.syncThemeBootConfig(config);
    }

    if (!['grid', 'list', 'unidex'].includes(config.viewMode)) config.viewMode = 'grid';
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    if (!config.workspaces || config.workspaces.length === 0) config.workspaces = [{ id: 'main', name: 'Main', icon: '\u{1F3E0}', subTabs: [] }];
    if (!config.activeWorkspace) config.activeWorkspace = 'main';

    // Custom bookmark ordering defaults
    if (!config.customOrder || typeof config.customOrder !== 'object') config.customOrder = {};
    if (!Array.isArray(config.customOrderEnabled)) config.customOrderEnabled = [];
    if (!config.customOrderSort || typeof config.customOrderSort !== 'object') config.customOrderSort = {};

    // True value approximation defaults
    if (!Array.isArray(config.trueValueEnabled)) config.trueValueEnabled = [];
    if (!config.trueValueSettings || typeof config.trueValueSettings !== 'object') config.trueValueSettings = {};

    // Apply settings
    if (typeof applySettings === 'function') applySettings();

    // Load notes
    const notes = storage
        ? await storage.loadText(EVE_NOTES_KEY, '', { localFallbackKey: EVE_NOTES_KEY })
        : '';
    const notesArea = document.getElementById('notes-area');
    if (notesArea) notesArea.value = notes || '';

    // Default links if empty
    if (links.length === 0) {
        links = [{ id: 1, title: 'Welcome', url: '#', category: 'Start', done: false, workspace: 'main', icon: '\u{1F44B}' }];
    }

    if (window.EveQuickPins?.migrateLegacyPins) {
        window.EveQuickPins.migrateLegacyPins();
    }

    // Render
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof updateSuggestions === 'function') updateSuggestions();
    if (typeof updateTimeAndGreeting === 'function') {
        updateTimeAndGreeting();
        setInterval(updateTimeAndGreeting, 1000);
    }
}

async function clearAllData() {
    if (await showConfirm('WIPE ALL?')) {
        try {
            localStorage.clear();
        } catch (error) {
            console.warn('Core Storage: Failed to clear localStorage during wipe', error);
        }
        if (window.EveCoreStorage) {
            await window.EveCoreStorage.clearAll();
        } else if (window.IDBStore && typeof window.IDBStore.clear === 'function') {
            await window.IDBStore.clear();
        }
        location.reload();
    }
}
