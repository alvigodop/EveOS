// Unidex View Controls Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createControls = function createControls(deps) {
        const modules = window.UnidexViewModules || {};
        const state = typeof modules.createControlsState === 'function'
            ? modules.createControlsState(deps)
            : {};
        const view = typeof modules.createControlsView === 'function'
            ? modules.createControlsView(state)
            : {};

        return Object.assign({}, state, view);
    };
})();
