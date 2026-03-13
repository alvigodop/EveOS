/**
 * NEURAL CORE :: CHRONOS ENGINE
 * Pulse Snapshots
 *
 * Auto-saves the library state to JSON snapshots in localStorage.
 * Periodically called (e.g., on manual save or schedule).
 */

(function() {
    window.EveChronosEngine = window.EveChronosEngine || {};

    const SNAPSHOT_KEY_PREFIX = 'eveos_pulse_snapshot_';
    const MAX_SNAPSHOTS = 5;

    function captureSnapshot() {
        const timestamp = Date.now();
        const state = {
            timestamp: timestamp,
            links: window.links || [],
            config: window.config || {},
            eveState: window.eveState || {}
        };

        try {
            const stateStr = JSON.stringify(state);
            localStorage.setItem(SNAPSHOT_KEY_PREFIX + timestamp, stateStr);
            pruneSnapshots();
            console.log(`[Chronos] Pulse snapshot saved: ${timestamp}`);
        } catch (e) {
            console.warn('[Chronos] Failed to save pulse snapshot (quota exceeded?):', e);
        }
    }

    function pruneSnapshots() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(SNAPSHOT_KEY_PREFIX)) {
                    keys.push({ key: key, time: parseInt(key.replace(SNAPSHOT_KEY_PREFIX, ''), 10) });
                }
            }
            keys.sort((a, b) => b.time - a.time); // newest first

            // Remove older than MAX_SNAPSHOTS
            if (keys.length > MAX_SNAPSHOTS) {
                for (let i = MAX_SNAPSHOTS; i < keys.length; i++) {
                    localStorage.removeItem(keys[i].key);
                    console.log(`[Chronos] Pruned old snapshot: ${keys[i].key}`);
                }
            }
        } catch (e) {
            console.error('[Chronos] Error pruning snapshots:', e);
        }
    }

    function getSnapshots() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(SNAPSHOT_KEY_PREFIX)) {
                keys.push({ key: key, time: parseInt(key.replace(SNAPSHOT_KEY_PREFIX, ''), 10) });
            }
        }
        return keys.sort((a, b) => b.time - a.time);
    }

    function restoreSnapshot(timestamp) {
        const key = SNAPSHOT_KEY_PREFIX + timestamp;
        const stateStr = localStorage.getItem(key);
        if (stateStr) {
            try {
                const state = JSON.parse(stateStr);
                if (state.links) window.links = state.links;
                if (state.config) window.config = state.config;
                if (state.eveState) window.eveState = state.eveState;
                console.log(`[Chronos] Pulse snapshot restored: ${timestamp}`);

                // Trigger full UI re-render
                if (typeof window.saveData === 'function') window.saveData();
                if (typeof window.saveConfig === 'function') window.saveConfig();
                if (typeof window.renderSidebar === 'function') window.renderSidebar();
                if (typeof window.renderDashboard === 'function') window.renderDashboard();
                if (typeof window.showToast === 'function') window.showToast('Chronos snapshot restored.', 'success');

                return true;
            } catch (e) {
                console.error('[Chronos] Error restoring snapshot:', e);
            }
        }
        return false;
    }

    window.EveChronosEngine.captureSnapshot = captureSnapshot;
    window.EveChronosEngine.getSnapshots = getSnapshots;
    window.EveChronosEngine.restoreSnapshot = restoreSnapshot;

    // Automatically hook into main saveData to take a snapshot occasionally
    const originalSaveData = window.saveData;
    let lastSnapshotTime = 0;
    const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    if (typeof originalSaveData === 'function') {
        window.saveData = function() {
            const ret = originalSaveData.apply(this, arguments);
            const now = Date.now();
            if (now - lastSnapshotTime > SNAPSHOT_INTERVAL_MS) {
                captureSnapshot();
                lastSnapshotTime = now;
            }
            return ret;
        };
    }
})();
