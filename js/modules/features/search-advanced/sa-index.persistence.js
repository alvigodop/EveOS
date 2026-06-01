window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexPersistenceRuntime) return;

    function create(deps) {
        const shared = deps?.shared || {};
        const buildDatapackStateFingerprint = deps?.buildDatapackStateFingerprint || function () { return ''; };
        const {
            STORAGE_KEY,
            STORAGE_MANAGER_KEY,
            state,
            readConfig,
            text
        } = shared;
    const PERSIST_RECORD_CAP_DEFAULT = 15000;

    function readPersistRecordCap() {
        const cfg = typeof readConfig === 'function' ? readConfig() : {};
        const raw = Number(cfg?.nexusIndexPersistMaxRecords);
        if (Number.isFinite(raw) && raw >= 0) return raw;
        return PERSIST_RECORD_CAP_DEFAULT;
    }

    function getSnapshotRecordCount(snapshot) {
        return Array.isArray(snapshot?.records) ? snapshot.records.length : 0;
    }

    function shouldSkipPersistSnapshot(snapshot) {
        const maxRecords = readPersistRecordCap();
        if (maxRecords <= 0) return false;
        return getSnapshotRecordCount(snapshot) > maxRecords;
    }

    function recordPersistSkipped(snapshot, reason) {
        state.lastPersistSkipped = {
            reason: text(reason, 'large-snapshot'),
            recordCount: getSnapshotRecordCount(snapshot),
            maxRecords: readPersistRecordCap(),
            datapackFingerprint: text(snapshot?.datapackFingerprint, ''),
            at: Date.now()
        };
    }

    async function clearPersistedSnapshot(reason) {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('global_' + STORAGE_MANAGER_KEY);
        } catch (error) {
            console.warn('[NexusIndex] Persisted snapshot cleanup failed:', error);
        }

        try {
            if (window.StorageManager?.deleteHeavyData) {
                await window.StorageManager.deleteHeavyData(STORAGE_MANAGER_KEY);
            } else if (window.StorageManager?.deleteData) {
                window.StorageManager.deleteData(STORAGE_MANAGER_KEY, null, { backend: 'localstorage' });
            }
        } catch (error) {
            console.warn('[NexusIndex] StorageManager cleanup failed:', error);
        }
        state.lastPersistCleanupReason = text(reason, 'large-snapshot');
    }

    async function loadPersistedSnapshot() {
        if (state.loaded) return state.snapshot;
        state.loaded = true;

        let snapshot = null;
        try {
            if (window.StorageManager?.loadDataAsync) {
                snapshot = await window.StorageManager.loadDataAsync(STORAGE_MANAGER_KEY, null, null);
            }
        } catch (error) {
            console.warn('[NexusIndex] StorageManager load failed:', error);
        }

        if (!snapshot) {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                snapshot = raw ? JSON.parse(raw) : null;
            } catch (error) {
                console.warn('[NexusIndex] localStorage load failed:', error);
            }
        }

        if (snapshot?.version === shared.INDEX_VERSION && Array.isArray(snapshot.records)) {
            if (shouldSkipPersistSnapshot(snapshot)) {
                recordPersistSkipped(snapshot, 'persisted-snapshot-too-large');
                await clearPersistedSnapshot('persisted-snapshot-too-large');
                state.snapshot = null;
                state.dirty = true;
                state.lastReason = 'persisted-snapshot-too-large';
                return state.snapshot;
            }
            const currentFingerprint = buildDatapackStateFingerprint();
            const snapshotFingerprint = text(snapshot.datapackFingerprint, '');
            if (currentFingerprint && snapshotFingerprint && snapshotFingerprint !== currentFingerprint) {
                state.snapshot = null;
                state.dirty = true;
                state.lastReason = 'datapack-fingerprint-mismatch';
                state.datapackFingerprint = currentFingerprint;
                return state.snapshot;
            }
            if (currentFingerprint && !snapshotFingerprint) {
                state.snapshot = null;
                state.dirty = true;
                state.lastReason = 'datapack-fingerprint-missing';
                state.datapackFingerprint = currentFingerprint;
                return state.snapshot;
            }
            state.snapshot = snapshot;
            state.dirty = false;
            state.datapackFingerprint = snapshotFingerprint || currentFingerprint;
        }

        return state.snapshot;
    }

    let pendingPersistSnapshot = null;
    let pendingPersistTimer = 0;
    let pendingIdleHandle = 0;
    let persistInFlight = null;

    function clearPendingPersistTimers() {
        if (pendingPersistTimer) {
            clearTimeout(pendingPersistTimer);
            pendingPersistTimer = 0;
        }
        if (pendingIdleHandle && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(pendingIdleHandle);
        }
        pendingIdleHandle = 0;
    }

    async function writeSnapshot(snapshot) {
        if (shouldSkipPersistSnapshot(snapshot)) {
            recordPersistSkipped(snapshot, 'snapshot-too-large');
            await clearPersistedSnapshot('snapshot-too-large');
            return true;
        }
        state.lastPersistSkipped = null;
        let savedToPrimaryStorage = false;
        try {
            if (window.StorageManager?.saveDataAsync) {
                await window.StorageManager.saveDataAsync(STORAGE_MANAGER_KEY, snapshot, null);
                savedToPrimaryStorage = true;
            }
        } catch (error) {
            console.warn('[NexusIndex] StorageManager save failed:', error);
        }

        if (savedToPrimaryStorage) return;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        } catch (error) {
            if (!(error && error.name === 'QuotaExceededError')) {
                console.warn('[NexusIndex] localStorage save failed:', error);
            }
        }
    }

    function flushPendingPersistSnapshot() {
        const snapshot = pendingPersistSnapshot;
        pendingPersistSnapshot = null;
        clearPendingPersistTimers();
        if (!snapshot) return Promise.resolve(false);
        persistInFlight = writeSnapshot(snapshot)
            .catch(function (error) {
                console.warn('[NexusIndex] Deferred snapshot save failed:', error);
                return false;
            })
            .finally(function () {
                persistInFlight = null;
                if (pendingPersistSnapshot) scheduleDeferredPersist(pendingPersistSnapshot);
            });
        return persistInFlight;
    }

    function scheduleDeferredPersist(snapshot) {
        pendingPersistSnapshot = snapshot;
        clearPendingPersistTimers();
        const recordCount = getSnapshotRecordCount(snapshot);
        const largeMutationActive = Number(window.__eveLargeMutationActiveUntil || 0) > Date.now();
        const delayMs = largeMutationActive || recordCount > 5000 ? 1800 : 650;
        pendingPersistTimer = setTimeout(function () {
            pendingPersistTimer = 0;
            const run = function () { flushPendingPersistSnapshot(); };
            if (typeof window.requestIdleCallback === 'function') {
                pendingIdleHandle = window.requestIdleCallback(function () {
                    pendingIdleHandle = 0;
                    run();
                }, { timeout: 2500 });
            } else {
                setTimeout(run, 0);
            }
        }, delayMs);
    }

    async function persistSnapshot(snapshot) {
        const recordCount = getSnapshotRecordCount(snapshot);
        if (shouldSkipPersistSnapshot(snapshot)) {
            pendingPersistSnapshot = null;
            clearPendingPersistTimers();
            recordPersistSkipped(snapshot, 'snapshot-too-large');
            await clearPersistedSnapshot('snapshot-too-large');
            return true;
        }
        const largeMutationActive = Number(window.__eveLargeMutationActiveUntil || 0) > Date.now();
        if (recordCount > 2500 || largeMutationActive) {
            scheduleDeferredPersist(snapshot);
            return true;
        }
        if (persistInFlight) {
            scheduleDeferredPersist(snapshot);
            return true;
        }
        return writeSnapshot(snapshot);
    }
        return {
            loadPersistedSnapshot,
            persistSnapshot,
            flushPendingPersistSnapshot
        };
    }

    ns.IndexPersistenceRuntime = { create };
})();
