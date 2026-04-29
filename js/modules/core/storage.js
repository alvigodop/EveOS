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

var CORE_DELTA_LIMIT = 300;

function cloneCoreStateForDelta(snapshot, signature) {
    try {
        return JSON.parse(signature || buildStateSignature(snapshot || buildCoreStateSnapshot()));
    } catch (error) {
        return null;
    }
}

function cloneConfigForDelta(nextConfig, signature) {
    try {
        return JSON.parse(signature || buildStateSignature(nextConfig || config || {}));
    } catch (error) {
        return null;
    }
}

function normalizeDeltaText(value, fallback) {
    var normalized = String(value == null ? '' : value).trim();
    return normalized || String(fallback || '').trim();
}

function getDeltaScopedKey(workspaceId, categoryName) {
    return normalizeDeltaText(workspaceId, 'main') + '::' + normalizeDeltaText(categoryName, 'Unsorted');
}

function splitDeltaScopedKey(scopedKey) {
    var parts = String(scopedKey || '').split('::');
    return {
        workspaceId: normalizeDeltaText(parts.shift(), 'main'),
        categoryName: normalizeDeltaText(parts.join('::'), 'Unsorted')
    };
}

function addDeltaScope(scopeMap, workspaceId, categoryName) {
    var scope = splitDeltaScopedKey(getDeltaScopedKey(workspaceId, categoryName));
    scopeMap[scope.workspaceId + '::' + scope.categoryName] = scope;
}

function addDeltaLinkScope(scopeMap, folderIds, link) {
    if (!link || typeof link !== 'object') return;
    addDeltaScope(scopeMap, link.workspace, link.category);
    var folderId = normalizeDeltaText(link.folderId, '');
    if (folderId) folderIds[folderId] = true;
}

function buildLinkMapForDelta(linkList) {
    var map = {};
    (Array.isArray(linkList) ? linkList : []).forEach(function (link) {
        var linkId = normalizeDeltaText(link && link.id, '');
        if (!linkId) return;
        map[linkId] = link;
    });
    return map;
}

function pushDeltaSet(target, value) {
    var normalized = normalizeDeltaText(value, '');
    if (normalized) target[normalized] = true;
}

function toCappedDeltaList(setLike, state) {
    var values = Object.keys(setLike || {});
    if (values.length > CORE_DELTA_LIMIT) {
        state.complete = false;
        return values.slice(0, CORE_DELTA_LIMIT);
    }
    return values;
}

function collectWorkspaceIdsForConfigDelta(workspaces, target) {
    (Array.isArray(workspaces) ? workspaces : []).forEach(function (workspace) {
        var id = normalizeDeltaText(workspace && workspace.id, '');
        if (id) target[id] = true;
        collectWorkspaceIdsForConfigDelta(workspace && workspace.subTabs, target);
    });
}

function buildConfigDelta(previousConfig, nextConfig) {
    var completeState = { complete: !!previousConfig };
    var previous = previousConfig && typeof previousConfig === 'object' ? previousConfig : {};
    var next = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
    var changedKeys = {};
    var workspaceIds = {};
    var keys = {};
    Object.keys(previous).forEach(function (key) { keys[key] = true; });
    Object.keys(next).forEach(function (key) { keys[key] = true; });
    Object.keys(keys).forEach(function (key) {
        var changed = false;
        try {
            changed = JSON.stringify(previous[key]) !== JSON.stringify(next[key]);
        } catch (error) {
            changed = true;
        }
        if (!changed) return;
        pushDeltaSet(changedKeys, key);
        if (key === 'workspaces') {
            collectWorkspaceIdsForConfigDelta(previous[key], workspaceIds);
            collectWorkspaceIdsForConfigDelta(next[key], workspaceIds);
        }
    });
    var deltaChangedKeys = toCappedDeltaList(changedKeys, completeState);
    var deltaWorkspaceIds = toCappedDeltaList(workspaceIds, completeState);
    return {
        kind: 'core-config-delta',
        complete: !!completeState.complete,
        changedKeys: deltaChangedKeys,
        workspaceIds: deltaWorkspaceIds
    };
}

function buildStoreSignatureMapForDelta(store) {
    var map = {};
    Object.keys(store || {}).forEach(function (key) {
        try {
            map[key] = JSON.stringify(store[key]);
        } catch (error) {
            map[key] = 'unstable';
        }
    });
    return map;
}

function collectChangedFolderScopesForDelta(previousFolders, nextFolders, scopeMap) {
    var previousMap = buildStoreSignatureMapForDelta(previousFolders);
    var nextMap = buildStoreSignatureMapForDelta(nextFolders);
    var changed = false;
    var keys = {};
    Object.keys(previousMap).forEach(function (key) { keys[key] = true; });
    Object.keys(nextMap).forEach(function (key) { keys[key] = true; });
    Object.keys(keys).forEach(function (scopedKey) {
        if (previousMap[scopedKey] === nextMap[scopedKey]) return;
        changed = true;
        var scope = splitDeltaScopedKey(scopedKey);
        addDeltaScope(scopeMap, scope.workspaceId, scope.categoryName);
    });
    return changed;
}

