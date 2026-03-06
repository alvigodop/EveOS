// Unidex View Builders Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createBuilders = function createBuilders(deps) {
        const modules = window.UnidexViewModules || {};
        const panelBuilders = typeof modules.createPanelBuilders === 'function'
            ? modules.createPanelBuilders(deps)
            : {};
        const entryBuilders = typeof modules.createEntryBuilders === 'function'
            ? modules.createEntryBuilders(deps)
            : {};

        return Object.assign({}, panelBuilders, entryBuilders);
    };
})();
