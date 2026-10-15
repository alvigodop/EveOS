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

var _lastCoreStateSignature = '';
var _lastCoreStateSnapshot = null;
var _lastConfigSignature = '';
var _lastConfigSnapshot = null;

function markCoreStateClean(snapshot) {
    var currentSnapshot = snapshot || buildCoreStateSnapshot();
    _lastCoreStateSignature = buildStateSignature(currentSnapshot);
    _lastCoreStateSnapshot = cloneCoreStateForDelta(currentSnapshot, _lastCoreStateSignature);
}

function durableConfigSnapshot(current) {
    if (!current?.audioflix || typeof window.EveAudioflixState?.durableSnapshot !== 'function') return current;
    return { ...current, audioflix: window.EveAudioflixState.durableSnapshot(current.audioflix) };
}

function markConfigClean(nextConfig) {
    var currentConfig = durableConfigSnapshot(nextConfig || config || {});
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
            cleanupLocalKeys: [EVE_LINKS_KEY],
            // snapshot.links is already a sanitized detached array, so avoid a
            // second full JSON clone before IndexedDB structured-clones it.
            skipClone: true
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
    const finishPerf = window.EvePerformanceMonitor?.startOperation?.('saveData', {
        source: mutationSource,
        skipRender
    });
    const snapshot = buildCoreStateSnapshot();
    const signature = buildStateSignature(snapshot);
    const dirty = signature !== _lastCoreStateSignature;

    if (dirty) {
        const delta = (options.meta && options.meta.dataDelta && typeof options.meta.dataDelta === 'object')
            ? options.meta.dataDelta
            : buildCoreDataDelta(_lastCoreStateSnapshot, snapshot);
        if (!options.meta?.skipEditHistory && window.EveEditHistory && typeof window.EveEditHistory.recordDataMutation === 'function') {
            window.EveEditHistory.recordDataMutation({
                before: _lastCoreStateSnapshot,
                after: snapshot,
                delta,
                source: mutationSource,
                meta: options.meta
            });
        }
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

    // In perf mode, skip the full DOM rebuild; actions handle their own UI updates.
    if (window._evePerfMode && !forceRender) {
        finishPerf?.({ dirty, skippedByPerfMode: true });
        return persistPromise;
    }

    if (shouldRefresh && !skipRender && typeof renderDashboard === 'function') {
        window.__eveDashboardRenderHint = { kind: 'data-mutation' };
        renderDashboard();
    }
    if (shouldRefresh && !skipSuggestions && typeof updateSuggestions === 'function') updateSuggestions();
    finishPerf?.({ dirty });
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
        const finishPerf = window.EvePerformanceMonitor?.startOperation?.('saveData', {
            source: mutationSource,
            skipRender
        });
        _saveDataTimer = 0;
        const snapshot = buildCoreStateSnapshot();
        const signature = buildStateSignature(snapshot);
        const dirty = signature !== _lastCoreStateSignature;
        if (dirty) {
            const delta = (mutationMeta && mutationMeta.dataDelta && typeof mutationMeta.dataDelta === 'object')
                ? mutationMeta.dataDelta
                : buildCoreDataDelta(_lastCoreStateSnapshot, snapshot);
            if (!mutationMeta?.skipEditHistory && window.EveEditHistory && typeof window.EveEditHistory.recordDataMutation === 'function') {
                window.EveEditHistory.recordDataMutation({
                    before: _lastCoreStateSnapshot,
                    after: snapshot,
                    delta,
                    source: mutationSource,
                    meta: mutationMeta
                });
            }
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
        if (window._evePerfMode && !forceRender) {
            finishPerf?.({ dirty, skippedByPerfMode: true });
            return;
        }

        if (shouldRefresh && !skipRender && typeof renderDashboard === 'function') {
            // Tag as data-mutation so the render skips expensive scroll preservation
            window.__eveDashboardRenderHint = { kind: 'data-mutation' };
            renderDashboard();
        }
        if (shouldRefresh && !skipSuggestions && typeof updateSuggestions === 'function') updateSuggestions();
        finishPerf?.({ dirty });
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
    var mutationSource = normalizeMutationSource(options.source || options.reason, 'saveConfig');
    var finishPerf = window.EvePerformanceMonitor?.startOperation?.('saveConfig', {
        source: mutationSource
    });
    // Never swap live config while an async save runs. Only the captured payload is projected.
    var persistedConfig = durableConfigSnapshot(config || {});
    var signature = buildStateSignature(persistedConfig);
    if (signature === _lastConfigSignature) {
        finishPerf?.({ dirty: false });
        return Promise.resolve(true);
    }
    var configDelta = buildConfigDelta(_lastConfigSnapshot, persistedConfig);
    if (!options.meta?.skipEditHistory && window.EveEditHistory && typeof window.EveEditHistory.recordConfigMutation === 'function') {
        window.EveEditHistory.recordConfigMutation({
            before: _lastConfigSnapshot,
            after: persistedConfig,
            delta: configDelta,
            source: mutationSource,
            meta: options.meta
        });
    }
    _lastConfigSignature = signature;
    var capturedConfig = cloneConfigForDelta(persistedConfig, signature);
    _lastConfigSnapshot = capturedConfig;

    var persistPromise = Promise.resolve(true);
    var storage = getCoreStorage();
    if (storage) {
        // Reuse only the detached full-config signature capture, never shallow live aliases.
        // A null/unstable capture retains the backend's ordinary cloning/fallback policy.
        var storageConfig = capturedConfig || persistedConfig;
        storage.syncThemeBootConfig(storageConfig);
        persistPromise = storage.saveJson(EVE_CONFIG_KEY, storageConfig, {
            skipClone: !!capturedConfig,
            localFallbackKey: EVE_CONFIG_KEY,
            cleanupLocalKeys: [EVE_CONFIG_KEY],
            mirrorLocalKey: EVE_THEME_BOOT_KEY,
            mirrorValue: storage.getThemeBootConfig(storageConfig),
            mirrorPruneRatio: 0.05
        }).catch((error) => {
            console.error('Core Storage: Failed to persist config', error);
            return false;
        });
    } else {
        try {
            localStorage.setItem(EVE_CONFIG_KEY, smartCompress(persistedConfig));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
                if (window.CCMaintenance && typeof CCMaintenance.emergencyPrune === 'function') {
                    CCMaintenance.emergencyPrune(0.3);
                    try {
                        localStorage.setItem(EVE_CONFIG_KEY, JSON.stringify(persistedConfig));
                    } catch (retryError) { }
                }
            }
        }
    }
    dispatchStateMutation(mutationSource, {
        kind: 'config',
        immediate: !!options.immediate,
        // Immutable serialization, not capturedConfig/live aliases. Only a
        // complete Audioflix-only delta can produce a reusable receipt.
        captureReceipt: window.EveDataStore?._modularSync?.offerConfigSnapshot?.(signature, configDelta),
        meta: buildStateMutationMeta(options.meta, null, configDelta)
    });
    finishPerf?.({ dirty: true });
    return persistPromise;
}

// Add save functions to global state object
if (window.eveState) {
    window.eveState.saveData = saveData;
    window.eveState.saveConfig = saveConfig;
}

// Load/clear routines live in storage.load.js to keep this persistence facade small.
