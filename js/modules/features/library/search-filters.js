/**
 * Search Filters Module for Eve OS
 * Handles filtering and sorting library entries
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.SearchModules = window.EveLibrary.SearchModules || {};

(function () {
    const modules = window.EveLibrary.SearchModules || {};
    const helpers = modules.helpers || null;
    const pipeline = modules.pipeline || null;

    if (!helpers || !pipeline) {
        console.warn('[EveLibrary.Search] Helper modules missing.');
        return;
    }

    window.EveLibrary.Search = Object.assign({}, helpers, pipeline);
})();
