const EveStorageRuntime = window.EveStorageRuntime || {};
const EVE_LINKS_KEY = EveStorageRuntime.EVE_LINKS_KEY || 'eveV22Data';
const EVE_CONFIG_KEY = EveStorageRuntime.EVE_CONFIG_KEY || 'eveV22Config';
const EVE_BOOKMARK_FOLDERS_KEY = EveStorageRuntime.EVE_BOOKMARK_FOLDERS_KEY || 'eveV22BookmarkFolders';
const EVE_QUICK_PINS_KEY = EveStorageRuntime.EVE_QUICK_PINS_KEY || 'eveV22QuickPins';
const EVE_CONSTELLATION_DETACHED_KEY = EveStorageRuntime.EVE_CONSTELLATION_DETACHED_KEY || 'eveV22ConstellationDetached';
const EVE_NOTES_KEY = EveStorageRuntime.EVE_NOTES_KEY || 'eveV22Notes';
const EVE_THEME_BOOT_KEY = EveStorageRuntime.EVE_THEME_BOOT_KEY || 'eveV22ThemeBoot';
const smartCompress = typeof EveStorageRuntime.smartCompress === 'function'
    ? EveStorageRuntime.smartCompress
    : function (value) { return typeof value === 'string' ? value : JSON.stringify(value); };

function getCoreStorage() {
    return window.EveCoreStorage || EveStorageRuntime.coreStorage || null;
}

function sanitizeLinksForStorage(sourceLinks) {
    return Array.isArray(sourceLinks)
        ? sourceLinks.map((link) => {
            if (!link || typeof link !== 'object') return link;
            const nextLink = { ...link };
            delete nextLink.pinned;
            return nextLink;
        })
        : [];
}

function getBookmarkFoldersForStorage() {
    return (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object')
        ? bookmarkFolders
        : {};
}

function getQuickPinsForStorage() {
    return (typeof quickPins !== 'undefined' && Array.isArray(quickPins))
        ? quickPins
        : [];
}

function getConstellationDetachedForStorage() {
    return (window.constellationDetachedChains && typeof window.constellationDetachedChains === 'object')
        ? window.constellationDetachedChains
        : {};
}

function buildCoreStateSnapshot() {
    return {
        links: sanitizeLinksForStorage(typeof links !== 'undefined' ? links : []),
        bookmarkFolders: getBookmarkFoldersForStorage(),
        quickPins: getQuickPinsForStorage(),
        constellationDetachedChains: getConstellationDetachedForStorage()
    };
}

function buildStateSignature(value) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        console.warn('Core Storage: Failed to build state signature; forcing save.', error);
        return 'unstable:' + Date.now() + ':' + Math.random();
    }
}

var _stateMutationSequence = 0;

function normalizeMutationSource(source, fallback) {
    var normalized = String(source || '').trim();
    return normalized || fallback || 'state-mutated';
}

function dispatchStateMutation(source, detail) {
    if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
    _stateMutationSequence += 1;
    window.dispatchEvent(new CustomEvent('eve:state-mutated', {
        detail: Object.assign({
            source: normalizeMutationSource(source, 'state-mutated'),
            dirty: true,
            mutationSeq: _stateMutationSequence,
            at: Date.now()
        }, detail || {})
    }));
}

var _lastCoreStateSignature = '';
var _lastConfigSignature = '';

function markCoreStateClean(snapshot) {
    _lastCoreStateSignature = buildStateSignature(snapshot || buildCoreStateSnapshot());
}

function markConfigClean(nextConfig) {
    _lastConfigSignature = buildStateSignature(nextConfig || config || {});
}

