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
            // Switch the active workspace if needed, but stay in Unidex view
            if (String(getActiveWorkspaceId() || '') !== String(workspaceId)) {
                if (typeof config !== 'undefined') {
                    config.activeWorkspace = workspaceId;
                }
            }
            if (typeof stages.persistSelection === 'function') {
                stages.persistSelection(true);
            } else if (typeof saveConfig === 'function') {
                saveConfig({ immediate: true, source: 'unidex-view-state' });
            }
            requestRender();
        }

        function selectCategory(categoryParam) {
            const category = helpers.decodeParam(categoryParam);
            if (!category) return;
            state.selectedCategory = category;
            state.stage = 'entries';
            if (typeof stages.persistSelection === 'function') stages.persistSelection(true);
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
            if (typeof stages.persistSelection === 'function') stages.persistSelection(true);
            requestRender();
        }

        return { switchWorkspaceTab, selectCategory, backToTabs, backToCards };
    };
})();
