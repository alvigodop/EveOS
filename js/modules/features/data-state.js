/**
 * Unified State Store Facade
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (!ns.captureReady || !ns.applyReady) {
        console.warn('[EveDataStore] Capture/apply helpers missing; store facade not initialized.');
        return;
    }

    window.EveDataStore.Store = {
        captureState: ns.captureState,
        captureWorkspace: ns.captureWorkspace,
        captureCard: ns.captureCard,
        captureBookmark: ns.captureBookmark,
        applyState: ns.applyState,
        applyWorkspaceState: ns.applyWorkspaceState,
        applyCardState: ns.applyCardState,
        applyBookmarkState: ns.applyBookmarkState
    };
})();
