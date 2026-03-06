// Unidex View Stage Renderers Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createStageRenderers = function createStageRenderers(deps) {
        const state = deps?.state || {};
        const getWorkspaceById = deps?.getWorkspaceById;
        const getWorkspaceLinks = deps?.getWorkspaceLinks;
        const getAllWorkspaceLinks = deps?.getAllWorkspaceLinks;
        const getCategoryModels = deps?.getCategoryModels;
        const isTaskModeCategory = deps?.isTaskModeCategory;
        const getWorkspaceLabel = deps?.getWorkspaceLabel;
        const escapeHtml = deps?.escapeHtml;
        const ensureLibraryReadyForEntries = deps?.ensureLibraryReadyForEntries;
        const shouldShowLibraryLoadingHint = deps?.shouldShowLibraryLoadingHint;
        const scheduleEntriesRetry = deps?.scheduleEntriesRetry;
        const stabilizeEntriesLayout = deps?.stabilizeEntriesLayout;
        const buildTabsHtml = deps?.buildTabsHtml;
        const buildCardsHtml = deps?.buildCardsHtml;
        const buildEntriesHtml = deps?.buildEntriesHtml;
        const getEntriesLayoutMode = deps?.getEntriesLayoutMode;
        const getCardsUnifiedMode = deps?.getCardsUnifiedMode;
        const getTabsUnifiedMode = deps?.getTabsUnifiedMode;
        const getEntriesFilterMode = deps?.getEntriesFilterMode;
        const applyEntriesViewTransforms = deps?.applyEntriesViewTransforms;
        const buildEntriesControlsHtml = deps?.buildEntriesControlsHtml;

        function renderTabsStage(gridContainer, searchStr) {
            const tabsUnifiedMode = getTabsUnifiedMode();
            const layoutMode = getEntriesLayoutMode();
            const tabsUnifiedToggleHtml = `
            <label class="unidex-switch" title="Show bookmarks from all tabs in one unified view">
                <input type="checkbox" class="unidex-switch-input" onchange="window.UnidexView.setTabsUnified(this.checked)" ${tabsUnifiedMode ? 'checked' : ''}>
                <span class="unidex-switch-track" aria-hidden="true"></span>
                <span class="unidex-switch-label">Unified Across Tabs</span>
            </label>
        `;

            if (!tabsUnifiedMode) {
                gridContainer.innerHTML = `
                <section class="unidex-shell" aria-label="Unidex Tabs View">
                    <header class="unidex-hero">
                        <h2 class="unidex-title unidex-echo-title" data-text="THE UNIDEX VIEW"><span>The Unidex View</span></h2>
                    </header>
                    <div class="unidex-panel-controls unidex-tabs-controls">
                        ${tabsUnifiedToggleHtml}
                    </div>
                    <section class="unidex-tabs" aria-label="Workspace Tabs">
                        ${buildTabsHtml()}
                    </section>
                </section>
            `;
                return;
            }

            const allLinks = getAllWorkspaceLinks(searchStr);
            const libraryReady = ensureLibraryReadyForEntries();
            if (!libraryReady) {
                if (!shouldShowLibraryLoadingHint()) {
                    scheduleEntriesRetry();
                    return;
                }

                gridContainer.innerHTML = `
                <section class="unidex-shell" aria-label="Unidex Unified Entries Across Tabs View">
                    <header class="unidex-hero">
                        <h2 class="unidex-title unidex-echo-title" data-text="THE UNIDEX VIEW"><span>The Unidex View</span></h2>
                    </header>
                    <div class="unidex-panel-controls unidex-tabs-controls">
                        ${buildEntriesControlsHtml({ toggleHtml: tabsUnifiedToggleHtml })}
                    </div>
                    <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Unified entries across all tabs">
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

            const filteredEntries = applyEntriesViewTransforms(allLinks, getEntriesFilterMode());
            gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Unified Entries Across Tabs View">
                <header class="unidex-hero">
                    <h2 class="unidex-title unidex-echo-title" data-text="THE UNIDEX VIEW"><span>The Unidex View</span></h2>
                </header>
                <div class="unidex-panel-controls unidex-tabs-controls">
                    ${buildEntriesControlsHtml({ toggleHtml: tabsUnifiedToggleHtml })}
                </div>
                <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Unified entries across all tabs">
                    ${buildEntriesHtml(filteredEntries, false, layoutMode, {
                        includeCategoryTag: true,
                        resolveTaskMode: function (link) {
                            return isTaskModeCategory(link.category || 'Unsorted');
                        },
                        getExtraTagsHtml: function (link) {
                            const workspaceLabel = escapeHtml(getWorkspaceLabel(link.workspace));
                            return `<span class="unidex-entry-tag workspace">${workspaceLabel}</span>`;
                        }
                    })}
                </section>
            </section>
        `;

            stabilizeEntriesLayout(gridContainer, layoutMode);
        }

        function renderCardsStage(gridContainer, searchStr, callbacks) {
            const workspace = getWorkspaceById(state.selectedWorkspaceId);
            if (!workspace) {
                if (callbacks?.resetSelection) callbacks.resetSelection();
                if (callbacks?.renderTabsStage) callbacks.renderTabsStage(gridContainer, searchStr);
                return;
            }

            const workspaceLinks = getWorkspaceLinks(workspace.id, searchStr);
            const categoryModels = getCategoryModels(workspaceLinks);
            const cardsUnifiedMode = getCardsUnifiedMode();
            const layoutMode = getEntriesLayoutMode();
            const unifiedToggleHtml = `
            <label class="unidex-switch" title="Show all bookmarks from all cards in this workspace">
                <input type="checkbox" class="unidex-switch-input" onchange="window.UnidexView.setCardsUnified(this.checked)" ${cardsUnifiedMode ? 'checked' : ''}>
                <span class="unidex-switch-track" aria-hidden="true"></span>
                <span class="unidex-switch-label">Unified Entries</span>
            </label>
        `;

            if (!cardsUnifiedMode) {
                gridContainer.innerHTML = `
                <section class="unidex-shell" aria-label="Unidex Cards View">
                    <header class="unidex-panel-header">
                        <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToTabs()">Back To Tabs</button>
                        <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || '').toUpperCase())}"><span>${escapeHtml(workspace.name)} Cards</span></h3>
                        <div class="unidex-panel-controls">
                            ${unifiedToggleHtml}
                        </div>
                    </header>
                    <section class="unidex-cards" aria-label="Category Cards">
                        ${buildCardsHtml(categoryModels)}
                    </section>
                </section>
            `;
                return;
            }

            const libraryReady = ensureLibraryReadyForEntries();
            if (!libraryReady) {
                if (!shouldShowLibraryLoadingHint()) {
                    scheduleEntriesRetry();
                    return;
                }

                gridContainer.innerHTML = `
                <section class="unidex-shell" aria-label="Unidex Unified Entries View">
                    <header class="unidex-panel-header">
                        <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToTabs()">Back To Tabs</button>
                        <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || '').toUpperCase())}"><span>${escapeHtml(workspace.name)} Unified Entries</span></h3>
                        <div class="unidex-panel-controls">
                            ${buildEntriesControlsHtml({ toggleHtml: unifiedToggleHtml })}
                        </div>
                    </header>
                    <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Unified bookmark and library entries">
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

            const filteredEntries = applyEntriesViewTransforms(workspaceLinks, getEntriesFilterMode());
            gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Unified Entries View">
                <header class="unidex-panel-header">
                    <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToTabs()">Back To Tabs</button>
                    <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || '').toUpperCase())}"><span>${escapeHtml(workspace.name)} Unified Entries</span></h3>
                    <div class="unidex-panel-controls">
                        ${buildEntriesControlsHtml({ toggleHtml: unifiedToggleHtml })}
                    </div>
                </header>
                <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Unified bookmark and library entries">
                    ${buildEntriesHtml(filteredEntries, false, layoutMode, {
                        includeCategoryTag: true,
                        resolveTaskMode: function (link) {
                            return isTaskModeCategory(link.category || 'Unsorted');
                        }
                    })}
                </section>
            </section>
        `;

            stabilizeEntriesLayout(gridContainer, layoutMode);
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
            const taskMode = isTaskModeCategory(state.selectedCategory);
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
                    <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Bookmark and Library Entries">
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
                <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Bookmark and Library Entries">
                    ${buildEntriesHtml(filteredEntries, taskMode, layoutMode)}
                </section>
            </section>
        `;

            stabilizeEntriesLayout(gridContainer, layoutMode);
        }

        return {
            renderTabsStage,
            renderCardsStage,
            renderEntriesStage
        };
    };
})();
