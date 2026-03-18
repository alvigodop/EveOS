// --- Modular State Sync Engine: Sync Core ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.engineSyncReady) return;
    if (!ns.sharedReady) {
        console.warn('[ModularStateSync] Shared helpers missing; engine sync not initialized.');
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

    Object.assign(ns, {
        pushLocalState,
        pullRemoteState,
        syncCycle,
        bootstrap
    });

    ns.engineSyncReady = true;
})();
