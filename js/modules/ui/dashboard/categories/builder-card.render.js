window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    var {
        escapeCardHtml,
        escapeCardJs,
        buildScopedCategoryKey,
        getCardHeaderButtonsForCategory,
        buildFolderSectionsHtml
    } = api;

    function renderCard(cat, catLinks, gridContainer, configOptions) {
        var options = configOptions || {};
        var isDetachedParkingCard = !!options.detachedParkingCard;
        var isFocusMode = !!options.focusMode;
        var focusedFilterMode = (isFocusMode && typeof window.DashboardCategories.getFocusedEntriesFilterMode === 'function')
            ? window.DashboardCategories.getFocusedEntriesFilterMode()
            : 'all';
        var focusedSortBy = (isFocusMode && typeof window.DashboardCategories.getFocusedEntriesSortBy === 'function')
            ? window.DashboardCategories.getFocusedEntriesSortBy()
            : 'none';
        var focusedSortOrder = (isFocusMode && typeof window.DashboardCategories.getFocusedEntriesSortOrder === 'function')
            ? window.DashboardCategories.getFocusedEntriesSortOrder()
            : 'desc';

        var visibleLinks = (isFocusMode && typeof window.DashboardCategories.matchesFocusedEntriesFilter === 'function')
            ? catLinks.filter(function (link) {
                return window.DashboardCategories.matchesFocusedEntriesFilter(link, focusedFilterMode);
            })
            : catLinks.slice();
        var renderedLinks = (isFocusMode && typeof window.DashboardCategories.sortFocusedLinks === 'function')
            ? window.DashboardCategories.sortFocusedLinks(visibleLinks)
            : visibleLinks.slice();

        var card = document.createElement('div');
        card.className = 'category-card';
        if (!isFocusMode && Array.isArray(options.collapsed) && options.collapsed.includes(cat)) {
            card.classList.add('collapsed');
        }
        if (!isFocusMode && Array.isArray(options.foldersCollapsed) && options.foldersCollapsed.includes(cat)) {
            card.classList.add('folders-collapsed');
        }
        var folderTaskApi = window.EveBookmarkFolders;
        var safeCatHtml = escapeCardHtml(cat || 'Unsorted');
        var safeCatJs = escapeCardJs(cat || 'Unsorted');
        var libPanelId = 'lib-' + String(cat || 'Unsorted').replace(/[^a-zA-Z0-9]/g, '_') + '-panel';
        var folderToolbarExpanded = !!folderTaskApi?.isToolbarExpanded?.(options.activeWorkspace, cat);
        var folderHeaderBtnClass = 'category-action-btn' + (folderToolbarExpanded ? ' is-active' : '');

        function isTaskEnabledForLink(link) {
            if (typeof folderTaskApi?.isTaskEnabledForLink === 'function') {
                return !!folderTaskApi.isTaskEnabledForLink(link);
            }
            return !Array.isArray(options.hideStats) || !options.hideStats.includes(cat);
        }

        var totalAll = catLinks.length;
        var totalAllTasks = catLinks.filter(function (link) { return isTaskEnabledForLink(link); }).length;
        var doneAll = catLinks.filter(function (link) { return isTaskEnabledForLink(link) && !!link.done; }).length;
        var totalVisible = renderedLinks.length;
        var totalVisibleTasks = renderedLinks.filter(function (link) { return isTaskEnabledForLink(link); }).length;
        var doneVisible = renderedLinks.filter(function (link) { return isTaskEnabledForLink(link) && !!link.done; }).length;
        var hasTaskBookmarks = totalAllTasks > 0;
        if (hasTaskBookmarks) {
            card.classList.add('task-mode');
        }
        var isTaskMode = hasTaskBookmarks;
        if (isFocusMode) {
            card.classList.add('is-focus-mode');
        }
        var pct = totalAllTasks === 0 ? 0 : (doneAll / totalAllTasks) * 100;
        var barClass = pct === 100 && totalAllTasks > 0 ? 'complete' : '';

        card.ondragover = function (event) {
            if (typeof allowDrop === 'function') allowDrop(event);
        };
        card.ondrop = function (event) {
            if (isDetachedParkingCard) {
                if (window.EveConstellationMap && window.EveConstellationMap._detached && typeof window.EveConstellationMap._detached.handleDashboardParkingDrop === 'function') {
                    window.EveConstellationMap._detached.handleDashboardParkingDrop(event, activeWorkspaceId);
                }
                return;
            }
            if (typeof drop === 'function') drop(event, cat);
        };

        function renderLinkCollection(linksForRender) {
            if (isFocusMode && typeof window.DashboardCategories.buildFocusedLinkHtml === 'function') {
                var focusedHtml = linksForRender.map(function (link) {
                    return window.DashboardCategories.buildFocusedLinkHtml(link, {
                        taskMode: isTaskEnabledForLink(link),
                        taskEnabled: isTaskEnabledForLink(link)
                    });
                }).join('');

                if (!focusedHtml) {
                    focusedHtml = ''
                        + '<div class="unidex-empty-state">'
                        + '<h3>No Entries Found</h3>'
                        + '<p>No bookmarks match this filter.</p>'
                        + '</div>';
                }
                return '<section class="unidex-entries is-row-layout focused-category-entries" aria-label="' + safeCatHtml + ' bookmarks">' + focusedHtml + '</section>';
            }

            var flatHtml = linksForRender.map(function (link) {
                var folderLabel = '';
                if (options.searchStr && window.EveBookmarkFolders?.buildFolderPathLabel) {
                    folderLabel = window.EveBookmarkFolders.buildFolderPathLabel(link.workspace, link.category, link.folderId);
                }
                return window.DashboardCategories.buildLinkHtml(link, options.searchStr, options.activeWorkspace, options.workspaces, {
                    folderLabel: folderLabel,
                    isTaskEnabled: isTaskEnabledForLink(link)
                });
            }).join('');
            return '<ul class="' + (options.scrollableCategories ? 'category-scrollable' : '') + '">' + flatHtml + '</ul>';
        }

        var scopedWorkspaceIds = Array.from(new Set(renderedLinks.map(function (link) {
            return String(link?.workspace || options.activeWorkspace || '').trim();
        }).filter(Boolean)));
        var canRenderCardFolders = scopedWorkspaceIds.length <= 1
            && scopedWorkspaceIds.every(function (workspaceId) { return workspaceId === String(options.activeWorkspace || '').trim(); });
        var listHtml = canRenderCardFolders
            ? buildFolderSectionsHtml(cat, renderedLinks, options, renderLinkCollection)
            : renderLinkCollection(renderedLinks);

        var shownSuffix = (isFocusMode && focusedFilterMode !== 'all') ? ' shown' : '';
        var titleMetaText = isTaskMode
            ? (totalVisible + ' bookmarks' + shownSuffix + ' &bull; ' + doneVisible + ' done' + ' &bull; ' + Math.max(totalVisibleTasks - doneVisible, 0) + ' pending')
            : (totalVisible + ' bookmarks' + shownSuffix);
        var titleMetaHtml = isFocusMode
            ? '<div class="cat-focus-meta">' + titleMetaText + '</div>'
            : '';

        var titleControlsHtml = isFocusMode
            ? ''
            : ''
                + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleFolderCollapse(this.dataset.cat)" title="Toggle Folders">&#128193;</span>'
                + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleCollapse(this.dataset.cat)" title="Toggle Card">&#9660;</span>'
                + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', -1)">&#9650;</span>'
                + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', 1)">&#9660;</span>';

        var activeWorkspaceId = String(options.activeWorkspace || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
        var cardTargetId = window.EveQuickPins?.buildCardTargetId
            ? window.EveQuickPins.buildCardTargetId(activeWorkspaceId, cat)
            : buildScopedCategoryKey(activeWorkspaceId, cat);
        var detachedMapButtonHtml = isDetachedParkingCard
            ? '<button class="card-header-icon-btn constellation-btn" onclick="if(window.EveDetachedDashboardCard) window.EveDetachedDashboardCard.openDetachedParkingMap(\'' + escapeCardJs(activeWorkspaceId) + '\')" title="Detached Map">&#127756;</button>'
            : '';
        var detachedFocusMapButtonHtml = isDetachedParkingCard
            ? '<button class=\"category-action-btn\" onclick=\"if(window.EveDetachedDashboardCard) window.EveDetachedDashboardCard.openDetachedParkingMap(\'' + escapeCardJs(activeWorkspaceId) + '\')\" title=\"Detached Map\">&#127756; <span>Map</span></button>'
            : '';
        var visibleHeaderButtons = new Set(getCardHeaderButtonsForCategory(activeWorkspaceId, cat));
        var nonFocusButtons = [];
        if (!isDetachedParkingCard && visibleHeaderButtons.has('add')) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="openAddModal(\'' + safeCatJs + '\')" title="Add Bookmark">&#10133;</button>');
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('folders')) {
            nonFocusButtons.push('<button class="' + (folderToolbarExpanded ? 'card-header-icon-btn card-folder-toggle-btn is-active' : 'card-header-icon-btn card-folder-toggle-btn') + '" data-folder-toolbar-toggle="1" onclick="toggleBookmarkFolderToolbar(\'' + safeCatJs + '\', \'' + escapeCardJs(options.activeWorkspace || 'main') + '\')" title="Folders">&#128193;</button>');
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('library')) {
            nonFocusButtons.push('<button class="card-header-icon-btn lib-toggle-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218;</button>');
        }
        if (visibleHeaderButtons.has('focus')) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="setFocus(\'' + safeCatJs + '\')" title="Focus">&#127919;</button>');
        }
        if (isDetachedParkingCard) {
            nonFocusButtons.push(detachedMapButtonHtml);
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('constellation')) {
            nonFocusButtons.push('<button class="card-header-icon-btn constellation-btn" onclick="if(window.EveConstellationMap) window.EveConstellationMap.openCardMap(\'' + escapeCardJs(activeWorkspaceId) + '\', \'' + safeCatJs + '\')" title="Constellation Map">&#127756;</button>');
        }
        if (!isDetachedParkingCard) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="openCategorySettings(\'' + safeCatJs + '\')" title="Settings">&#9881;</button>');
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('launch')) {
            nonFocusButtons.push('<button class="card-header-icon-btn launch-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640;</button>');
        }

        var headerButtonsHtml = isFocusMode
            ? ''
                + '<div class="focus-card-controls">'
                    + '<button class="category-action-btn bulk-scope-btn" onclick="bulkToggleCardScopeSelection(\'' + safeCatJs + '\', \'' + escapeCardJs(activeWorkspaceId) + '\')" title="Select all bookmarks in this card">&#9745; <span>Select Card</span></button>'
                    + (!isDetachedParkingCard && visibleHeaderButtons.has('add')
                        ? '<button class="category-action-btn" onclick="openAddModal(\'' + safeCatJs + '\')" title="Add Bookmark">&#10133; <span>Add</span></button>'
                        : '')
                    + (!isDetachedParkingCard && visibleHeaderButtons.has('folders')
                        ? '<button class="' + folderHeaderBtnClass + '" data-folder-toolbar-toggle="1" onclick="toggleBookmarkFolderToolbar(\'' + safeCatJs + '\', \'' + escapeCardJs(options.activeWorkspace || 'main') + '\')" title="Folders">&#128193; <span>Folders</span></button>'
                        : '')
                    + (!isDetachedParkingCard && visibleHeaderButtons.has('library')
                        ? '<button class="category-action-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218; <span>Library</span></button>'
                        : '')
                    + (!isDetachedParkingCard && visibleHeaderButtons.has('constellation')
                        ? '<button class=\"category-action-btn\" onclick=\"if(window.EveConstellationMap) window.EveConstellationMap.openCardMap(\'' + escapeCardJs(activeWorkspaceId) + '\', \'' + safeCatJs + '\')\" title=\"Constellation Map\">&#127756; <span>Map</span></button>'
                        : '')
                    + detachedFocusMapButtonHtml
                    + '<select class="unidex-filter-select focus-filter-select" aria-label="Focused bookmark filter" onchange="window.DashboardCategories.setFocusedEntriesFilterMode(this.value)">'
                        + '<option value="all"' + (focusedFilterMode === 'all' ? ' selected' : '') + '>All Bookmarks</option>'
                        + '<option value="linked"' + (focusedFilterMode === 'linked' ? ' selected' : '') + '>Library Linked</option>'
                        + '<option value="bookmark-only"' + (focusedFilterMode === 'bookmark-only' ? ' selected' : '') + '>Bookmarks Only</option>'
                    + '</select>'
                    + '<select class="unidex-filter-select focus-sort-select" aria-label="Focused linked rating sort" onchange="window.DashboardCategories.setFocusedEntriesSortBy(this.value)">'
                        + '<option value="none"' + (focusedSortBy === 'none' ? ' selected' : '') + '>Sort Off</option>'
                        + '<option value="active"' + (focusedSortBy === 'active' ? ' selected' : '') + '>Active</option>'
                        + '<option value="unified"' + (focusedSortBy === 'unified' ? ' selected' : '') + '>Unified</option>'
                        + '<option value="personal"' + (focusedSortBy === 'personal' ? ' selected' : '') + '>Personal</option>'
                        + '<option value="api_weighted"' + (focusedSortBy === 'api_weighted' ? ' selected' : '') + '>API Weighted</option>'
                        + '<option value="api_average"' + (focusedSortBy === 'api_average' ? ' selected' : '') + '>API Average</option>'
                        + '<option value="confidence"' + (focusedSortBy === 'confidence' ? ' selected' : '') + '>Confidence</option>'
                    + '</select>'
                    + '<select class="unidex-filter-select focus-sort-order-select" aria-label="Focused linked rating sort order" onchange="window.DashboardCategories.setFocusedEntriesSortOrder(this.value)">'
                        + '<option value="desc"' + (focusedSortOrder === 'desc' ? ' selected' : '') + '>Desc</option>'
                        + '<option value="asc"' + (focusedSortOrder === 'asc' ? ' selected' : '') + '>Asc</option>'
                    + '</select>'
                    + '<button class="category-action-btn" onclick="clearFocus()" title="Exit Focus">&#127919; <span>Exit Focus</span></button>'
                    + (!isDetachedParkingCard
                        ? '<button class="category-action-btn" onclick="openCategorySettings(\'' + safeCatJs + '\')" title="Settings">&#9881; <span>Settings</span></button>'
                        : '')
                    + (!isDetachedParkingCard && visibleHeaderButtons.has('launch')
                        ? '<button class="category-action-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640; <span>Launch</span></button>'
                        : '')
                + '</div>'
            : ''
                + '<div class="card-header-icon-row" onwheel="handleCardHeaderIconRowWheel(event)">'
                    + '<button class="card-header-icon-btn bulk-scope-btn" onclick="bulkToggleCardScopeSelection(\'' + safeCatJs + '\', \'' + escapeCardJs(activeWorkspaceId) + '\')" title="Select Card">&#9745;</button>'
                    + nonFocusButtons.join('')
                + '</div>';

        card.innerHTML = ''
            + '<div class="cat-progress-bg"><div class="cat-progress-fill ' + barClass + '" style="width:' + pct + '%"></div></div>'
            + '<div class="category-header" oncontextmenu="showCategoryContextMenu(event, \'' + safeCatJs + '\')">'
                + '<div class="cat-title-group">'
                    + titleControlsHtml
                    + '<div class="category-title-wrap"'
                        + ' data-title="' + safeCatHtml + '"'
                        + ' onmouseenter="showCardTitleHover(event, this.dataset.title)"'
                        + ' onmousemove="moveCardTitleHover(event)"'
                        + ' onmouseleave="hideCardTitleHover()">'
                        + '<div class="category-title">' + safeCatHtml + '</div>'
                    + '</div>'
                    + titleMetaHtml
                + '</div>'
                + headerButtonsHtml
            + '</div>'
            + '<div id="' + libPanelId + '" class="lib-panel" style="display:none;"></div>'
            + listHtml
            + '<div class="category-footer"><span class="stat-pending">Pending: ' + Math.max(totalVisibleTasks - doneVisible, 0) + '</span><span class="stat-done">Done: ' + doneVisible + '</span></div>';
        card.setAttribute('data-card-target-id', cardTargetId);
        card.setAttribute('data-card-category', String(cat || 'Unsorted'));
        card.setAttribute('data-card-workspace', activeWorkspaceId);
        if (isDetachedParkingCard) {
            card.setAttribute('data-detached-parking-card', '1');
        }

        gridContainer.appendChild(card);

        if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
            window.EveFolderViewV2.restoreActiveFolderState(activeWorkspaceId, cat);
        }
    }

    Object.assign(api, { renderCard });
})();
