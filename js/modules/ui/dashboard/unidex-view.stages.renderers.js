// Unidex View Stage Renderers Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createStageRenderers = function createStageRenderers(deps) {
        const modules = window.UnidexViewModules || {};
        const panelRenderers = typeof modules.createStagePanelRenderers === 'function'
            ? modules.createStagePanelRenderers(deps)
            : {};
        const entryRenderers = typeof modules.createStageEntryRenderers === 'function'
            ? modules.createStageEntryRenderers(deps)
            : {};

        return Object.assign({}, panelRenderers, entryRenderers);
    };
})();
