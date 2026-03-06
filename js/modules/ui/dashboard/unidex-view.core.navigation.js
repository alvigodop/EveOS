// --- Unidex View Core Navigation Helpers ---
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createCoreNavigation) return;

    window.UnidexViewModules.createCoreNavigation = function createCoreNavigation(deps) {
        const state = deps.state;
        const helpers = deps.helpers;
        const stages = deps.stages;
        const getActiveWorkspaceId = typeof deps?.getActiveWorkspaceId === 'function'
            ? deps.getActiveWorkspaceId
            : function () {
                return typeof config !== 'undefined' ? String(config?.activeWorkspace || '') : '';
            };
        const switchWorkspaceById = typeof deps?.switchWorkspaceById === 'function'
            ? deps.switchWorkspaceById
            : function (workspaceId) {
                if (typeof switchWorkspace === 'function') {
                    switchWorkspace(workspaceId);
                }
            };
        const requestRender = typeof deps?.requestRender === 'function'
            ? deps.requestRender
            : function () {
                if (typeof renderDashboard === 'function') renderDashboard();
            };

        function switchWorkspaceTab(workspaceIdParam) {
            const workspaceId = helpers.decodeParam(workspaceIdParam);
            if (!workspaceId) return;
            state.selectedWorkspaceId = workspaceId;
            state.selectedCategory = '';
            state.stage = 'cards';
            if (String(getActiveWorkspaceId() || '') !== String(workspaceId)) {
                switchWorkspaceById(workspaceId);
                return;
            }
            requestRender();
        }

        function selectCategory(categoryParam) {
            const category = helpers.decodeParam(categoryParam);
            if (!category) return;
            state.selectedCategory = category;
            state.stage = 'entries';
            requestRender();
        }

        function backToTabs() {
            stages.resetSelection();
            requestRender();
        }

        function backToCards() {
            if (!state.selectedWorkspaceId) {
                backToTabs();
                return;
            }
            helpers.resetLibraryReadyWait();
            state.stage = 'cards';
            state.selectedCategory = '';
            requestRender();
        }

        return { switchWorkspaceTab, selectCategory, backToTabs, backToCards };
    };
})();
