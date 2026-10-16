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
var _pendingConfigSave = null;
var _lastConfigMutationSignature = '';
var _lastConfigMutationSnapshot = null;
var _configRequestSequence = 0;

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
    _configRequestSequence += 1;
    var currentConfig = durableConfigSnapshot(nextConfig || config || {});
    _lastConfigSignature = buildStateSignature(currentConfig);
    _lastConfigSnapshot = cloneConfigForDelta(currentConfig, _lastConfigSignature);
    _lastConfigMutationSignature = _lastConfigSignature;
    _lastConfigMutationSnapshot = _lastConfigSnapshot;
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

function detachConfigForWrite(value) {
    if (typeof structuredClone === 'function') {
        try { return structuredClone(value); } catch (error) { /* Retain JSON-config compatibility. */ }
    }
    var seen = new Map();
    function copy(current) {
        if (!current || typeof current !== 'object') return current;
        if (seen.has(current)) return seen.get(current);
        if (Object.prototype.toString.call(current) === '[object Date]') return new Date(current.getTime());
        var next = Array.isArray(current) ? [] : {};
        seen.set(current, next);
        Object.keys(current).forEach(function (key) { next[key] = copy(current[key]); });
        return next;
    }
    return copy(value);
}

function queueConfigWrite(signature, capturedConfig, write, getCapturedConfig) {
    var previous = _pendingConfigSave;
    var resolveSave;
    var pending = { signature, promise: new Promise(function (resolve) { resolveSave = resolve; }) };
    _pendingConfigSave = pending;
    function complete(accepted, error) {
        if (error) console.error('Core Storage: Failed to persist config', error);
        if (accepted) {
            _lastConfigSignature = signature;
            _lastConfigSnapshot = getCapturedConfig ? getCapturedConfig() : capturedConfig;
        }
        if (_pendingConfigSave === pending) _pendingConfigSave = null;
        resolveSave(accepted);
    }
    function start() {
        try {
            Promise.resolve(write()).then(function (accepted) {
                complete(accepted === true);
            }, function (error) { complete(false, error); });
        } catch (error) { complete(false, error); }
    }
    // The initial backend call remains synchronous; later conflicting payloads
    // cannot reach even an unordered backend before their predecessor settles.
    if (previous) previous.promise.then(start);
    else start();
    return pending.promise;
}

function persistConfigCapture(storage, storageConfig, capturedConfig) {
    if (storage) {
        storage.syncThemeBootConfig(storageConfig);
        return storage.saveJson(EVE_CONFIG_KEY, storageConfig, {
            skipClone: !!capturedConfig,
            localFallbackKey: EVE_CONFIG_KEY,
            cleanupLocalKeys: [EVE_CONFIG_KEY],
            mirrorLocalKey: EVE_THEME_BOOT_KEY,
            mirrorValue: storage.getThemeBootConfig(storageConfig),
            mirrorPruneRatio: 0.05
        });
    }
    try {
        localStorage.setItem(EVE_CONFIG_KEY, smartCompress(storageConfig));
    } catch (error) {
        var quota = error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22;
        if (!quota || typeof window.CCMaintenance?.emergencyPrune !== 'function') throw error;
        window.CCMaintenance.emergencyPrune(0.3);
        localStorage.setItem(EVE_CONFIG_KEY, JSON.stringify(storageConfig));
    }
    return true;
}

function saveConfigCooperatively(options, source, finishPerf, signature, sequence, fallbackConfig) {
    var capturedConfig = null;
    var conflictingPending = !!_pendingConfigSave;
    var current = function () {
        return sequence === _configRequestSequence
            && (typeof options.isCurrent !== 'function' || options.isCurrent());
    };
    var yieldTask = function () { return window.EveCooperativeWork?.yieldTask?.() || Promise.resolve(); };
    return queueConfigWrite(signature, null, async function () {
        try {
            await yieldTask();
            if (!current()) return false;
            capturedConfig = cloneConfigForDelta(null, signature);
            var storageConfig = capturedConfig || fallbackConfig;
            if (!storageConfig) storageConfig = JSON.parse(signature);
            await yieldTask();
            if (!current()) return false;
            var mutationDirty = signature !== _lastConfigMutationSignature;
            var unacknowledgedMutation = _lastConfigMutationSignature !== _lastConfigSignature;
            var configDelta = buildConfigDelta(_lastConfigMutationSnapshot, storageConfig);
            await yieldTask();
            if (!current()) return false;
            if (mutationDirty) {
                if (!options.meta?.skipEditHistory && window.EveEditHistory?.recordConfigMutation) {
                    window.EveEditHistory.recordConfigMutation({ before: _lastConfigMutationSnapshot,
                        after: storageConfig, delta: configDelta, source, meta: options.meta });
                }
                _lastConfigMutationSignature = signature;
                _lastConfigMutationSnapshot = capturedConfig;
                dispatchStateMutation(source, {
                    kind: 'config', immediate: !!options.immediate,
                    captureReceipt: conflictingPending || unacknowledgedMutation ? null
                        : window.EveDataStore?._modularSync?.offerConfigSnapshot?.(signature, configDelta),
                    meta: buildStateMutationMeta(options.meta, null, configDelta)
                });
            }
            await yieldTask();
            if (!current()) return false;
            if (!conflictingPending && signature === _lastConfigSignature) return true;
            return await persistConfigCapture(getCoreStorage(), storageConfig, capturedConfig);
        } finally { finishPerf?.({ dirty: true, cooperative: true, retired: !current() }); }
    }, function () { return capturedConfig; });
}

