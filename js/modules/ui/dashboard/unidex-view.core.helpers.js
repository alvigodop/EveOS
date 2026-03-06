window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createCoreHelpers) return;

    window.UnidexViewModules.createCoreHelpers = function createCoreHelpers(deps) {
        const modules = window.UnidexViewModules || {};
        const stateHelpers = typeof modules.createCoreHelperState === 'function'
            ? modules.createCoreHelperState(deps)
            : {};
        const formatHelpers = typeof modules.createCoreHelperFormat === 'function'
            ? modules.createCoreHelperFormat(deps)
            : {};

        return Object.assign({}, stateHelpers, formatHelpers);
    };
})();
