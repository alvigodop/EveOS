window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanels) return;

    window.EveLibrary.UIModules.createPanels = function createPanels(deps) {
        const modules = window.EveLibrary.UIModules || {};
        const workflowHelpers = typeof modules.createPanelWorkflowHelpers === 'function'
            ? modules.createPanelWorkflowHelpers(deps)
            : {};
        const backupHelpers = typeof modules.createPanelBackupHelpers === 'function'
            ? modules.createPanelBackupHelpers(deps)
            : {};

        return Object.assign({}, workflowHelpers, backupHelpers);
    };
})();
