/**
 * Unified State Store Capture Scoped Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    const modules = window.EveDataStore.CaptureModules || {};

    window.EveDataStore.CaptureModules.createCaptureScopedHelpers = function createCaptureScopedHelpers(base) {
        const createBaseHelpers = modules.createCaptureScopedBaseHelpers;
        const createPinHelpers = modules.createCaptureScopedPinHelpers;
        const createCaptureHelpers = modules.createCaptureScopedCaptureHelpers;

        if (typeof createBaseHelpers !== 'function' || typeof createPinHelpers !== 'function' || typeof createCaptureHelpers !== 'function') {
            console.warn('[EveDataStore] Capture scoped helper modules missing; scoped capture facade not initialized.');
            return {};
        }

        const sharedHelpers = createBaseHelpers(base);
        const pinHelpers = createPinHelpers(base, sharedHelpers);
        const captureHelpers = createCaptureHelpers(base, sharedHelpers, pinHelpers);
        return Object.assign({}, sharedHelpers, pinHelpers, captureHelpers);
    };
})();
