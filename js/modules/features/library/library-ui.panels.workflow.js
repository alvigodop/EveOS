window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanelWorkflowHelpers) return;

    window.EveLibrary.UIModules.createPanelWorkflowHelpers = function createPanelWorkflowHelpers(deps) {
        const panelHelpers = window.EveLibrary.UIModules.createPanelWorkflowPanelHelpers
            ? window.EveLibrary.UIModules.createPanelWorkflowPanelHelpers(deps)
            : null;
        const actionHelpers = window.EveLibrary.UIModules.createPanelWorkflowActionHelpers
            ? window.EveLibrary.UIModules.createPanelWorkflowActionHelpers({
                ...deps,
                refreshLibrary: panelHelpers?.refreshLibrary,
                initLibraryPanel: panelHelpers?.initLibraryPanel
            })
            : null;

        if (!panelHelpers || !actionHelpers) {
            console.warn('[LibraryUI] Panel workflow helpers missing.');
            return {};
        }

        return {
            ...panelHelpers,
            ...actionHelpers
        };
    };
})();
