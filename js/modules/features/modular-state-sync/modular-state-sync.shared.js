// --- Modular State Sync Shared ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.sharedReady) return;

    const constants = ns.constants = Object.assign({
        DEFAULT_INTERVAL_MS: 5000,
        MIN_INTERVAL_MS: 2000,
        MAX_INTERVAL_MS: 60000,
        MUTATION_DEBOUNCE_MS: 650,
        IDLE_REMOTE_CHECK_INTERVAL_MS: 120000,
        CONFLICT_REMOTE_WINS: 'remote_wins',
        CONFLICT_LOCAL_WINS: 'local_wins'
    }, ns.constants || {});

    const state = ns.state = Object.assign({
        initialized: false,
        syncTimer: null,
        mutationTimer: null,
        remoteSignature: '',
        lastUploadedHash: '',
        lastSyncedLocalHash: '',
        lastRemoteCheckAt: 0,
        applyingRemoteState: false,
        syncInFlight: false
    }, ns.state || {});

    function getStore() {
        return window.EveDataStore?.Store || null;
    }

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function isHttpContext() {
        return /^https?:$/i.test(window.location.protocol || '');
    }

    function isEnabled() {
        const cfg = getConfig();
        return cfg.modularStateSyncEnabled !== false;
    }

    function getConflictStrategy() {
        const strategy = String(getConfig().modularStateConflictStrategy || constants.CONFLICT_REMOTE_WINS).trim().toLowerCase();
        return strategy === constants.CONFLICT_LOCAL_WINS
            ? constants.CONFLICT_LOCAL_WINS
            : constants.CONFLICT_REMOTE_WINS;
    }

    function ensureConfigDefaults() {
        const cfg = getConfig();
        if (typeof cfg.modularStateSyncEnabled !== 'boolean') cfg.modularStateSyncEnabled = true;
        if (!Number.isFinite(Number(cfg.modularStateSyncIntervalMs))) cfg.modularStateSyncIntervalMs = constants.DEFAULT_INTERVAL_MS;
        if (![constants.CONFLICT_REMOTE_WINS, constants.CONFLICT_LOCAL_WINS].includes(String(cfg.modularStateConflictStrategy || ''))) {
            cfg.modularStateConflictStrategy = constants.CONFLICT_REMOTE_WINS;
        }
        if (typeof cfg.modularStateRootPath !== 'string') cfg.modularStateRootPath = '';
        if (typeof cfg.modularLayerPath !== 'string') cfg.modularLayerPath = '';
        if (typeof cfg.modularLayerScope !== 'string') cfg.modularLayerScope = 'store';
    }

    function getIntervalMs() {
        const raw = Number(getConfig().modularStateSyncIntervalMs || constants.DEFAULT_INTERVAL_MS);
        if (!Number.isFinite(raw)) return constants.DEFAULT_INTERVAL_MS;
        return Math.max(constants.MIN_INTERVAL_MS, Math.min(constants.MAX_INTERVAL_MS, raw));
    }

    function hashString(input) {
        const str = String(input || '');
        let hash = 5381;
        for (let index = 0; index < str.length; index += 1) {
            hash = ((hash << 5) + hash) ^ str.charCodeAt(index);
        }
        return (hash >>> 0).toString(16);
    }

    function normalizeStateForHash(sourceState) {
        if (!sourceState || typeof sourceState !== 'object') return {};
        let normalized = null;
        try {
            normalized = JSON.parse(JSON.stringify(sourceState));
        } catch {
            return sourceState;
        }

        if (normalized.metadata && typeof normalized.metadata === 'object') {
            delete normalized.metadata.date;
            delete normalized.metadata.generatedAt;
            delete normalized.metadata.lastUpdated;
        }
        return normalized;
    }

    function hashState(sourceState) {
        try {
            return hashString(JSON.stringify(normalizeStateForHash(sourceState)));
        } catch {
            return '';
        }
    }

    function shouldRunIdleRemoteCheck() {
        if (!state.lastRemoteCheckAt) return true;
        return (Date.now() - state.lastRemoteCheckAt) >= constants.IDLE_REMOTE_CHECK_INTERVAL_MS;
    }

    function captureStateHash() {
        const store = getStore();
        if (!store?.captureState) return '';
        try {
            return hashState(store.captureState());
        } catch {
            return '';
        }
    }

    function refreshUiAfterRemoteApply() {
        try {
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof updateSuggestions === 'function') updateSuggestions();
        } catch (error) {
            console.warn('[ModularStateSync] UI refresh failed after remote apply:', error);
        }
    }

    async function requestJson(path, options = {}) {
        const response = await fetch(path, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            ...options
        });
        const payload = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, payload };
    }

    async function getRemoteStatus() {
        const { ok, payload } = await requestJson('/api/eve-state/modular/status');
        if (!ok || !payload?.ok) return null;
        return payload;
    }

    function isLocalDirty(currentHash = '') {
        if (!currentHash) return false;
        const baseline = state.lastUploadedHash || state.lastSyncedLocalHash;
        if (!baseline) return false;
        return currentHash !== baseline;
    }

    Object.assign(ns, {
        constants,
        state,
        getStore,
        getConfig,
        isHttpContext,
        isEnabled,
        getConflictStrategy,
        ensureConfigDefaults,
        getIntervalMs,
        hashString,
        normalizeStateForHash,
        hashState,
        shouldRunIdleRemoteCheck,
        captureStateHash,
        refreshUiAfterRemoteApply,
        requestJson,
        getRemoteStatus,
        isLocalDirty
    });

    ns.sharedReady = true;
})();
