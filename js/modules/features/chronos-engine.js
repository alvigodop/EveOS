/**
 * NEURAL CORE :: CHRONOS ENGINE
 * Pulse Snapshots
 *
 * Auto-saves the library state to IndexedDB when available.
 * Legacy localStorage snapshots remain readable and are migrated forward.
 */

(function() {
    window.EveChronosEngine = window.EveChronosEngine || {};

    const SNAPSHOT_KEY_PREFIX = 'eveos_pulse_snapshot_';
    const SNAPSHOT_IDB_PREFIX = 'core_eveos_pulse_snapshot_';
    const MAX_SNAPSHOTS = 5;
    const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    let snapshotQueued = false;
    let lastSnapshotTime = 0;
    let legacyMigrationPromise = null;
    let snapshotFallbackWarned = false;

    function isVerbose() {
        try {
            const qs = new URLSearchParams(window.location.search || '');
            if (qs.get('debugBackground') === '1') return true;
            return window.localStorage && window.localStorage.getItem('eve.debugBackground') === '1';
        } catch (e) {
            return false;
        }
    }

    function debugLog() {
        if (!isVerbose()) return;
        console.log.apply(console, arguments);
    }

    function snapshotIdbKey(timestamp) {
        return `${SNAPSHOT_IDB_PREFIX}${Number(timestamp || 0)}`;
    }

    async function canUseIndexedDb() {
        if (window.EveCoreStorage && typeof window.EveCoreStorage.canUseIndexedDb === 'function') {
            return await window.EveCoreStorage.canUseIndexedDb();
        }
        if (!window.IDBStore || typeof window.IDBStore.init !== 'function') {
            return false;
        }
        try {
            await window.IDBStore.init();
            return true;
        } catch (error) {
            return false;
        }
    }

    function collectLegacySnapshotMetadata() {
        const keys = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith(SNAPSHOT_KEY_PREFIX)) continue;
                keys.push({
                    key: key,
                    time: parseInt(key.replace(SNAPSHOT_KEY_PREFIX, ''), 10)
                });
            }
        } catch (error) {
            console.error('[Chronos] Error scanning legacy snapshots:', error);
        }
        return keys.sort((a, b) => b.time - a.time);
    }

    async function getIndexedDbSnapshotMetadata() {
        if (!window.IDBStore || typeof window.IDBStore.keys !== 'function') {
            return [];
        }
        const keys = await window.IDBStore.keys();
        return (Array.isArray(keys) ? keys : [])
            .map((key) => String(key || ''))
            .filter((key) => key.startsWith(SNAPSHOT_IDB_PREFIX))
            .map((key) => ({
                key,
                time: parseInt(key.replace(SNAPSHOT_IDB_PREFIX, ''), 10)
            }))
            .filter((entry) => Number.isFinite(entry.time))
            .sort((a, b) => b.time - a.time);
    }

    async function migrateLegacySnapshots() {
        if (legacyMigrationPromise) {
            return await legacyMigrationPromise;
        }

        legacyMigrationPromise = (async function () {
            if (!await canUseIndexedDb()) {
                return false;
            }

            const legacySnapshots = collectLegacySnapshotMetadata();
            if (!legacySnapshots.length) {
                return true;
            }

            for (const snapshot of legacySnapshots) {
                try {
                    const raw = localStorage.getItem(snapshot.key);
                    if (!raw) continue;
                    const parsed = JSON.parse(raw);
                    await window.IDBStore.set(snapshotIdbKey(snapshot.time), parsed);
                    localStorage.removeItem(snapshot.key);
                } catch (error) {
                    console.warn(`[Chronos] Failed to migrate legacy snapshot ${snapshot.key}:`, error);
                }
            }

            await pruneSnapshots();
            debugLog(`[Chronos] Migrated ${legacySnapshots.length} legacy snapshots to IndexedDB.`);
            return true;
        })().finally(() => {
            legacyMigrationPromise = null;
        });

        return await legacyMigrationPromise;
    }

    async function pruneSnapshots() {
        if (await canUseIndexedDb()) {
            try {
                const keys = await getIndexedDbSnapshotMetadata();
                if (keys.length > MAX_SNAPSHOTS) {
                    for (let i = MAX_SNAPSHOTS; i < keys.length; i++) {
                        await window.IDBStore.remove(keys[i].key);
                        debugLog(`[Chronos] Pruned IndexedDB snapshot: ${keys[i].key}`);
                    }
                }
                return;
            } catch (error) {
                console.error('[Chronos] Error pruning IndexedDB snapshots:', error);
            }
        }

        try {
            const keys = collectLegacySnapshotMetadata();
            if (keys.length > MAX_SNAPSHOTS) {
                for (let i = MAX_SNAPSHOTS; i < keys.length; i++) {
                    localStorage.removeItem(keys[i].key);
                    debugLog(`[Chronos] Pruned legacy snapshot: ${keys[i].key}`);
                }
            }
        } catch (error) {
            console.error('[Chronos] Error pruning legacy snapshots:', error);
        }
    }

    async function captureSnapshot() {
        const timestamp = Date.now();
        const liveLinks = typeof window.getLiveLinks === 'function'
            ? window.getLiveLinks()
            : (window.links || []);
        let state = {
            timestamp: timestamp,
            links: liveLinks,
            config: window.config || {},
            eveState: window.eveState || {}
        };

        try {
            await migrateLegacySnapshots();

            if (!await canUseIndexedDb()) {
                if (!snapshotFallbackWarned) {
                    snapshotFallbackWarned = true;
                    console.warn('[Chronos] IndexedDB unavailable. Pulse snapshots are disabled to protect localStorage capacity.');
                }
                return false;
            }

            state = JSON.parse(JSON.stringify(state));
            await window.IDBStore.set(snapshotIdbKey(timestamp), state);
            await pruneSnapshots();
            debugLog(`[Chronos] Pulse snapshot saved to IndexedDB: ${timestamp}`);
            return true;
        } catch (e) {
            console.warn('[Chronos] Failed to save pulse snapshot:', e);
            return false;
        } finally {
            snapshotQueued = false;
        }
    }

    function scheduleSnapshotCapture() {
        if (snapshotQueued) return;
        snapshotQueued = true;

        const run = () => { void captureSnapshot(); };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run, { timeout: 5000 });
            return;
        }

        window.setTimeout(run, 250);
    }

    function scheduleSnapshotForMutation(event) {
        const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
        if (detail.dirty === false) return;
        const source = String(detail.source || '').trim();
        if (source === 'chronos-restore') return;

        const now = Date.now();
        if (now - lastSnapshotTime <= SNAPSHOT_INTERVAL_MS) return;
        lastSnapshotTime = now;
        scheduleSnapshotCapture();
    }

    async function getSnapshots() {
        await migrateLegacySnapshots();
        if (await canUseIndexedDb()) {
            return await getIndexedDbSnapshotMetadata();
        }
        return collectLegacySnapshotMetadata();
    }

    async function restoreSnapshot(timestamp) {
        await migrateLegacySnapshots();

        let state = null;
        if (await canUseIndexedDb()) {
            try {
                state = await window.IDBStore.get(snapshotIdbKey(timestamp));
            } catch (error) {
                console.warn('[Chronos] Failed to load IndexedDB snapshot:', error);
            }
        }

        if (!state) {
            try {
                const raw = localStorage.getItem(SNAPSHOT_KEY_PREFIX + timestamp);
                if (raw) {
                    state = JSON.parse(raw);
                }
            } catch (error) {
                console.warn('[Chronos] Failed to load legacy snapshot:', error);
            }
        }

        if (!state) return false;

        try {
            if (state.config) window.config = state.config;
            if (state.eveState) window.eveState = state.eveState;
            if (state.links) {
                if (typeof window.setLiveLinks === 'function') window.setLiveLinks(state.links);
                else {
                    if (window.eveState) window.eveState.links = state.links;
                    window.links = state.links;
                    if (typeof links !== 'undefined') links = state.links;
                }
            }
            debugLog(`[Chronos] Pulse snapshot restored: ${timestamp}`);

            // Trigger full UI re-render
            if (typeof window.saveData === 'function') window.saveData({
                source: 'chronos-snapshot-restored',
                meta: { restoredSnapshot: true, timestamp: timestamp }
            });
            if (typeof window.saveConfig === 'function') window.saveConfig({
                source: 'chronos-snapshot-restored',
                meta: { restoredSnapshot: true, timestamp: timestamp }
            });
            if (typeof window.renderSidebar === 'function') window.renderSidebar();
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            if (typeof window.showToast === 'function') window.showToast('Chronos snapshot restored.', 'success');

            return true;
        } catch (e) {
            console.error('[Chronos] Error restoring snapshot:', e);
            return false;
        }
    }

    window.EveChronosEngine.captureSnapshot = captureSnapshot;
    window.EveChronosEngine.getSnapshots = getSnapshots;
    window.EveChronosEngine.restoreSnapshot = restoreSnapshot;

    window.addEventListener('eve:state-mutated', scheduleSnapshotForMutation);
})();