function persistCoreStateAsync(coreSnapshot) {
    const storage = getCoreStorage();
    if (!storage) return Promise.resolve(false);
    const snapshot = coreSnapshot && typeof coreSnapshot === 'object'
        ? coreSnapshot
        : buildCoreStateSnapshot();

    return Promise.all([
        storage.saveJson(EVE_LINKS_KEY, snapshot.links || [], {
            localFallbackKey: EVE_LINKS_KEY,
            cleanupLocalKeys: [EVE_LINKS_KEY]
        }),
        storage.saveJson(EVE_BOOKMARK_FOLDERS_KEY, snapshot.bookmarkFolders || {}, {
            localFallbackKey: EVE_BOOKMARK_FOLDERS_KEY,
            cleanupLocalKeys: [EVE_BOOKMARK_FOLDERS_KEY]
        }),
        storage.saveJson(EVE_QUICK_PINS_KEY, Array.isArray(snapshot.quickPins) ? snapshot.quickPins : [], {
            localFallbackKey: EVE_QUICK_PINS_KEY,
            cleanupLocalKeys: [EVE_QUICK_PINS_KEY]
        }),
        storage.saveJson(EVE_CONSTELLATION_DETACHED_KEY, snapshot.constellationDetachedChains || {}, {
            localFallbackKey: EVE_CONSTELLATION_DETACHED_KEY,
            cleanupLocalKeys: [EVE_CONSTELLATION_DETACHED_KEY]
        })
    ]).then(() => true).catch((error) => {
        console.error('Core Storage: Failed to persist heavy core state', error);
        return false;
    });
}

var _saveDataTimer = 0;

function _saveDataImmediate(options = {}) {
    const skipRender = !!options.skipRender;
    const skipSuggestions = !!options.skipSuggestions;
    const forceRender = !!options.forceRender;
    const mutationSource = normalizeMutationSource(options.source || options.reason, 'saveData');
    const snapshot = buildCoreStateSnapshot();
    const signature = buildStateSignature(snapshot);
    const dirty = signature !== _lastCoreStateSignature;

    if (dirty) {
        _lastCoreStateSignature = signature;
        dispatchStateMutation(mutationSource, {
            kind: 'data',
            immediate: true,
            meta: options.meta && typeof options.meta === 'object' ? options.meta : null
        });
    }

    const persistPromise = dirty ? persistCoreStateAsync(snapshot) : Promise.resolve(true);
    const shouldRefresh = dirty || forceRender;

    // In perf mode, skip the full DOM rebuild â€” actions handle their own UI updates
    if (window._evePerfMode && !forceRender) return persistPromise;

    if (shouldRefresh && !skipRender && typeof renderDashboard === 'function') {
        window.__eveDashboardRenderHint = { kind: 'data-mutation' };
        renderDashboard();
    }
    if (shouldRefresh && !skipSuggestions && typeof updateSuggestions === 'function') updateSuggestions();
    return persistPromise;
}

function saveData(options = {}) {
    const skipRender = !!options.skipRender;
    const skipSuggestions = !!options.skipSuggestions;
    const forceRender = !!options.forceRender;
    const immediate = !!options.immediate;
    const mutationSource = normalizeMutationSource(options.source || options.reason, 'saveData');
    const mutationMeta = options.meta && typeof options.meta === 'object' ? options.meta : null;

    if (_saveDataTimer) clearTimeout(_saveDataTimer);
    if (immediate) {
        _saveDataTimer = 0;
        return _saveDataImmediate({ skipRender, skipSuggestions, forceRender, immediate, source: mutationSource, meta: mutationMeta });
    }

    // Debounce the expensive work: sanitize + persist + render
    _saveDataTimer = setTimeout(function () {
        _saveDataTimer = 0;
        const snapshot = buildCoreStateSnapshot();
        const signature = buildStateSignature(snapshot);
        const dirty = signature !== _lastCoreStateSignature;
        if (dirty) {
            _lastCoreStateSignature = signature;
            dispatchStateMutation(mutationSource, {
                kind: 'data',
                immediate: false,
                meta: mutationMeta
            });
            persistCoreStateAsync(snapshot);
        }
        const shouldRefresh = dirty || forceRender;

        // In perf mode, skip the full DOM rebuild — actions handle their own UI updates
        if (window._evePerfMode && !forceRender) return;

        if (shouldRefresh && !skipRender && typeof renderDashboard === 'function') {
            // Tag as data-mutation so the render skips expensive scroll preservation
            window.__eveDashboardRenderHint = { kind: 'data-mutation' };
            renderDashboard();
        }
        if (shouldRefresh && !skipSuggestions && typeof updateSuggestions === 'function') updateSuggestions();
    }, 100);
}

var _saveConfigTimer = 0;

