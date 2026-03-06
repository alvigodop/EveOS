// --- Data Transfer Export Utils ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportUtilsReady) return;
    if (!ns.sharedReady) {
        console.warn('[DataTransfer] Shared helpers missing; export utils not initialized.');
        return;
    }

    const getAppConfig = ns.getAppConfig;
    const getAppLinks = ns.getAppLinks;
    const modules = window.EveDataTransfer.ExportModules || {};
    const namingHelpers = typeof modules.createNamingHelpers === 'function'
        ? modules.createNamingHelpers()
        : {};
    const libraryHelpers = typeof modules.createLibraryHelpers === 'function'
        ? modules.createLibraryHelpers({ getAppConfig, getAppLinks })
        : {};

    Object.assign(ns, namingHelpers, libraryHelpers);
    ns.exportUtilsReady = true;
})();
