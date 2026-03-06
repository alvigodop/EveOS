/**
 * Entry Manager Module for Eve OS
 * Handles CRUD operations for library entries
 * Adapted from MegaBase entry-manager.js
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.EntryManagerModules = window.EveLibrary.EntryManagerModules || {};

(function () {
    const deps = {
        State: window.EveLibrary.State,
        Storage: window.EveLibrary.Storage,
        Ratings: window.EveLibrary.Ratings
    };
    const modules = window.EveLibrary.EntryManagerModules || {};
    const formHelpers = typeof modules.createFormHelpers === 'function'
        ? modules.createFormHelpers(deps)
        : {};
    const crudHelpers = typeof modules.createCrudHelpers === 'function'
        ? modules.createCrudHelpers(deps, formHelpers)
        : {};

    window.EveLibrary.EntryManager = Object.assign({}, crudHelpers, {
        getFormData: formHelpers.getFormData
    });
})();
