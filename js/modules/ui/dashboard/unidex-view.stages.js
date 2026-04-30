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
        const VALID_STAGES = new Set(['tabs', 'cards', 'entries']);

        if (!stageRenderers) {
            console.warn('[UnidexView] Stage renderers module is missing.');
            return {
                render: function () {},
                renderTabsStage: function () {},
                renderCardsStage: function () {},
                renderEntriesStage: function () {},
                resetSelection: function () {},
                persistSelection: function () {}
            };
        }

        function getConfigState() {
            return typeof config !== 'undefined' && config && typeof config === 'object'
                ? config
                : {};
        }

        function normalizeStage(stage) {
            const normalized = String(stage || '').trim().toLowerCase();
            return VALID_STAGES.has(normalized) ? normalized : 'tabs';
        }

        function persistSelection(immediate) {
            const currentConfig = getConfigState();
            if (!currentConfig || typeof currentConfig !== 'object') return;
            currentConfig.unidexStage = normalizeStage(state.stage);
            currentConfig.unidexStagePersisted = true;
            currentConfig.unidexSelectedWorkspaceId = state.selectedWorkspaceId
                ? String(state.selectedWorkspaceId)
                : '';
            currentConfig.unidexSelectedCategory = state.selectedCategory
                ? String(state.selectedCategory)
                : '';
            if (typeof saveConfig === 'function') {
                saveConfig({
                    immediate: !!immediate,
                    source: 'unidex-view-state',
                    meta: {
                        stage: currentConfig.unidexStage,
                        workspaceId: currentConfig.unidexSelectedWorkspaceId,
                        categoryName: currentConfig.unidexSelectedCategory
                    }
                });
            }
        }

        function restoreSelectionFromConfig() {
            if (state.selectionRestoredFromConfig) return;
            state.selectionRestoredFromConfig = true;

            const currentConfig = getConfigState();
            if (!currentConfig || currentConfig.viewMode !== 'unidex') return;

            const hasSavedStage = currentConfig.unidexStagePersisted === true;
            const rawStage = hasSavedStage ? String(currentConfig.unidexStage || '').trim() : '';
            const savedStage = normalizeStage(rawStage);
            const selectedWorkspaceId = String(
                currentConfig.unidexSelectedWorkspaceId
                || currentConfig.activeWorkspace
                || ''
            ).trim();
            const selectedCategory = String(currentConfig.unidexSelectedCategory || '').trim();
            const workspace = selectedWorkspaceId ? getWorkspaceById(selectedWorkspaceId) : null;
            const shouldRestoreCardsStage = savedStage === 'cards'
                || (!hasSavedStage && !!currentConfig.unidexCardsUnified && !currentConfig.unidexTabsUnified);

            if (savedStage === 'entries' && workspace && selectedCategory) {
                state.stage = 'entries';
                state.selectedWorkspaceId = selectedWorkspaceId;
                state.selectedCategory = selectedCategory;
                return;
            }

            if (shouldRestoreCardsStage && workspace) {
                state.stage = 'cards';
                state.selectedWorkspaceId = selectedWorkspaceId;
                state.selectedCategory = '';
                return;
            }

            state.stage = 'tabs';
            state.selectedWorkspaceId = '';
            state.selectedCategory = '';
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
            restoreSelectionFromConfig();
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
            state.selectionRestoredFromConfig = true;
            state.stage = 'tabs';
            state.selectedWorkspaceId = '';
            state.selectedCategory = '';
            persistSelection(true);
        }

        return {
            render,
            renderTabsStage,
            renderCardsStage,
            renderEntriesStage,
            resetSelection,
            persistSelection
        };
    };
})();
