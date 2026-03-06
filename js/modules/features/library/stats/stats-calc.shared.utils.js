/**
 * Statistics Calculator Shared - Low-level Utilities
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsCalcSharedModules = window.EveLibrary.StatsCalcSharedModules || {};

(function () {
    const modules = window.EveLibrary.StatsCalcSharedModules || {};
    const core = typeof modules.createCore === 'function'
        ? modules.createCore()
        : {};
    const origin = typeof modules.createOrigin === 'function'
        ? modules.createOrigin(core)
        : {};

    window.EveLibrary.StatsCalcSharedUtils = Object.assign({}, core, origin);
})();
