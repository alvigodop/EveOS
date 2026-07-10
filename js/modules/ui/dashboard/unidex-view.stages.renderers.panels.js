// Unidex View Stage Panel Renderers Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createStagePanelRenderers = function createStagePanelRenderers(deps) {
        const state = deps?.state || {};
        const getWorkspaceById = deps?.getWorkspaceById;
        const getWorkspaceLinks = deps?.getWorkspaceLinks;
        const getWorkspaceBookmarkCount = deps?.getWorkspaceBookmarkCount;
        const getAllWorkspaceLinks = deps?.getAllWorkspaceLinks;
        const getCategoryModels = deps?.getCategoryModels;
        const getCategoryModelsForWorkspace = deps?.getCategoryModelsForWorkspace || function (workspaceId, searchStr, workspaceLinks) {
            return getCategoryModels(Array.isArray(workspaceLinks) ? workspaceLinks : getWorkspaceLinks(workspaceId, searchStr));
        };
        const isTaskModeCategory = deps?.isTaskModeCategory;
        const getWorkspaceLabel = deps?.getWorkspaceLabel;
        const encodeParam = deps?.encodeParam || function (value) {
            return encodeURIComponent(String(value ?? ''));
        };
        const escapeHtml = deps?.escapeHtml;
        const ensureLibraryReadyForEntries = deps?.ensureLibraryReadyForEntries;
        const shouldShowLibraryLoadingHint = deps?.shouldShowLibraryLoadingHint;
        const scheduleEntriesRetry = deps?.scheduleEntriesRetry;
        const stabilizeEntriesLayout = deps?.stabilizeEntriesLayout;
        const buildTabsHtml = deps?.buildTabsHtml;
        const buildCardsHtml = deps?.buildCardsHtml;
        const buildWrappedCardsHtml = deps?.buildWrappedCardsHtml || function (workspace, models) {
            return '<section class="unidex-cards" aria-label="Category Cards">' + buildCardsHtml(models) + '</section>';
        };
        const buildEntriesHtml = deps?.buildEntriesHtml;
        const getEntriesLayoutMode = deps?.getEntriesLayoutMode;
        const getEntriesDensityMode = deps?.getEntriesDensityMode || (() => 'comfortable');
        const getCardsUnifiedMode = deps?.getCardsUnifiedMode;
        const getTabsUnifiedMode = deps?.getTabsUnifiedMode;
        const getTabsTreeMode = deps?.getTabsTreeMode || (() => 'wrapped');
        const getEntriesFilterMode = deps?.getEntriesFilterMode;
        const getEntriesGroupMode = deps?.getEntriesGroupMode || (() => 'flat');
        const applyEntriesViewTransforms = deps?.applyEntriesViewTransforms;
        const buildEntriesControlsHtml = deps?.buildEntriesControlsHtml;
        const progressiveHelpers = window.UnidexViewModules.createStageProgressiveEntryHelpers({
            buildEntriesHtml,
            getEntriesDensityMode,
            getEntriesGroupMode,
            escapeHtml,
            stabilizeEntriesLayout
        });
        const {
            buildEntriesClassName,
            buildEntriesPayload,
            scheduleProgressiveEntriesHydration,
            cancelProgressiveEntriesHydration
        } = progressiveHelpers;
        const mapButtonHtml = '<button type="button" class="unidex-layout-btn unidex-map-btn" onclick="window.UnidexView.openConstellationMap()" title="Open Constellation Map for this layer">Map</button>';
        const matrixButtonHtml = '<button type="button" class="unidex-layout-btn unidex-matrix-btn" onclick="window.UnidexView.openMatrixWorkshop()" title="Open Matrix Workshop for this layer">Matrix</button>';
        const nexusAllTabsBtn = '<button type="button" class="unidex-layout-btn unidex-nexus-btn" onclick="window.UnidexView.openNexusSearch()" title="Search across all tabs (bookmarks + scraper cache)">⚔ Nexus Search</button>';
        function buildNexusScopedBtn(workspaceId) {
            const safeWorkspaceId = String(workspaceId || '').replace(/'/g, "\\'");
            return '<button type="button" class="unidex-layout-btn unidex-nexus-btn" onclick="window.UnidexView.openNexusSearch(\''
                + safeWorkspaceId
                + '\')" title="Search this tab (bookmarks + scraper cache)">⚔ Nexus Search</button>';
        }

        function buildTabsTreeModeButton() {
            const mode = getTabsTreeMode();
            const label = mode === 'wrapped' ? 'Wrapped' : 'Unfolded';
            const nextLabel = mode === 'wrapped' ? 'Unfolded' : 'Wrapped';
            return '<button type="button" class="unidex-layout-btn unidex-tree-mode-btn" onclick="window.UnidexView.toggleTabsTreeMode()" title="Switch to ' + nextLabel + ' tab tree view">Tab View: ' + label + '</button>';
        }

        function getParentWorkspace(workspace) {
            const helpers = window.EveWorkspaceHelpers;
            if (!helpers || typeof helpers.findParent !== 'function' || !workspace?.id) return null;
            return helpers.findParent(config.workspaces || [], workspace.id);
        }

        function buildCardsNavHtml(workspace) {
            const parentWorkspace = getParentWorkspace(workspace);
            const parentName = parentWorkspace ? escapeHtml(parentWorkspace.name || parentWorkspace.id) : '';
            const parentId = parentWorkspace ? String(encodeParam(parentWorkspace.id)).replace(/'/g, '%27') : '';
            const parentButtonHtml = parentWorkspace
                ? `<button type="button" class="unidex-back-btn unidex-parent-back-btn" onclick="window.UnidexView.switchWorkspaceTab('${parentId}')" title="Back to parent tab: ${parentName}"><span>Back To Parent</span><small>${parentName}</small></button>`
                : '';
            return `<div class="unidex-panel-nav">
                <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToTabs()">Back To Tabs</button>
                ${parentButtonHtml}
            </div>`;
        }

        function renderTabsStage(gridContainer, searchStr) {
            cancelProgressiveEntriesHydration();
            const tabsUnifiedMode = getTabsUnifiedMode();
            const tabsTreeMode = getTabsTreeMode();
            const layoutMode = getEntriesLayoutMode();
            const tabsUnifiedToggleHtml = `
            <label class="unidex-switch" title="Show bookmarks from all tabs in one unified view">
                <input type="checkbox" class="unidex-switch-input" onchange="window.UnidexView.setTabsUnified(this.checked)" ${tabsUnifiedMode ? 'checked' : ''}>
                <span class="unidex-switch-track" aria-hidden="true"></span>
                <span class="unidex-switch-label">Unified Across Tabs</span>
            </label>
        `;
            const showInactiveTabs = !!(typeof config !== 'undefined' && config.unidexShowInactiveTabs);
            const showInactiveToggleHtml = `
            <label class="unidex-switch" title="Show tabs that are inactive or in hidden groups (grayed out). Off hides them from Unidex.">
                <input type="checkbox" class="unidex-switch-input" onchange="window.UnidexView.setShowInactiveTabs(this.checked)" ${showInactiveTabs ? 'checked' : ''}>
                <span class="unidex-switch-track" aria-hidden="true"></span>
                <span class="unidex-switch-label">Show Inactive Tabs</span>
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
                        ${showInactiveToggleHtml}
                        ${buildTabsTreeModeButton()}
                        ${nexusAllTabsBtn}
                        ${mapButtonHtml}
                        ${matrixButtonHtml}
                    </div>
                    <section class="unidex-tabs ${tabsTreeMode === 'wrapped' ? 'is-wrapper-view' : 'is-unfolded-view'}" aria-label="Workspace Tabs">
                        ${buildTabsHtml({ mode: tabsTreeMode })}
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
                    <section class="${buildEntriesClassName(layoutMode)}" aria-label="Unified entries across all tabs">
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
            const entryOptions = {
                includeCategoryTag: true,
                groupMode: getEntriesGroupMode(),
                densityMode: getEntriesDensityMode(),
                resolveTaskMode: function (link) {
                    return isTaskModeCategory(link.workspace || 'main', link.category || 'Unsorted');
                },
                getExtraTagsHtml: function (link) {
                    const workspaceLabel = escapeHtml(getWorkspaceLabel(link.workspace));
                    return `<span class="unidex-entry-tag workspace">${workspaceLabel}</span>`;
                }
            };
            const entriesPayload = buildEntriesPayload(filteredEntries, false, layoutMode, entryOptions);
            gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Unified Entries Across Tabs View">
                <header class="unidex-hero">
                    <h2 class="unidex-title unidex-echo-title" data-text="THE UNIDEX VIEW"><span>The Unidex View</span></h2>
                </header>
                <div class="unidex-panel-controls unidex-tabs-controls">
                    ${buildEntriesControlsHtml({ toggleHtml: tabsUnifiedToggleHtml })}
                </div>
                <section class="${buildEntriesClassName(layoutMode)}" aria-label="Unified entries across all tabs" ${entriesPayload.progressive ? 'data-unidex-progressive="1"' : ''}>
                    ${entriesPayload.html}
                </section>
            </section>
        `;

            stabilizeEntriesLayout(gridContainer, layoutMode);
            scheduleProgressiveEntriesHydration(gridContainer, filteredEntries, false, layoutMode, entryOptions, entriesPayload);
        }

        function renderCardsStage(gridContainer, searchStr, callbacks) {
            cancelProgressiveEntriesHydration();
            const workspace = getWorkspaceById(state.selectedWorkspaceId);
            if (!workspace) {
                if (callbacks?.resetSelection) callbacks.resetSelection();
                if (callbacks?.renderTabsStage) callbacks.renderTabsStage(gridContainer, searchStr);
                return;
            }

            const getWorkspaceAndSubTabLinks = deps?.getWorkspaceAndSubTabLinks;
            const hasSubTabs = Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0;

            // Get main workspace links
            const workspaceLinks = getWorkspaceLinks(workspace.id, searchStr);
            const categoryModels = getCategoryModelsForWorkspace(workspace.id, searchStr, workspaceLinks);
            const cardsUnifiedMode = getCardsUnifiedMode();
            const layoutMode = getEntriesLayoutMode();
            const unifiedScope = cardsUnifiedMode && getWorkspaceAndSubTabLinks
                ? getWorkspaceAndSubTabLinks(workspace.id, searchStr)
                : null;
            const unifiedWorkspaceLinks = Array.isArray(unifiedScope?.links)
                ? unifiedScope.links
                : workspaceLinks;
            const unifiedSubTabIds = unifiedScope?.subTabIds instanceof Set
                ? unifiedScope.subTabIds
                : new Set();

            // Build sub-tab card sections
            let subTabCardsHtml = '';
            if (hasSubTabs && !cardsUnifiedMode && getWorkspaceAndSubTabLinks) {
                const helpers = window.EveWorkspaceHelpers;
                if (helpers) {
                    const visibleSubTabs = (workspace.subTabs || []).filter(function (st) {
                        return st && !st.hiddenInParent;
                    });
                    visibleSubTabs.forEach(function (subTab) {
                        const stLinks = getWorkspaceLinks(subTab.id, searchStr);
                        const stCount = typeof getWorkspaceBookmarkCount === 'function'
                            ? getWorkspaceBookmarkCount(subTab.id, searchStr, stLinks)
                            : stLinks.length;
                        if (stCount === 0) return;
                        const stModels = getCategoryModelsForWorkspace(subTab.id, searchStr, stLinks);
                        const depth = helpers.getDepth(config.workspaces, subTab.id);
                        const depthClass = depth > 0 ? ' unidex-subtab-section-depth-' + Math.min(depth, 4) : '';
                        const safeIcon = escapeHtml(subTab.icon || '📁');
                        const safeName = escapeHtml(subTab.name || subTab.id);
                        subTabCardsHtml += `
                        <div class="unidex-subtab-section${depthClass}">
                            <div class="unidex-subtab-section-header">
                                <span class="unidex-subtab-badge">${safeIcon} ${safeName}</span>
                                <span class="unidex-subtab-count">${stCount} links</span>
                            </div>
                            ${buildWrappedCardsHtml(subTab, stModels, {
                                depth: depth,
                                badge: 'Nested Tab',
                                sectionLabel: 'CARDS'
                            })}
                        </div>`;
                    });
                }
            }

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
                        ${buildCardsNavHtml(workspace)}
                        <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || '').toUpperCase())}"><span>${escapeHtml(workspace.name)} Cards</span></h3>
                        <div class="unidex-panel-controls">
                            ${unifiedToggleHtml}
                            ${buildNexusScopedBtn(state.selectedWorkspaceId)}
                            ${mapButtonHtml}
                            ${matrixButtonHtml}
                        </div>
                    </header>
                    ${buildWrappedCardsHtml(workspace, categoryModels, {
                        root: true,
                        badge: 'Current Tab',
                        sectionLabel: 'CARDS'
                    })}
                    ${subTabCardsHtml}
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
                        ${buildCardsNavHtml(workspace)}
                        <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || '').toUpperCase())}"><span>${escapeHtml(workspace.name)} Unified Entries</span></h3>
                        <div class="unidex-panel-controls">
                            ${buildEntriesControlsHtml({ toggleHtml: unifiedToggleHtml })}
                        </div>
                    </header>
                    <section class="${buildEntriesClassName(layoutMode)}" aria-label="Unified bookmark and library entries">
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

            const filteredEntries = applyEntriesViewTransforms(unifiedWorkspaceLinks, getEntriesFilterMode());
            const entryOptions = {
                includeCategoryTag: true,
                groupMode: getEntriesGroupMode(),
                densityMode: getEntriesDensityMode(),
                resolveTaskMode: function (link) {
                    return isTaskModeCategory(link.workspace || 'main', link.category || 'Unsorted');
                },
                getExtraTagsHtml: function (link) {
                    const linkWorkspaceId = String(link?.workspace || '').trim();
                    if (!unifiedSubTabIds.has(linkWorkspaceId)) return '';
                    return `<span class="unidex-entry-tag workspace">Sub Tab: ${escapeHtml(getWorkspaceLabel(linkWorkspaceId))}</span>`;
                }
            };
            const entriesPayload = buildEntriesPayload(filteredEntries, false, layoutMode, entryOptions);
            gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Unified Entries View">
                <header class="unidex-panel-header">
                    ${buildCardsNavHtml(workspace)}
                    <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || '').toUpperCase())}"><span>${escapeHtml(workspace.name)} Unified Entries</span></h3>
                    <div class="unidex-panel-controls">
                        ${buildEntriesControlsHtml({ toggleHtml: unifiedToggleHtml })}
                    </div>
                </header>
                <section class="${buildEntriesClassName(layoutMode)}" aria-label="Unified bookmark and library entries" ${entriesPayload.progressive ? 'data-unidex-progressive="1"' : ''}>
                    ${entriesPayload.html}
                </section>
            </section>
        `;

            stabilizeEntriesLayout(gridContainer, layoutMode);
            scheduleProgressiveEntriesHydration(gridContainer, filteredEntries, false, layoutMode, entryOptions, entriesPayload);
        }

        return {
            renderTabsStage,
            renderCardsStage
        };
    };
})();
