/**
 * Unified State Store Capture Scoped Base Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    const modules = window.EveDataStore.CaptureModules || {};

    window.EveDataStore.CaptureModules.createCaptureScopedBaseHelpers = function createCaptureScopedBaseHelpers(base) {
        const createFilterHelpers = modules.createCaptureScopedFilterHelpers;
        const createStructureHelpers = modules.createCaptureScopedStructureHelpers;
        if (typeof createFilterHelpers !== 'function' || typeof createStructureHelpers !== 'function') {
            console.warn('[EveDataStore] Capture scoped base helper modules missing; base helper facade not initialized.');
            return {};
        }

        const filterHelpers = createFilterHelpers(base);
        const structureHelpers = createStructureHelpers(base, filterHelpers);
        return Object.assign({}, filterHelpers, structureHelpers);
    };
})();