function _saveConfigImmediate(options = {}) {
    var mutationSource = normalizeMutationSource(options.source || options.reason, 'saveConfig');
    var finishPerf = window.EvePerformanceMonitor?.startOperation?.('saveConfig', {
        source: mutationSource
    });
    // Never swap live config while an async save runs. Only the captured payload is projected.
    var projection = window.EveAudioflixState?.durableProjectionForSerialization;
    // A serialization projection may contain live aliases. Seal every byte before yielding.
    var persistedConfig = options.cooperative && config?.audioflix && typeof projection === 'function'
        ? { ...config, audioflix: projection(config.audioflix) } : durableConfigSnapshot(config || {});
    var signature = buildStateSignature(persistedConfig);
    if (_pendingConfigSave?.signature === signature) {
        finishPerf?.({ dirty: true, pending: true });
        return _pendingConfigSave.promise;
    }
    var requestSequence = ++_configRequestSequence;
    var conflictingPending = !!_pendingConfigSave;
    var mutationDirty = signature !== _lastConfigMutationSignature;
    var unacknowledgedMutation = _lastConfigMutationSignature !== _lastConfigSignature;
    if (!conflictingPending && !mutationDirty && signature === _lastConfigSignature) {
        finishPerf?.({ dirty: false });
        return Promise.resolve(true);
    }
    if (options.cooperative) {
        var fallbackConfig = typeof signature !== 'string' || signature.startsWith('unstable:')
            ? detachConfigForWrite(persistedConfig) : null;
        return saveConfigCooperatively(options, mutationSource, finishPerf, signature, requestSequence, fallbackConfig);
    }
    var configDelta = buildConfigDelta(_lastConfigMutationSnapshot, persistedConfig);
    if (mutationDirty && !options.meta?.skipEditHistory && window.EveEditHistory && typeof window.EveEditHistory.recordConfigMutation === 'function') {
        window.EveEditHistory.recordConfigMutation({
            before: _lastConfigMutationSnapshot,
            after: persistedConfig,
            delta: configDelta,
            source: mutationSource,
            meta: options.meta
        });
    }
    var capturedConfig = cloneConfigForDelta(persistedConfig, signature);
    // Fallback captures must also detach before waiting behind another write.
    // Keep skipClone=false so the backend retains its ordinary fallback policy.
    var storageConfig = capturedConfig || detachConfigForWrite(persistedConfig);
    var storage = getCoreStorage();
    var persistPromise = !conflictingPending && signature === _lastConfigSignature
        ? Promise.resolve(true)
        : queueConfigWrite(signature, capturedConfig, function () {
            return persistConfigCapture(storage, storageConfig, capturedConfig);
        });
    if (mutationDirty) {
        _lastConfigMutationSignature = signature;
        _lastConfigMutationSnapshot = capturedConfig;
        dispatchStateMutation(mutationSource, {
            kind: 'config',
            immediate: !!options.immediate,
            // A pending/failed predecessor may have moved modular state beyond
            // the accepted baseline, so its successor requires full capture.
            captureReceipt: conflictingPending || unacknowledgedMutation ? null
                : window.EveDataStore?._modularSync?.offerConfigSnapshot?.(signature, configDelta),
            meta: buildStateMutationMeta(options.meta, null, configDelta)
        });
    }
    finishPerf?.({ dirty: true });
    return persistPromise;
}

// Add save functions to global state object
if (window.eveState) {
    window.eveState.saveData = saveData;
    window.eveState.saveConfig = saveConfig;
}

// Load/clear routines live in storage.load.js to keep this persistence facade small.
