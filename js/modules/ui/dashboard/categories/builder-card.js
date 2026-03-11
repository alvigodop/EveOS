window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var DEFAULT_CARD_HEADER_BUTTONS = ['add', 'folders', 'library', 'focus', 'launch'];
    window.categoryCardFolderActionExpansion = window.categoryCardFolderActionExpansion || {};

    function escapeCardHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeCardJs(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function ensureCardTitleHoverOverlay() {
        var overlay = document.getElementById('category-title-hover-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'category-title-hover-overlay';
        overlay.className = 'category-title-hover-overlay';
        document.body.appendChild(overlay);
        return overlay;
    }

    function positionCardTitleHoverOverlay(target, overlay) {
        if (!target || !overlay) return;

        var rect = target.getBoundingClientRect();
        var viewportPadding = 8;
        var top = rect.top - overlay.offsetHeight - 10;
        if (top < viewportPadding) {
            top = rect.bottom + 10;
        }

        var left = rect.left;
        var maxLeft = window.innerWidth - overlay.offsetWidth - viewportPadding;
        if (left > maxLeft) left = maxLeft;
        if (left < viewportPadding) left = viewportPadding;

        overlay.style.top = Math.round(top) + 'px';
        overlay.style.left = Math.round(left) + 'px';
    }

    function showCardTitleHover(event, titleText) {
        var target = event && event.currentTarget;
        if (!target || !titleText) return;

        var overlay = ensureCardTitleHoverOverlay();
        overlay.textContent = String(titleText);
        overlay.classList.add('is-visible');
        positionCardTitleHoverOverlay(target, overlay);
    }

    function moveCardTitleHover(event) {
        var target = event && event.currentTarget;
        var overlay = document.getElementById('category-title-hover-overlay');
        if (!target || !overlay || !overlay.classList.contains('is-visible')) return;
        positionCardTitleHoverOverlay(target, overlay);
    }

    function hideCardTitleHover() {
        var overlay = document.getElementById('category-title-hover-overlay');
        if (!overlay) return;
        overlay.classList.remove('is-visible');
    }

    function buildFolderAction(categoryName, folderId, action) {
        const safeCategory = escapeCardJs(categoryName);
        const safeFolderId = escapeCardJs(folderId);
        return `event.preventDefault();event.stopPropagation();${action}('${safeCategory}', '${safeFolderId}')`;
    }

    function getFolderActionExpansionStore() {
        if (!window.categoryCardFolderActionExpansion || typeof window.categoryCardFolderActionExpansion !== 'object') {
            window.categoryCardFolderActionExpansion = {};
        }
        return window.categoryCardFolderActionExpansion;
    }

    function buildFolderActionExpansionKey(workspaceId, categoryName, folderId) {
        return [
            String(workspaceId || 'main').trim() || 'main',
            String(categoryName || 'Unsorted').trim() || 'Unsorted',
            String(folderId || '').trim()
        ].join('::');
    }

    function isFolderActionExpanded(workspaceId, categoryName, folderId) {
        return !!getFolderActionExpansionStore()[buildFolderActionExpansionKey(workspaceId, categoryName, folderId)];
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        if (window.EveBookmarkFolders?.buildScopedKey) {
            return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
        }
        var safeWorkspace = String(workspaceId || 'main').trim() || 'main';
        var safeCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return safeWorkspace + '::' + safeCategory;
    }

    function getCardHeaderButtonStore() {
        if (!window.eveState?.config) return {};
        if (!window.eveState.config.cardHeaderButtonsVisible || typeof window.eveState.config.cardHeaderButtonsVisible !== 'object' || Array.isArray(window.eveState.config.cardHeaderButtonsVisible)) {
            window.eveState.config.cardHeaderButtonsVisible = {};
        }
        return window.eveState.config.cardHeaderButtonsVisible;
    }

    function normalizeHeaderButtons(buttonIds) {
        var allowed = new Set(DEFAULT_CARD_HEADER_BUTTONS);
        return Array.from(new Set((Array.isArray(buttonIds) ? buttonIds : []).map(function (entry) {
            return String(entry || '').trim().toLowerCase();
        }).filter(function (entry) {
            return allowed.has(entry);
        })));
    }

    function getCardHeaderButtonsForCategory(workspaceId, categoryName) {
        var scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        var store = getCardHeaderButtonStore();
        if (!Object.prototype.hasOwnProperty.call(store, scopedKey)) {
            return DEFAULT_CARD_HEADER_BUTTONS.slice();
        }
        return normalizeHeaderButtons(store[scopedKey]);
    }

    function setCardHeaderButtonsForCategory(workspaceId, categoryName, buttonIds) {
        var scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        var store = getCardHeaderButtonStore();
        var normalizedButtons = normalizeHeaderButtons(buttonIds);
        if (normalizedButtons.length === DEFAULT_CARD_HEADER_BUTTONS.length) {
            delete store[scopedKey];
        } else {
            store[scopedKey] = normalizedButtons;
        }
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        return getCardHeaderButtonsForCategory(workspaceId, categoryName);
    }

    function buildFolderSectionsHtml(categoryName, linksForCard, options, renderer) {
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) {
            return renderer(linksForCard);
        }

        const workspaceId = String(options.activeWorkspace || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, linksForCard);
        
        // If Manhwa Mode (Navigation View) is active for this card, use the V2 Root Grid instead of the tree.
        if (window.EveFolderViewV2 && window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName)) {
            return window.EveFolderViewV2.renderRootGrid(workspaceId, categoryName, viewModel, renderer);
        }

        const safeCategoryJs = escapeCardJs(categoryName);
        const safeWorkspaceJs = escapeCardJs(workspaceId);
        const toolbarExpanded = !!folderApi.isToolbarExpanded?.(workspaceId, categoryName);

        function buildDropTargetAttributes(targetFolderId) {
            const safeFolderId = escapeCardJs(targetFolderId || '');
            return 'ondragover="if(typeof allowDrop===\'function\')allowDrop(event)" '
                + `ondrop="event.currentTarget.classList.remove('bookmark-folder-drop-target'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${safeCategoryJs}', '${safeFolderId}', '${safeWorkspaceJs}')"`
                + ' ondragenter="event.currentTarget.classList.add(\'bookmark-folder-drop-target\')"'
                + ' ondragleave="event.currentTarget.classList.remove(\'bookmark-folder-drop-target\')"';
        }

        function renderFolderNode(node) {
            const folderLinks = viewModel.folderLinks.get(node.id) || [];
            const childFolders = viewModel.childrenMap.get(node.id) || [];
            const childHtml = childFolders.map(renderFolderNode).join('');
            const folderCountLabel = `${folderLinks.length} bookmark${folderLinks.length === 1 ? '' : 's'}`;
            const childCountLabel = `${childFolders.length} subfolder${childFolders.length === 1 ? '' : 's'}`;
            const folderTargetId = window.EveQuickPins?.buildFolderTargetId
                ? window.EveQuickPins.buildFolderTargetId(workspaceId, categoryName, node.id)
                : '';
            const actionsExpanded = isFolderActionExpanded(workspaceId, categoryName, node.id);
            const actionsExpandedAttr = actionsExpanded ? 'true' : 'false';
            const actionsHiddenAttr = actionsExpanded ? '' : ' hidden';

            const draggableAttr = `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(node.id)}', '${safeCategoryJs}', '${safeWorkspaceJs}')"`;

            return ''
                + `<details class="bookmark-folder-group" open data-bookmark-folder-target-id="${escapeCardHtml(folderTargetId)}" ${buildDropTargetAttributes(node.id)} ${draggableAttr}>`
                    + '<summary class="bookmark-folder-summary">'
                        + '<div class="bookmark-folder-summary-copy">'
                            + `<span class="bookmark-folder-title">${escapeCardHtml(node.name)}</span>`
                            + `<span class="bookmark-folder-meta">${escapeCardHtml(folderCountLabel)} | ${escapeCardHtml(childCountLabel)}</span>`
                        + '</div>'
                        + '<div class="bookmark-folder-summary-actions">'
                            + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle" aria-expanded="${actionsExpandedAttr}" onclick="event.preventDefault();event.stopPropagation();toggleCategoryCardFolderActions(this, '${safeCategoryJs}', '${escapeCardJs(node.id)}', '${safeWorkspaceJs}')">&#9998;</button>`
                            + `<div class="bookmark-folder-summary-action-list"${actionsHiddenAttr}>`
                                + `<button type="button" class="bookmark-folder-inline-btn" onclick="${buildFolderAction(categoryName, node.id, 'openAddModalForFolder')}">Add</button>`
                                + `<button type="button" class="bookmark-folder-inline-btn" onclick="${buildFolderAction(categoryName, node.id, 'promptCreateBookmarkFolder')}">Subfolder</button>`
                                + `<button type="button" class="bookmark-folder-inline-btn" onclick="${buildFolderAction(categoryName, node.id, 'promptRenameBookmarkFolder')}">Rename</button>`
                                + `<button type="button" class="bookmark-folder-inline-btn danger" onclick="${buildFolderAction(categoryName, node.id, 'deleteBookmarkFolderPrompt')}">Delete</button>`
                            + '</div>'
                        + '</div>'
                    + '</summary>'
                    + '<div class="bookmark-folder-body">'
                        + (folderLinks.length
                            ? renderer(folderLinks)
                            : '<div class="bookmark-folder-empty">No bookmarks in this folder yet.</div>')
                        + childHtml
                    + '</div>'
                + '</details>';
        }

        const topLevelHtml = (viewModel.topLevelFolders || []).map(renderFolderNode).join('');
        const hasFolders = viewModel.nodes.length > 0;
        const hasRootLinks = viewModel.rootLinks.length > 0;
        const rootActionsExpanded = isFolderActionExpanded(workspaceId, categoryName, '__root__');
        const rootActionsExpandedAttr = rootActionsExpanded ? 'true' : 'false';
        const rootActionsHiddenAttr = rootActionsExpanded ? '' : ' hidden';
        const toolbarHtml = ''
            + `<div class="bookmark-folder-toolbar${toolbarExpanded ? ' is-visible' : ''}">`
                + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="promptCreateBookmarkFolder('${safeCategoryJs}', '')">New Folder</button>`
                + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="openBookmarkFolders('${safeCategoryJs}')">Manage Folders</button>`
            + '</div>';

        if (!hasFolders) {
            return toolbarHtml + renderer(viewModel.rootLinks);
        }

        return ''
            + toolbarHtml
            + '<div class="bookmark-folder-sections">'
                + `<div class="bookmark-folder-root-group" ${buildDropTargetAttributes('')}>`
                    + '<div class="bookmark-folder-root-header">'
                        + '<div class="bookmark-folder-root-copy">'
                            + '<span class="bookmark-folder-root-title">Root Bookmarks</span>'
                            + `<span class="bookmark-folder-meta">${viewModel.rootLinks.length} bookmark${viewModel.rootLinks.length === 1 ? '' : 's'}</span>`
                        + '</div>'
                        + '<div class="bookmark-folder-summary-actions">'
                            + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle" aria-expanded="${rootActionsExpandedAttr}" onclick="event.preventDefault();event.stopPropagation();toggleCategoryCardFolderActions(this, '${safeCategoryJs}', '__root__', '${safeWorkspaceJs}')">&#9998;</button>`
                            + `<div class="bookmark-folder-summary-action-list"${rootActionsHiddenAttr}>`
                                + `<button type="button" class="bookmark-folder-inline-btn" onclick="openAddModal('${safeCategoryJs}')">Add Root</button>`
                            + '</div>'
                        + '</div>'
                    + '</div>'
                    + (hasRootLinks
                        ? renderer(viewModel.rootLinks)
                        : '<div class="bookmark-folder-empty">No root bookmarks in this card.</div>')
                + '</div>'
                + topLevelHtml
            + '</div>';
    }

    window.toggleCategoryCardFolderActions = function (triggerEl, categoryName, folderId, workspaceId) {
        var resolvedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        var resolvedFolderId = String(folderId || '').trim();
        var resolvedWorkspace = String(workspaceId || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
        if (!resolvedFolderId) return;
        var store = getFolderActionExpansionStore();
        var key = buildFolderActionExpansionKey(resolvedWorkspace, resolvedCategory, resolvedFolderId);
        var nextExpanded = !store[key];
        store[key] = nextExpanded;

        var button = triggerEl && triggerEl.nodeType === 1 ? triggerEl : null;
        if (button) {
            button.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
            var actions = button.parentElement ? button.parentElement.querySelector('.bookmark-folder-summary-action-list') : null;
            if (actions) {
                actions.hidden = !nextExpanded;
            }
            var card = button.closest('.category-card');
            var grid = card ? card.parentElement : document.getElementById('dashboard-grid');
            if (grid && typeof window.scheduleDashboardMasonryLayout === 'function') {
                window.scheduleDashboardMasonryLayout(grid);
            }
            return;
        }

        if (typeof renderDashboard === 'function') renderDashboard();
    };

    window.DashboardCategories.renderCard = function (cat, catLinks, gridContainer, configOptions) {
        var options = configOptions || {};
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
                + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleCollapse(this.dataset.cat)">&#9660;</span>'
                + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', -1)">&#9650;</span>'
                + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', 1)">&#9660;</span>';

        var activeWorkspaceId = String(options.activeWorkspace || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
        var cardTargetId = window.EveQuickPins?.buildCardTargetId
            ? window.EveQuickPins.buildCardTargetId(activeWorkspaceId, cat)
            : buildScopedCategoryKey(activeWorkspaceId, cat);
        var visibleHeaderButtons = new Set(getCardHeaderButtonsForCategory(activeWorkspaceId, cat));
        var nonFocusButtons = [];
        if (visibleHeaderButtons.has('add')) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="openAddModal(\'' + safeCatJs + '\')" title="Add Bookmark">&#10133;</button>');
        }
        if (visibleHeaderButtons.has('folders')) {
            nonFocusButtons.push('<button class="' + (folderToolbarExpanded ? 'card-header-icon-btn card-folder-toggle-btn is-active' : 'card-header-icon-btn card-folder-toggle-btn') + '" data-folder-toolbar-toggle="1" onclick="toggleBookmarkFolderToolbar(\'' + safeCatJs + '\', \'' + escapeCardJs(options.activeWorkspace || 'main') + '\')" title="Folders">&#128193;</button>');
        }
        if (visibleHeaderButtons.has('library')) {
            nonFocusButtons.push('<button class="card-header-icon-btn lib-toggle-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218;</button>');
        }
        if (visibleHeaderButtons.has('focus')) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="setFocus(\'' + safeCatJs + '\')" title="Focus">&#127919;</button>');
        }
        nonFocusButtons.push('<button class="card-header-icon-btn" onclick="openCategorySettings(\'' + safeCatJs + '\')" title="Settings">&#9881;</button>');
        if (visibleHeaderButtons.has('launch')) {
            nonFocusButtons.push('<button class="card-header-icon-btn launch-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640;</button>');
        }

        var headerButtonsHtml = isFocusMode
            ? ''
                + '<div class="focus-card-controls">'
                    + (visibleHeaderButtons.has('add')
                        ? '<button class="category-action-btn" onclick="openAddModal(\'' + safeCatJs + '\')" title="Add Bookmark">&#10133; <span>Add</span></button>'
                        : '')
                    + (visibleHeaderButtons.has('folders')
                        ? '<button class="' + folderHeaderBtnClass + '" data-folder-toolbar-toggle="1" onclick="toggleBookmarkFolderToolbar(\'' + safeCatJs + '\', \'' + escapeCardJs(options.activeWorkspace || 'main') + '\')" title="Folders">&#128193; <span>Folders</span></button>'
                        : '')
                    + (visibleHeaderButtons.has('library')
                        ? '<button class="category-action-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218; <span>Library</span></button>'
                        : '')
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
                    + '<button class="category-action-btn" onclick="openCategorySettings(\'' + safeCatJs + '\')" title="Settings">&#9881; <span>Settings</span></button>'
                    + (visibleHeaderButtons.has('launch')
                        ? '<button class="category-action-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640; <span>Launch</span></button>'
                        : '')
                + '</div>'
            : ''
                + '<div class="card-header-icon-row">'
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

        gridContainer.appendChild(card);
        
        if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
            window.EveFolderViewV2.restoreActiveFolderState(activeWorkspaceId, cat);
        }
    };

    window.DashboardCategories.getCardHeaderButtonsForCategory = getCardHeaderButtonsForCategory;
    window.DashboardCategories.setCardHeaderButtonsForCategory = setCardHeaderButtonsForCategory;
    window.DashboardCategories.cardHeaderButtonOptions = DEFAULT_CARD_HEADER_BUTTONS.slice();
    window.showCardTitleHover = showCardTitleHover;
    window.moveCardTitleHover = moveCardTitleHover;
    window.hideCardTitleHover = hideCardTitleHover;
})();
