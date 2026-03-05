// --- Modular State Sync Engine ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.engineReady) return;
    if (!ns.sharedReady) {
        console.warn('[ModularStateSync] Shared helpers missing; engine not initialized.');
        return;
    }

    const { constants, state } = ns;

    async function pushLocalState(force = false, knownHash = '', options = {}) {
        const ignoreEnabled = !!options?.ignoreEnabled;
        if (!ns.isHttpContext() || (!ignoreEnabled && !ns.isEnabled())) return false;

        const store = ns.getStore();
        if (!store?.captureState) return false;

        const currentState = store.captureState();
        const stateJson = JSON.stringify(currentState);
        const stateHash = knownHash || ns.hashState(currentState);
        if (!force && (stateHash === state.lastUploadedHash || stateHash === state.lastSyncedLocalHash)) return false;

        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/save', {
            method: 'POST',
            body: stateJson
        });
        if (!ok || !payload?.ok) {
            console.warn('[ModularStateSync] Save failed:', payload?.error || 'Unknown error');
            return false;
        }

        state.lastUploadedHash = stateHash;
        state.lastSyncedLocalHash = stateHash;
        state.remoteSignature = payload?.status?.signature || state.remoteSignature;
        return true;
    }

    async function pullRemoteState(force = false, knownSignature = '', options = {}) {
        const ignoreEnabled = !!options?.ignoreEnabled;
        if (!ns.isHttpContext() || (!ignoreEnabled && !ns.isEnabled())) return false;

        const store = ns.getStore();
        if (!store?.applyState) return false;

        if (!force && knownSignature && state.remoteSignature && knownSignature === state.remoteSignature) {
            return false;
        }

        const { ok, payload } = await ns.requestJson('/api/eve-state/modular/load');
        if (!ok || !payload?.ok) {
            console.warn('[ModularStateSync] Load failed:', payload?.error || 'Unknown error');
            return false;
        }

        const incomingState = payload?.state;
        if (!incomingState || typeof incomingState !== 'object') return false;

        const localHash = ns.captureStateHash();
        const incomingHash = ns.hashState(incomingState);
        if (!force && localHash && incomingHash === localHash) {
            state.remoteSignature = payload?.status?.signature || knownSignature || state.remoteSignature;
            state.lastUploadedHash = localHash;
            state.lastSyncedLocalHash = localHash;
            return false;
        }

        state.applyingRemoteState = true;
        try {
            const applied = !!store.applyState(incomingState);
            if (!applied) return false;

            const appliedHash = ns.captureStateHash() || incomingHash;
            ns.refreshUiAfterRemoteApply();
            state.remoteSignature = payload?.status?.signature || knownSignature || state.remoteSignature;
            state.lastUploadedHash = appliedHash;
            state.lastSyncedLocalHash = appliedHash;
            return true;
        } finally {
            state.applyingRemoteState = false;
        }
    }

    async function syncCycle() {
        if (state.syncInFlight || state.applyingRemoteState) return;
        state.syncInFlight = true;
        try {
            const localHash = ns.captureStateHash();
            const localDirty = ns.isLocalDirty(localHash);
            const hasBaseline = !!(state.lastUploadedHash || state.lastSyncedLocalHash);
            const shouldCheckRemote = localDirty || !state.remoteSignature || ns.shouldRunIdleRemoteCheck();
            let remoteStatus = null;

            if (shouldCheckRemote) {
                state.lastRemoteCheckAt = Date.now();
                remoteStatus = await ns.getRemoteStatus();
                if (!hasBaseline && remoteStatus?.signature) {
                    await pullRemoteState(true, remoteStatus.signature);
                    return;
                }

                if (remoteStatus?.signature && state.remoteSignature && remoteStatus.signature !== state.remoteSignature) {
                    if (localDirty && ns.getConflictStrategy() === constants.CONFLICT_LOCAL_WINS) {
                        await pushLocalState(true, localHash);
                    } else {
                        await pullRemoteState(true, remoteStatus.signature);
                    }
                    return;
                }

                if (remoteStatus?.signature && !state.remoteSignature) {
                    state.remoteSignature = remoteStatus.signature;
                }
            }

            if (!hasBaseline && (!remoteStatus || !remoteStatus.signature) && localHash) {
                await pushLocalState(true, localHash);
                return;
            }

            if (localDirty) {
                await pushLocalState(false, localHash);
            }
        } catch (error) {
            console.warn('[ModularStateSync] Sync cycle failed:', error);
        } finally {
            state.syncInFlight = false;
        }
    }

    function stopPolling() {
        if (state.syncTimer) {
            clearInterval(state.syncTimer);
            state.syncTimer = null;
        }
        if (state.mutationTimer) {
            clearTimeout(state.mutationTimer);
            state.mutationTimer = null;
        }
    }

    function startPolling() {
        stopPolling();
        if (!ns.isHttpContext() || !ns.isEnabled()) return;
        state.syncTimer = setInterval(syncCycle, ns.getIntervalMs());
    }

    async function bootstrap() {
        if (!ns.isHttpContext() || !ns.isEnabled()) return;

        const remoteStatus = await ns.getRemoteStatus();
        if (!remoteStatus) return;
        state.lastRemoteCheckAt = Date.now();

        if ((remoteStatus.fileCount || 0) > 0 && remoteStatus.signature) {
            await pullRemoteState(true, remoteStatus.signature);
        } else {
            await pushLocalState(true);
        }

        state.remoteSignature = remoteStatus.signature || state.remoteSignature;
        const currentHash = ns.captureStateHash();
        if (currentHash) {
            state.lastSyncedLocalHash = currentHash;
            if (!state.lastUploadedHash) state.lastUploadedHash = currentHash;
        }
    }

    function onStateMutation() {
        if (!ns.isEnabled() || state.applyingRemoteState) return;
        if (state.mutationTimer) clearTimeout(state.mutationTimer);
        state.mutationTimer = setTimeout(() => {
            state.mutationTimer = null;
            syncCycle();
        }, constants.MUTATION_DEBOUNCE_MS);
    }

    function bindMutationListeners() {
        window.addEventListener('eve:state-mutated', onStateMutation);
    }

    async function init() {
        if (state.initialized) return;
        state.initialized = true;
        ns.ensureConfigDefaults();

        if (!ns.isHttpContext()) {
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
        const cfg = ns.getConfig();
        cfg.modularStateSyncEnabled = !!enabled;
        if (typeof saveConfig === 'function') saveConfig();

        if (!ns.isHttpContext()) {
            stopPolling();
            return false;
        }

        if (cfg.modularStateSyncEnabled) {
            startPolling();
            syncCycle();
        } else {
            stopPolling();
        }
        return true;
    }

    function setConflictStrategy(strategy) {
        const cfg = ns.getConfig();
        cfg.modularStateConflictStrategy = String(strategy || '').trim().toLowerCase() === constants.CONFLICT_LOCAL_WINS
            ? constants.CONFLICT_LOCAL_WINS
            : constants.CONFLICT_REMOTE_WINS;
        if (typeof saveConfig === 'function') saveConfig();
    }

    function setIntervalMs(ms) {
        const cfg = ns.getConfig();
        const value = Number(ms);
        cfg.modularStateSyncIntervalMs = Number.isFinite(value)
            ? Math.max(constants.MIN_INTERVAL_MS, Math.min(constants.MAX_INTERVAL_MS, Math.round(value)))
            : constants.DEFAULT_INTERVAL_MS;
        if (typeof saveConfig === 'function') saveConfig();
        if (ns.isHttpContext()) startPolling();
    }

    Object.assign(ns, {
        pushLocalState,
        pullRemoteState,
        syncCycle,
        stopPolling,
        startPolling,
        bootstrap,
        onStateMutation,
        bindMutationListeners,
        init,
        setEnabled,
        setConflictStrategy,
        setIntervalMs
    });

    ns.engineReady = true;
})();
