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
            text
        } = shared;
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

    async function persistSnapshot(snapshot) {
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
        return {
            loadPersistedSnapshot,
            persistSnapshot
        };
    }

    ns.IndexPersistenceRuntime = { create };
})();