function saveConfig(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (_saveConfigTimer) {
        clearTimeout(_saveConfigTimer);
        _saveConfigTimer = 0;
    }
    if (opts.immediate) {
        return _saveConfigImmediate(opts);
    }
    _saveConfigTimer = setTimeout(function () {
        _saveConfigTimer = 0;
        _saveConfigImmediate(opts);
    }, 150);
    return null;
}

function _saveConfigImmediate(options = {}) {
    var signature = buildStateSignature(config || {});
    if (signature === _lastConfigSignature) {
        return Promise.resolve(true);
    }
    _lastConfigSignature = signature;
    var mutationSource = normalizeMutationSource(options.source || options.reason, 'saveConfig');

    var persistPromise = Promise.resolve(true);
    var storage = getCoreStorage();
    if (storage) {
        storage.syncThemeBootConfig(config);
        persistPromise = storage.saveJson(EVE_CONFIG_KEY, config, {
            localFallbackKey: EVE_CONFIG_KEY,
            cleanupLocalKeys: [EVE_CONFIG_KEY],
            mirrorLocalKey: EVE_THEME_BOOT_KEY,
            mirrorValue: storage.getThemeBootConfig(config),
            mirrorPruneRatio: 0.05
        }).catch((error) => {
            console.error('Core Storage: Failed to persist config', error);
            return false;
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
    dispatchStateMutation(mutationSource, {
        kind: 'config',
        immediate: !!options.immediate,
        meta: options.meta && typeof options.meta === 'object' ? options.meta : null
    });
    return persistPromise;
}

// Add save functions to global state object
if (window.eveState) {
    window.eveState.saveData = saveData;
    window.eveState.saveConfig = saveConfig;
}

async function loadData() {
    const storage = getCoreStorage();
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
    if (!Array.isArray(config.collapsedTabs)) {
        config.collapsedTabs = Array.isArray(config.collapsed) ? config.collapsed.slice() : [];
    }
    if (!Array.isArray(config.sidebarGroups)) config.sidebarGroups = [];
    config.sidebarOrderMode = String(config.sidebarOrderMode || '').trim().toLowerCase() === 'manual'
        ? 'manual'
        : 'auto';
    if (Array.isArray(config.sidebarManualOrder)) {
        config.sidebarManualOrder = { root: config.sidebarManualOrder.slice(), parents: {} };
    } else if (!config.sidebarManualOrder || typeof config.sidebarManualOrder !== 'object') {
        config.sidebarManualOrder = { root: [], parents: {} };
    } else {
        if (!Array.isArray(config.sidebarManualOrder.root)) config.sidebarManualOrder.root = [];
        if (!config.sidebarManualOrder.parents || typeof config.sidebarManualOrder.parents !== 'object') {
            config.sidebarManualOrder.parents = {};
        }
    }
    config.sidebarFocusedGroupId = String(config.sidebarFocusedGroupId || '').trim();
    if (typeof config.showHiddenSidebarGroups !== 'boolean') config.showHiddenSidebarGroups = false;
    if (typeof config.showInactiveTabs !== 'boolean') config.showInactiveTabs = false;
    if (typeof config.sidebarExpanded !== 'boolean') config.sidebarExpanded = false;

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

    markCoreStateClean();
    markConfigClean(config);

    // Render — defer heavy dashboard to let browser breathe after 800+ script evaluations
    // Use setTimeout(0) to push to back of macrotask queue (rAF still competes with paint)
    if (typeof renderSidebar === 'function') renderSidebar();

    setTimeout(function () {
        if (typeof renderDashboard === 'function') renderDashboard();
        // Defer suggestions even further — they're not visible initially
        setTimeout(function () {
            if (typeof updateSuggestions === 'function') updateSuggestions();
            // Warm up favicon cache in background after initial render
            if (window.EveFaviconCache && typeof window.EveFaviconCache.warmup === 'function') {
                window.EveFaviconCache.warmup();
            }
        }, 100);
    }, 0);

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
        const storage = getCoreStorage();
        if (storage) {
            await storage.clearAll();
        } else if (window.IDBStore && typeof window.IDBStore.clear === 'function') {
            await window.IDBStore.clear();
        }
        location.reload();
    }
}
