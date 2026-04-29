// Unidex View Stage Entry Renderers Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createStageEntryRenderers = function createStageEntryRenderers(deps) {
        const state = deps?.state || {};
        const getWorkspaceById = deps?.getWorkspaceById;
        const getWorkspaceLinks = deps?.getWorkspaceLinks;
        const isTaskModeCategory = deps?.isTaskModeCategory;
        const escapeHtml = deps?.escapeHtml;
        const ensureLibraryReadyForEntries = deps?.ensureLibraryReadyForEntries;
        const shouldShowLibraryLoadingHint = deps?.shouldShowLibraryLoadingHint;
        const scheduleEntriesRetry = deps?.scheduleEntriesRetry;
        const stabilizeEntriesLayout = deps?.stabilizeEntriesLayout;
        const buildEntriesHtml = deps?.buildEntriesHtml;
        const getEntriesLayoutMode = deps?.getEntriesLayoutMode;
        const getEntriesDensityMode = deps?.getEntriesDensityMode || (() => 'comfortable');
        const getEntriesFilterMode = deps?.getEntriesFilterMode;
        const getEntriesGroupMode = deps?.getEntriesGroupMode || (() => 'flat');
        const applyEntriesViewTransforms = deps?.applyEntriesViewTransforms;
        const buildEntriesControlsHtml = deps?.buildEntriesControlsHtml;

        function buildEntriesClassName(layoutMode) {
            return 'unidex-entries '
                + (layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout')
                + ' is-density-' + getEntriesDensityMode();
        }

        function renderEntriesStage(gridContainer, searchStr, callbacks) {
            const workspace = getWorkspaceById(state.selectedWorkspaceId);
            if (!workspace || !state.selectedCategory) {
                state.stage = workspace ? 'cards' : 'tabs';
                if (callbacks?.render) {
                    callbacks.render(gridContainer, { searchStr });
                }
                return;
            }

            const workspaceLinks = getWorkspaceLinks(workspace.id, searchStr);
            const entries = workspaceLinks.filter(function (link) {
                return (link.category || 'Unsorted') === state.selectedCategory;
            });
            const taskMode = isTaskModeCategory(workspace.id, state.selectedCategory);
            const layoutMode = getEntriesLayoutMode();
            const libraryReady = ensureLibraryReadyForEntries();

            if (!libraryReady) {
                if (!shouldShowLibraryLoadingHint()) {
                    scheduleEntriesRetry();
                    return;
                }

                gridContainer.innerHTML = `
                <section class="unidex-shell" aria-label="Unidex Entries View">
                    <header class="unidex-panel-header">
                        <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToCards()">Back To Cards</button>
                        <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(state.selectedCategory || '').toUpperCase())}"><span>${escapeHtml(state.selectedCategory)} Entries</span></h3>
                        <div class="unidex-panel-controls">
                            ${buildEntriesControlsHtml()}
                        </div>
                    </header>
                    <section class="${buildEntriesClassName(layoutMode)}" aria-label="Bookmark and Library Entries">
                        <div class="unidex-empty-state">
                            <h3>Preparing Entries</h3>
                            <p>Loading library links...</p>
                        </div>
                    </section>
                </section>
            `;

                scheduleEntriesRetry();
                return;
            }

            const filteredEntries = applyEntriesViewTransforms(entries, getEntriesFilterMode());
            gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Entries View">
                <header class="unidex-panel-header">
                    <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToCards()">Back To Cards</button>
                    <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(state.selectedCategory || '').toUpperCase())}"><span>${escapeHtml(state.selectedCategory)} Entries</span></h3>
                    <div class="unidex-panel-controls">
                        ${buildEntriesControlsHtml()}
                    </div>
                </header>
                <section class="${buildEntriesClassName(layoutMode)}" aria-label="Bookmark and Library Entries">
                    ${buildEntriesHtml(filteredEntries, taskMode, layoutMode, {
                        groupMode: getEntriesGroupMode(),
                        densityMode: getEntriesDensityMode()
                    })}
                </section>
            </section>
        `;

            stabilizeEntriesLayout(gridContainer, layoutMode);
        }

        return {
            renderEntriesStage
        };
    };
})();
