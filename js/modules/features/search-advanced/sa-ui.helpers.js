window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    window.EveOS.SearchAdvanced.Modules.createUiHelpers = function createUiHelpers(deps) {
        const modules = window.EveOS.SearchAdvanced.Modules || {};
        const formHelpers = typeof modules.createUiFormHelpers === 'function'
            ? modules.createUiFormHelpers(deps)
            : {};
        const resultHelpers = typeof modules.createUiResultHelpers === 'function'
            ? modules.createUiResultHelpers(formHelpers)
            : {};

        return Object.assign({}, formHelpers, resultHelpers);
    };
})();
