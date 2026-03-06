window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.RatingsEngineFoundationModules = window.EveLibrary.RatingsEngineFoundationModules || {};

(function () {
    const modules = window.EveLibrary.RatingsEngineFoundationModules || {};
    const base = typeof modules.createBase === 'function'
        ? modules.createBase()
        : {};
    const sources = typeof modules.createSources === 'function'
        ? modules.createSources(base)
        : {};

    window.EveLibrary.RatingsEngineFoundation = Object.assign({}, base, sources);
})();
