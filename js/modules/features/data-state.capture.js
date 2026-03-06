/**
 * Unified State Store Capture Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.captureReady) return;

    const modules = window.EveDataStore.CaptureModules || {};
    const cloneHelpers = typeof modules.createCaptureCloneHelpers === 'function'
        ? modules.createCaptureCloneHelpers()
        : {};
    const scopedHelpers = typeof modules.createCaptureScopedHelpers === 'function'
        ? modules.createCaptureScopedHelpers(cloneHelpers)
        : {};

    Object.assign(ns, cloneHelpers, scopedHelpers);
    ns.captureReady = true;
})();
