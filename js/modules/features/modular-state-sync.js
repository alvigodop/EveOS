// --- Modular State Sync ---
// Two-way sync between in-memory EveOS state and on-disk modular JSON store.
window.EveDataStore = window.EveDataStore || {};

(function () {
    const DEFAULT_INTERVAL_MS = 5000;
    const MIN_INTERVAL_MS = 2000;
    const MAX_INTERVAL_MS = 60000;
    const MUTATION_DEBOUNCE_MS = 650;
    const CONFLICT_REMOTE_WINS = 'remote_wins';
    const CONFLICT_LOCAL_WINS = 'local_wins';

    let initialized = false;
    let syncTimer = null;
    let mutationTimer = null;
    let remoteSignature = '';
    let lastUploadedHash = '';
    let lastSyncedLocalHash = '';
    let applyingRemoteState = false;
    let syncInFlight = false;

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
        const strategy = String(getConfig().modularStateConflictStrategy || CONFLICT_REMOTE_WINS).trim().toLowerCase();
        return strategy === CONFLICT_LOCAL_WINS ? CONFLICT_LOCAL_WINS : CONFLICT_REMOTE_WINS;
    }

    function ensureConfigDefaults() {
        const cfg = getConfig();
        if (typeof cfg.modularStateSyncEnabled !== 'boolean') cfg.modularStateSyncEnabled = true;
        if (!Number.isFinite(Number(cfg.modularStateSyncIntervalMs))) cfg.modularStateSyncIntervalMs = DEFAULT_INTERVAL_MS;
        if (![CONFLICT_REMOTE_WINS, CONFLICT_LOCAL_WINS].includes(String(cfg.modularStateConflictStrategy || ''))) {
            cfg.modularStateConflictStrategy = CONFLICT_REMOTE_WINS;
        }
    }

    function getIntervalMs() {
        const raw = Number(getConfig().modularStateSyncIntervalMs || DEFAULT_INTERVAL_MS);
        if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MS;
        return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, raw));
    }

    function hashString(input) {
        const str = String(input || '');
        let hash = 5381;
        for (let i = 0; i < str.length; i += 1) {
            hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        }
        return (hash >>> 0).toString(16);
    }

    function captureStateHash() {
        const store = getStore();
        if (!store?.captureState) return '';
        try {
            return hashString(JSON.stringify(store.captureState()));
        } catch {
            return '';
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
        const baseline = lastUploadedHash || lastSyncedLocalHash;
        if (!baseline) return false;
        return currentHash !== baseline;
    }

    async function pushLocalState(force = false, knownHash = '') {
        if (!isHttpContext() || !isEnabled()) return false;
        const store = getStore();
        if (!store?.captureState) return false;

        const state = store.captureState();
        const stateJson = JSON.stringify(state);
        const stateHash = knownHash || hashString(stateJson);
        if (!force && (stateHash === lastUploadedHash || stateHash === lastSyncedLocalHash)) return false;

        const { ok, payload } = await requestJson('/api/eve-state/modular/save', {
            method: 'POST',
            body: stateJson
        });
        if (!ok || !payload?.ok) {
            console.warn('[ModularStateSync] Save failed:', payload?.error || 'Unknown error');
            return false;
        }

        lastUploadedHash = stateHash;
        lastSyncedLocalHash = stateHash;
        remoteSignature = payload?.status?.signature || remoteSignature;
        return true;
    }

    async function pullRemoteState(force = false, knownSignature = '') {
        if (!isHttpContext() || !isEnabled()) return false;
        const store = getStore();
        if (!store?.applyState) return false;

        if (!force && knownSignature && remoteSignature && knownSignature === remoteSignature) {
            return false;
        }

        const { ok, payload } = await requestJson('/api/eve-state/modular/load');
        if (!ok || !payload?.ok) {
            console.warn('[ModularStateSync] Load failed:', payload?.error || 'Unknown error');
            return false;
        }

        const incomingState = payload?.state;
        if (!incomingState || typeof incomingState !== 'object') return false;

        const localHash = captureStateHash();
        const incomingHash = hashString(JSON.stringify(incomingState));
        if (!force && localHash && incomingHash === localHash) {
            remoteSignature = payload?.status?.signature || knownSignature || remoteSignature;
            lastUploadedHash = incomingHash;
            lastSyncedLocalHash = incomingHash;
            return false;
        }

        applyingRemoteState = true;
        try {
            const applied = !!store.applyState(incomingState);
            if (!applied) return false;
            remoteSignature = payload?.status?.signature || knownSignature || remoteSignature;
            lastUploadedHash = incomingHash;
            lastSyncedLocalHash = incomingHash;
            return true;
        } finally {
            applyingRemoteState = false;
        }
    }

    async function syncCycle() {
        if (syncInFlight || applyingRemoteState) return;
        syncInFlight = true;
        try {
            const status = await getRemoteStatus();
            const localHash = captureStateHash();
            const localDirty = isLocalDirty(localHash);
            if (status?.signature && remoteSignature && status.signature !== remoteSignature) {
                if (localDirty && getConflictStrategy() === CONFLICT_LOCAL_WINS) {
                    await pushLocalState(true, localHash);
                } else {
                    await pullRemoteState(true, status.signature);
                }
                return;
            }
            if (status?.signature && !remoteSignature) {
                remoteSignature = status.signature;
            }
            await pushLocalState(false, localHash);
        } catch (error) {
            console.warn('[ModularStateSync] Sync cycle failed:', error);
        } finally {
            syncInFlight = false;
        }
    }

    function stopPolling() {
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
        if (mutationTimer) {
            clearTimeout(mutationTimer);
            mutationTimer = null;
        }
    }

    function startPolling() {
        stopPolling();
        if (!isHttpContext() || !isEnabled()) return;
        syncTimer = setInterval(syncCycle, getIntervalMs());
    }

    async function bootstrap() {
        if (!isHttpContext() || !isEnabled()) return;

        const status = await getRemoteStatus();
        if (!status) return;

        if ((status.fileCount || 0) > 0 && status.signature) {
            await pullRemoteState(true, status.signature);
        } else {
            await pushLocalState(true);
        }

        remoteSignature = status.signature || remoteSignature;
        const hash = captureStateHash();
        if (hash) {
            lastSyncedLocalHash = hash;
            if (!lastUploadedHash) lastUploadedHash = hash;
        }
    }

    function onStateMutation() {
        if (!isEnabled() || applyingRemoteState) return;
        if (mutationTimer) clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => {
            mutationTimer = null;
            syncCycle();
        }, MUTATION_DEBOUNCE_MS);
    }

    function bindMutationListeners() {
        window.addEventListener('eve:state-mutated', onStateMutation);
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        ensureConfigDefaults();

        if (!isHttpContext()) {
            console.log('[ModularStateSync] Disabled (file:// context).');
            return;
        }

        bindMutationListeners();
        await bootstrap();
        await syncCycle();
        startPolling();
        console.log('[ModularStateSync] Initialized.');
    }

    function setEnabled(enabled) {
        const cfg = getConfig();
        cfg.modularStateSyncEnabled = !!enabled;
        if (typeof saveConfig === 'function') saveConfig();
        if (cfg.modularStateSyncEnabled) {
            startPolling();
            syncCycle();
        } else {
            stopPolling();
        }
    }

    function setConflictStrategy(strategy) {
        const cfg = getConfig();
        cfg.modularStateConflictStrategy = String(strategy || '').trim().toLowerCase() === CONFLICT_LOCAL_WINS
            ? CONFLICT_LOCAL_WINS
            : CONFLICT_REMOTE_WINS;
        if (typeof saveConfig === 'function') saveConfig();
    }

    function setIntervalMs(ms) {
        const cfg = getConfig();
        const n = Number(ms);
        cfg.modularStateSyncIntervalMs = Number.isFinite(n)
            ? Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(n)))
            : DEFAULT_INTERVAL_MS;
        if (typeof saveConfig === 'function') saveConfig();
        startPolling();
    }

    async function syncNow(force = true) {
        return pushLocalState(!!force);
    }

    async function pullNow(force = true) {
        const status = await getRemoteStatus();
        return pullRemoteState(!!force, status?.signature || '');
    }

    async function fetchGeminiContext(mode = 'summary', limit = 25) {
        const safeMode = String(mode || 'summary').toLowerCase() === 'full' ? 'full' : 'summary';
        const safeLimit = Math.max(5, Math.min(200, Number(limit) || 25));
        const query = `/api/eve-state/modular/gemini-context?mode=${encodeURIComponent(safeMode)}&limit=${encodeURIComponent(safeLimit)}`;
        const { ok, payload } = await requestJson(query);
        if (!ok || !payload?.ok) {
            return { ok: false, error: payload?.error || 'Failed to build Gemini context.' };
        }
        return {
            ok: true,
            mode: payload.mode || safeMode,
            contextText: payload.contextText || '',
            payload: payload.payload || null
        };
    }

    async function sendContextToGemini(mode = 'summary', limit = 25) {
        const context = await fetchGeminiContext(mode, limit);
        if (!context.ok) return context;

        const message = context.contextText || '';
        if (!message) return { ok: false, error: 'Empty Gemini context payload.' };

        if (typeof window.sendTextMessage === 'function') {
            window.sendTextMessage(message, true);
            if (typeof window.displayMessage === 'function') {
                window.displayMessage(`System Message: Sent modular state context (${context.mode}) to Gemini`, true);
            }
            return { ok: true, sent: true, mode: context.mode };
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(message);
            return {
                ok: true,
                sent: false,
                copied: true,
                mode: context.mode
            };
        }

        return {
            ok: false,
            error: 'sendTextMessage unavailable and clipboard access denied.'
        };
    }

    window.EveDataStore.ModularSync = {
        init,
        syncNow,
        pullNow,
        fetchGeminiContext,
        sendContextToGemini,
        setEnabled,
        setIntervalMs,
        setConflictStrategy,
        isEnabled,
        getIntervalMs,
        getConflictStrategy
    };

    if (document.readyState === 'loading') {
        window.addEventListener('load', init);
    } else {
        setTimeout(init, 0);
    }
})();
