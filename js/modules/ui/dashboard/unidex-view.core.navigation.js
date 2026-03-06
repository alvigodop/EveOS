// --- Unidex View Core Navigation Helpers ---
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createCoreNavigation) return;

    window.UnidexViewModules.createCoreNavigation = function createCoreNavigation(deps) {
        const state = deps.state;
        const helpers = deps.helpers;
        const stages = deps.stages;

        function switchWorkspaceTab(workspaceIdParam) {
            const workspaceId = helpers.decodeParam(workspaceIdParam);
            if (!workspaceId) return;
            state.selectedWorkspaceId = workspaceId;
            state.selectedCategory = '';
            state.stage = 'cards';
            if (String(config.activeWorkspace) !== String(workspaceId) && typeof switchWorkspace === 'function') {
                switchWorkspace(workspaceId);
                return;
            }
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function selectCategory(categoryParam) {
            const category = helpers.decodeParam(categoryParam);
            if (!category) return;
            state.selectedCategory = category;
            state.stage = 'entries';
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function backToTabs() {
            stages.resetSelection();
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function backToCards() {
            if (!state.selectedWorkspaceId) {
                backToTabs();
                return;
            }
            helpers.resetLibraryReadyWait();
            state.stage = 'cards';
            state.selectedCategory = '';
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        return { switchWorkspaceTab, selectCategory, backToTabs, backToCards };
    };
})();
