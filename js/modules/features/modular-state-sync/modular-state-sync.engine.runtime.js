// --- Modular State Sync Engine: Runtime Controls ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.engineRuntimeReady) return;
    if (!ns.sharedReady || !ns.engineSyncReady) {
        console.warn('[ModularStateSync] Shared helpers or engine sync missing; engine runtime not initialized.');
        return;
    }

    const { constants, state } = ns;

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
        state.syncTimer = setInterval(ns.syncCycle, ns.getIntervalMs());
    }

    function onStateMutation() {
        if (!ns.isEnabled() || state.applyingRemoteState) return;
        if (state.mutationTimer) clearTimeout(state.mutationTimer);
        state.mutationTimer = setTimeout(() => {
            state.mutationTimer = null;
            ns.syncCycle();
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
        await ns.bootstrap();
        await ns.syncCycle();
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
            ns.syncCycle();
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
        stopPolling,
        startPolling,
        onStateMutation,
        bindMutationListeners,
        init,
        setEnabled,
        setConflictStrategy,
        setIntervalMs
    });

    ns.engineRuntimeReady = true;
})();