function buildCoreDataDelta(previousSnapshot, nextSnapshot) {
    var completeState = { complete: !!previousSnapshot };
    var linkIds = {};
    var addedLinkIds = {};
    var updatedLinkIds = {};
    var removedLinkIds = {};
    var workspaceIds = {};
    var categoryNames = {};
    var folderIds = {};
    var scopeMap = {};
    var previousLinks = buildLinkMapForDelta(previousSnapshot && previousSnapshot.links);
    var nextLinks = buildLinkMapForDelta(nextSnapshot && nextSnapshot.links);
    var ids = {};

    Object.keys(previousLinks).forEach(function (id) { ids[id] = true; });
    Object.keys(nextLinks).forEach(function (id) { ids[id] = true; });

    Object.keys(ids).forEach(function (linkId) {
        var previousLink = previousLinks[linkId] || null;
        var nextLink = nextLinks[linkId] || null;
        var changed = !previousLink || !nextLink;
        if (!changed) {
            try {
                changed = JSON.stringify(previousLink) !== JSON.stringify(nextLink);
            } catch (error) {
                changed = true;
            }
        }
        if (!changed) return;

        pushDeltaSet(linkIds, linkId);
        if (!previousLink && nextLink) pushDeltaSet(addedLinkIds, linkId);
        else if (previousLink && !nextLink) pushDeltaSet(removedLinkIds, linkId);
        else pushDeltaSet(updatedLinkIds, linkId);

        [previousLink, nextLink].forEach(function (link) {
            if (!link) return;
            pushDeltaSet(workspaceIds, link.workspace || 'main');
            pushDeltaSet(categoryNames, link.category || 'Unsorted');
            addDeltaLinkScope(scopeMap, folderIds, link);
        });
    });

    var hasFolderStoreChanges = collectChangedFolderScopesForDelta(
        previousSnapshot && previousSnapshot.bookmarkFolders,
        nextSnapshot && nextSnapshot.bookmarkFolders,
        scopeMap
    );

    var quickPinsChanged = false;
    var detachedChanged = false;
    try {
        quickPinsChanged = JSON.stringify(previousSnapshot && previousSnapshot.quickPins || []) !== JSON.stringify(nextSnapshot && nextSnapshot.quickPins || []);
    } catch (error) {
        quickPinsChanged = true;
    }
    try {
        detachedChanged = JSON.stringify(previousSnapshot && previousSnapshot.constellationDetachedChains || {}) !== JSON.stringify(nextSnapshot && nextSnapshot.constellationDetachedChains || {});
    } catch (error) {
        detachedChanged = true;
    }

    var affectedScopes = Object.keys(scopeMap).map(function (key) { return scopeMap[key]; });
    if (affectedScopes.length > CORE_DELTA_LIMIT) {
        completeState.complete = false;
        affectedScopes = affectedScopes.slice(0, CORE_DELTA_LIMIT);
    }

    var deltaLinkIds = toCappedDeltaList(linkIds, completeState);
    var deltaAddedLinkIds = toCappedDeltaList(addedLinkIds, completeState);
    var deltaUpdatedLinkIds = toCappedDeltaList(updatedLinkIds, completeState);
    var deltaRemovedLinkIds = toCappedDeltaList(removedLinkIds, completeState);
    var deltaWorkspaceIds = toCappedDeltaList(workspaceIds, completeState);
    var deltaCategoryNames = toCappedDeltaList(categoryNames, completeState);
    var deltaFolderIds = toCappedDeltaList(folderIds, completeState);

    return {
        kind: 'core-data-delta',
        complete: !!completeState.complete,
        linkIds: deltaLinkIds,
        addedLinkIds: deltaAddedLinkIds,
        updatedLinkIds: deltaUpdatedLinkIds,
        removedLinkIds: deltaRemovedLinkIds,
        workspaceIds: deltaWorkspaceIds,
        categoryNames: deltaCategoryNames,
        folderIds: deltaFolderIds,
        affectedScopes: affectedScopes,
        hasFolderStoreChanges: !!hasFolderStoreChanges,
        hasQuickPinChanges: !!quickPinsChanged,
        hasConstellationChanges: !!detachedChanged
    };
}

function buildStateMutationMeta(baseMeta, delta, configDelta) {
    var meta = baseMeta && typeof baseMeta === 'object' ? Object.assign({}, baseMeta) : {};
    if (delta) meta.dataDelta = delta;
    if (configDelta) meta.configDelta = configDelta;
    return Object.keys(meta).length ? meta : null;
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
var _lastCoreStateSnapshot = null;
var _lastConfigSignature = '';
var _lastConfigSnapshot = null;

function markCoreStateClean(snapshot) {
    var currentSnapshot = snapshot || buildCoreStateSnapshot();
    _lastCoreStateSignature = buildStateSignature(currentSnapshot);
    _lastCoreStateSnapshot = cloneCoreStateForDelta(currentSnapshot, _lastCoreStateSignature);
}

function markConfigClean(nextConfig) {
    var currentConfig = nextConfig || config || {};
    _lastConfigSignature = buildStateSignature(currentConfig);
    _lastConfigSnapshot = cloneConfigForDelta(currentConfig, _lastConfigSignature);
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
        const delta = buildCoreDataDelta(_lastCoreStateSnapshot, snapshot);
        _lastCoreStateSignature = signature;
        _lastCoreStateSnapshot = cloneCoreStateForDelta(snapshot, signature);
        dispatchStateMutation(mutationSource, {
            kind: 'data',
            immediate: true,
            meta: buildStateMutationMeta(options.meta, delta)
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
            const delta = buildCoreDataDelta(_lastCoreStateSnapshot, snapshot);
            _lastCoreStateSignature = signature;
            _lastCoreStateSnapshot = cloneCoreStateForDelta(snapshot, signature);
            dispatchStateMutation(mutationSource, {
                kind: 'data',
                immediate: false,
                meta: buildStateMutationMeta(mutationMeta, delta)
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
    var configDelta = buildConfigDelta(_lastConfigSnapshot, config || {});
    _lastConfigSignature = signature;
    _lastConfigSnapshot = cloneConfigForDelta(config || {}, signature);
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
        meta: buildStateMutationMeta(options.meta, null, configDelta)
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
