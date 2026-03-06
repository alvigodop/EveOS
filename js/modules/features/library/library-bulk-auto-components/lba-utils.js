window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.BulkAutoModules = window.EveLibrary.BulkAutoModules || {};

(function () {
    const modules = window.EveLibrary.BulkAutoModules || {};
    const textUtils = typeof modules.createTextUtils === 'function'
        ? modules.createTextUtils()
        : {};
    const sourceUtils = typeof modules.createSourceUtils === 'function'
        ? modules.createSourceUtils(textUtils)
        : {};

    window.EveLibrary.BulkAutoUtils = Object.assign({}, textUtils, sourceUtils);
})();
