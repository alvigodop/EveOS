// Unidex View Stage Renderer Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createStages = function createStages(deps) {
        const state = deps?.state || {};
        const getWorkspaceById = deps?.getWorkspaceById;
        const resetLibraryReadyWait = deps?.resetLibraryReadyWait;
        const getCardsUnifiedMode = deps?.getCardsUnifiedMode;
        const getTabsUnifiedMode = deps?.getTabsUnifiedMode;
        const stageRenderers = window.UnidexViewModules.createStageRenderers
            ? window.UnidexViewModules.createStageRenderers(deps)
            : null;

        if (!stageRenderers) {
            console.warn('[UnidexView] Stage renderers module is missing.');
            return {
                render: function () {},
                renderTabsStage: function () {},
                renderCardsStage: function () {},
                renderEntriesStage: function () {},
                resetSelection: function () {}
            };
        }

        function renderTabsStage(gridContainer, searchStr) {
            stageRenderers.renderTabsStage(gridContainer, searchStr);
        }

        function renderCardsStage(gridContainer, searchStr) {
            stageRenderers.renderCardsStage(gridContainer, searchStr, {
                resetSelection,
                renderTabsStage
            });
        }

        function renderEntriesStage(gridContainer, searchStr) {
            stageRenderers.renderEntriesStage(gridContainer, searchStr, {
                render
            });
        }

        function ensureValidState() {
            if (state.stage === 'tabs') return;

            const workspace = getWorkspaceById(state.selectedWorkspaceId);
            if (!workspace) {
                resetSelection();
                return;
            }

            if (state.stage === 'entries' && !state.selectedCategory) {
                state.stage = 'cards';
            }
        }

        function render(gridContainer, options) {
            if (!gridContainer) return;

            const searchStr = options && options.searchStr ? String(options.searchStr) : '';
            ensureValidState();
            const keepLibraryWarm = state.stage === 'entries'
                || (state.stage === 'cards' && getCardsUnifiedMode())
                || (state.stage === 'tabs' && getTabsUnifiedMode());
            if (!keepLibraryWarm) resetLibraryReadyWait();

            if (state.stage === 'tabs') {
                renderTabsStage(gridContainer, searchStr);
                deps.scheduleLayoutMaintenance(gridContainer);
                return;
            }

            if (state.stage === 'cards') {
                renderCardsStage(gridContainer, searchStr);
                deps.scheduleLayoutMaintenance(gridContainer);
                return;
            }

            renderEntriesStage(gridContainer, searchStr);
            deps.scheduleLayoutMaintenance(gridContainer);
        }

        function resetSelection() {
            deps.clearLayoutMaintenanceTimers();
            resetLibraryReadyWait();
            state.stage = 'tabs';
            state.selectedWorkspaceId = '';
            state.selectedCategory = '';
        }

        return {
            render,
            renderTabsStage,
            renderCardsStage,
            renderEntriesStage,
            resetSelection
        };
    };
})();
