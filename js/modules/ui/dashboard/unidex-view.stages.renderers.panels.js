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
        const PROGRESSIVE_ENTRY_THRESHOLD = 900;
        const PROGRESSIVE_GRID_INITIAL_COUNT = 288;
        const PROGRESSIVE_ROW_INITIAL_COUNT = 180;
        const PROGRESSIVE_CHUNK_SIZE = 220;
        const PROGRESSIVE_GROUP_CHUNK_SIZE = 760;
        let progressiveEntriesToken = 0;
        const mapButtonHtml = '<button type="button" class="unidex-layout-btn unidex-map-btn" onclick="window.UnidexView.openConstellationMap()" title="Open Constellation Map for this layer">Map</button>';
        const nexusAllTabsBtn = '<button type="button" class="unidex-layout-btn unidex-nexus-btn" onclick="window.UnidexView.openNexusSearch()" title="Search across all tabs (bookmarks + scraper cache)">⚔ Nexus Search</button>';
        function buildNexusScopedBtn(wsId) {
            const safeWsId = String(wsId || '').replace(/'/g, "\\'");
            return '<button type="button" class="unidex-layout-btn unidex-nexus-btn" onclick="window.UnidexView.openNexusSearch(\'' + safeWsId + '\')" title="Search this tab (bookmarks + scraper cache)">⚔ Nexus Search</button>';
        }

        function buildEntriesClassName(layoutMode) {
            return 'unidex-entries '
                + (layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout')
                + ' is-density-' + getEntriesDensityMode();
        }

        function scheduleIdleTask(callback) {
            if (typeof window.requestIdleCallback === 'function') {
                return window.requestIdleCallback(callback, { timeout: 180 });
            }
            return window.setTimeout(function () {
                callback({
                    didTimeout: true,
                    timeRemaining: function () { return 8; }
                });
            }, 16);
        }

        function shouldProgressivelyRenderEntries(entries, groupMode) {
            return Array.isArray(entries)
                && entries.length > PROGRESSIVE_ENTRY_THRESHOLD;
        }

        function getProgressiveInitialCount(layoutMode, totalCount) {
            const baseCount = layoutMode === 'grid'
                ? PROGRESSIVE_GRID_INITIAL_COUNT
                : PROGRESSIVE_ROW_INITIAL_COUNT;
            return Math.min(Math.max(baseCount, 1), totalCount);
        }

        function buildProgressiveStatusHtml(renderedCount, totalCount) {
            return `
                <div class="unidex-progressive-status" data-unidex-progressive-status="1" role="status" aria-live="polite">
                    <span>Showing ${renderedCount.toLocaleString()} of ${totalCount.toLocaleString()} bookmarks</span>
                    <small>Loading the rest in background chunks.</small>
                </div>
            `;
        }

        function buildProgressiveEntriesHtml(entries, taskMode, layoutMode, entryOptions) {
            const totalCount = Array.isArray(entries) ? entries.length : 0;
            const initialCount = getProgressiveInitialCount(layoutMode, totalCount);
            const initialEntries = entries.slice(0, initialCount);
            return {
                initialCount,
                totalCount,
                html: buildEntriesHtml(initialEntries, taskMode, layoutMode, entryOptions)
                    + buildProgressiveStatusHtml(initialCount, totalCount)
            };
        }

        function getIdentifierIds(link) {
            if (typeof window.EveBookmarkIdentifiers?.getIdentifiersForLink === 'function') {
                return window.EveBookmarkIdentifiers.getIdentifiersForLink(link);
            }
            return Array.isArray(link?.identifiers)
                ? link.identifiers.map(function (id) { return String(id || '').trim(); }).filter(Boolean)
                : [];
        }

        function buildIdentifierGroups(entries) {
            const identifierApi = window.EveBookmarkIdentifiers || {};
            const definitions = typeof identifierApi.getDefinitions === 'function'
                ? identifierApi.getDefinitions()
                : [];
            const definitionGroups = (Array.isArray(definitions) ? definitions : []).map(function (definition) {
                return {
                    id: String(definition?.id || '').trim(),
                    label: String(definition?.label || definition?.id || 'Identifier').trim(),
                    links: []
                };
            }).filter(function (group) {
                return !!group.id;
            });
            const groupById = new Map(definitionGroups.map(function (group) {
                return [group.id, group];
            }));
            const unidentifiedLinks = [];

            (Array.isArray(entries) ? entries : []).forEach(function (link) {
                const ids = getIdentifierIds(link);
                if (!ids.length) {
                    unidentifiedLinks.push(link);
                    return;
                }
                ids.forEach(function (id) {
                    if (!groupById.has(id)) {
                        const fallbackGroup = { id, label: id, links: [] };
                        groupById.set(id, fallbackGroup);
                        definitionGroups.push(fallbackGroup);
                    }
                    groupById.get(id).links.push(link);
                });
            });

            const populatedGroups = definitionGroups.filter(function (group) {
                return group.links.length > 0;
            });
            if (unidentifiedLinks.length) {
                populatedGroups.push({
                    id: '__unidentified__',
                    label: 'No Identifier',
                    links: unidentifiedLinks
                });
            }
            return populatedGroups;
        }

        function buildIdentifierGroupBadgeHtml(group) {
            const identifierApi = window.EveBookmarkIdentifiers || {};
            const safeGroupLabel = escapeHtml(group?.label || 'Identifier');
            if (group?.id && group.id !== '__unidentified__' && typeof identifierApi.buildBadgeHtml === 'function') {
                return identifierApi.buildBadgeHtml([group.id]) || `<span class="unidex-identifier-group-fallback">${safeGroupLabel}</span>`;
            }
            return `<span class="unidex-identifier-group-fallback">${safeGroupLabel}</span>`;
        }

        function buildProgressiveIdentifierEntriesHtml(entries, taskMode, layoutMode, entryOptions) {
            const groups = buildIdentifierGroups(entries);
            const rows = [];
            groups.forEach(function (group) {
                group.links.forEach(function (link) {
                    rows.push({ groupId: group.id, link });
                });
            });
            const totalCount = rows.length;
            const initialCount = getProgressiveInitialCount(layoutMode, totalCount);
            const initialRows = rows.slice(0, initialCount);
            const initialLinksByGroup = new Map();
            initialRows.forEach(function (row) {
                if (!initialLinksByGroup.has(row.groupId)) initialLinksByGroup.set(row.groupId, []);
                initialLinksByGroup.get(row.groupId).push(row.link);
            });

            const sectionsHtml = groups.map(function (group) {
                const safeGroupId = escapeHtml(group.id || '');
                const groupKey = encodeURIComponent(group.id || '');
                const groupLinks = initialLinksByGroup.get(group.id) || [];
                const entriesHtml = buildEntriesHtml(groupLinks, taskMode, layoutMode, Object.assign({}, entryOptions, {
                    renderItemsOnly: true,
                    groupMode: 'flat'
                }));
                return `
                    <section class="unidex-identifier-group" data-identifier-id="${safeGroupId}">
                        <header class="unidex-identifier-group-header">
                            <div class="unidex-identifier-group-title">${buildIdentifierGroupBadgeHtml(group)}</div>
                            <span class="unidex-identifier-group-count">${group.links.length} bookmark${group.links.length === 1 ? '' : 's'}</span>
                        </header>
                        <div class="unidex-identifier-group-body" data-unidex-progressive-group="${groupKey}">
                            ${entriesHtml}
                        </div>
                    </section>
                `;
            }).join('');

            return {
                grouped: true,
                rows,
                initialCount,
                totalCount,
                html: sectionsHtml + buildProgressiveStatusHtml(initialCount, totalCount)
            };
        }

        function buildEntriesPayload(entries, taskMode, layoutMode, entryOptions) {
            const groupMode = String(entryOptions?.groupMode || 'flat');
            if (!shouldProgressivelyRenderEntries(entries, groupMode)) {
                return {
                    progressive: false,
                    initialCount: Array.isArray(entries) ? entries.length : 0,
                    totalCount: Array.isArray(entries) ? entries.length : 0,
                    html: buildEntriesHtml(entries, taskMode, layoutMode, entryOptions)
                };
            }
            const payload = groupMode === 'identifiers'
                ? buildProgressiveIdentifierEntriesHtml(entries, taskMode, layoutMode, entryOptions)
                : buildProgressiveEntriesHtml(entries, taskMode, layoutMode, entryOptions);
            payload.progressive = true;
            return payload;
        }

        function scheduleProgressiveEntriesHydration(gridContainer, entries, taskMode, layoutMode, entryOptions, payload) {
            if (!payload?.progressive) return;
            progressiveEntriesToken += 1;
            const token = progressiveEntriesToken;
            const entriesSection = gridContainer?.querySelector?.('.unidex-entries[data-unidex-progressive="1"]');
            if (!entriesSection) return;

            const statusNode = entriesSection.querySelector('[data-unidex-progressive-status="1"]');
            let renderedCount = Number(payload.initialCount || 0);
            const totalCount = Array.isArray(entries) ? entries.length : renderedCount;
            entriesSection.dataset.unidexProgressiveRendered = String(renderedCount);
            entriesSection.dataset.unidexProgressiveTotal = String(totalCount);

            function updateStatus(done) {
                entriesSection.dataset.unidexProgressiveRendered = String(renderedCount);
                if (!statusNode) return;
                statusNode.innerHTML = done
                    ? `<span>Loaded ${totalCount.toLocaleString()} bookmarks</span><small>Large datapack mode is active.</small>`
                    : `<span>Showing ${renderedCount.toLocaleString()} of ${totalCount.toLocaleString()} bookmarks</span><small>Loading the rest in background chunks.</small>`;
            }

            function appendNextChunk() {
                if (token !== progressiveEntriesToken || !document.body?.contains(entriesSection)) return;
                if (renderedCount >= totalCount) {
                    entriesSection.setAttribute('aria-busy', 'false');
                    entriesSection.classList.remove('is-progressive-loading');
                    updateStatus(true);
                    stabilizeEntriesLayout(gridContainer, layoutMode);
                    return;
                }

                const sourceRows = payload.grouped && Array.isArray(payload.rows) ? payload.rows : entries;
                const chunkSize = payload.grouped ? PROGRESSIVE_GROUP_CHUNK_SIZE : PROGRESSIVE_CHUNK_SIZE;
                const nextCount = Math.min(totalCount, renderedCount + chunkSize);
                const chunk = sourceRows.slice(renderedCount, nextCount);

                if (payload.grouped) {
                    const linksByGroup = new Map();
                    chunk.forEach(function (row) {
                        if (!linksByGroup.has(row.groupId)) linksByGroup.set(row.groupId, []);
                        linksByGroup.get(row.groupId).push(row.link);
                    });
                    linksByGroup.forEach(function (groupLinks, groupId) {
                        const groupKey = encodeURIComponent(groupId || '');
                        const groupBody = entriesSection.querySelector(`[data-unidex-progressive-group="${groupKey}"]`);
                        if (!groupBody) return;
                        const chunkHtml = buildEntriesHtml(groupLinks, taskMode, layoutMode, Object.assign({}, entryOptions, {
                            renderItemsOnly: true,
                            groupMode: 'flat'
                        }));
                        const template = document.createElement('template');
                        template.innerHTML = chunkHtml;
                        groupBody.appendChild(template.content);
                    });
                } else {
                    const chunkHtml = buildEntriesHtml(chunk, taskMode, layoutMode, Object.assign({}, entryOptions, {
                        renderItemsOnly: true,
                        groupMode: 'flat'
                    }));
                    const template = document.createElement('template');
                    template.innerHTML = chunkHtml;
                    entriesSection.insertBefore(template.content, statusNode || null);
                }
                renderedCount = nextCount;
                updateStatus(false);

                scheduleIdleTask(appendNextChunk);
            }

            entriesSection.classList.add('is-progressive-loading');
            entriesSection.setAttribute('aria-busy', 'true');
            updateStatus(false);
            scheduleIdleTask(appendNextChunk);
        }

        function cancelProgressiveEntriesHydration() {
            progressiveEntriesToken += 1;
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

            if (!tabsUnifiedMode) {
                gridContainer.innerHTML = `
                <section class="unidex-shell" aria-label="Unidex Tabs View">
                    <header class="unidex-hero">
                        <h2 class="unidex-title unidex-echo-title" data-text="THE UNIDEX VIEW"><span>The Unidex View</span></h2>
                    </header>
                    <div class="unidex-panel-controls unidex-tabs-controls">
                        ${tabsUnifiedToggleHtml}
                        ${buildTabsTreeModeButton()}
                        ${nexusAllTabsBtn}
                        ${mapButtonHtml}
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
