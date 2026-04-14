window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    var {
        escapeCardHtml,
        escapeCardJs,
        buildFolderAction,
        getFolderActionExpansionStore,
        buildFolderActionExpansionKey,
        isFolderActionExpanded
    } = api;

function buildFolderSectionsHtml(categoryName, linksForCard, options, renderer) {
        const folderApi = window.EveBookmarkFolders;
        const isDetachedParkingCard = !!options?.detachedParkingCard;
        const readOnlyFolders = !!options?.readOnlyFolders && !isDetachedParkingCard;
        const virtualFolderViewModel = options?.virtualFolderViewModel || null;
        if (!virtualFolderViewModel && !folderApi?.buildFolderView) {
            return renderer(linksForCard);
        }

        const workspaceId = String(options.activeWorkspace || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
        const viewModel = virtualFolderViewModel || folderApi.buildFolderView(workspaceId, categoryName, linksForCard, { skipGhosts: !!options?.skipGhosts });
        if (window.EveFolderViewV2?.setCachedViewModel) {
            window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);
        }

        // Skip Manhwa Navigation mode for sub-tab folders in parent view — tree view is used instead
        // because Manhwa mode's DOM replacement doesn't work when the card has mixed-workspace content.
        const isSubTabInParentView = !!options?.isSubTabInParentView;
        if (!isDetachedParkingCard && !readOnlyFolders && !isSubTabInParentView && window.EveFolderViewV2 && window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName)) {
            return window.EveFolderViewV2.renderRootGrid(workspaceId, categoryName, viewModel, renderer);
        }

        const safeCategoryJs = escapeCardJs(categoryName);
        const safeWorkspaceJs = escapeCardJs(workspaceId);
        const toolbarExpanded = !!folderApi.isToolbarExpanded?.(workspaceId, categoryName);

        function buildDropTargetAttributes(targetFolderId, detachedEntryId) {
            if (readOnlyFolders) return '';
            const safeFolderId = escapeCardJs(targetFolderId || '');
            const safeDetachedEntryId = escapeCardJs(detachedEntryId || '');
            if (isDetachedParkingCard) {
                if (!safeDetachedEntryId) {
                    return 'ondragover="allowDrop(event)" '
                        + 'ondrop="event.currentTarget.classList.remove(\'bookmark-folder-drop-target\'); if(window.EveConstellationMap&&window.EveConstellationMap._detached&&typeof window.EveConstellationMap._detached.handleDashboardParkingDrop===\'function\') window.EveConstellationMap._detached.handleDashboardParkingDrop(event, \'' + safeWorkspaceJs + '\')"'
                        + ' ondragenter="event.currentTarget.classList.add(\'bookmark-folder-drop-target\')"'
                        + ' ondragleave="event.currentTarget.classList.remove(\'bookmark-folder-drop-target\')"';
                }
                return 'ondragover="allowDrop(event)" '
                    + `ondrop="event.currentTarget.classList.remove('bookmark-folder-drop-target'); if(window.EveConstellationMap&&window.EveConstellationMap._detached&&typeof window.EveConstellationMap._detached.handleDashboardDetachedFolderDrop==='function') window.EveConstellationMap._detached.handleDashboardDetachedFolderDrop(event, '${safeDetachedEntryId}', '${safeFolderId}')"`
                    + ' ondragenter="event.currentTarget.classList.add(\'bookmark-folder-drop-target\')"'
                    + ' ondragleave="event.currentTarget.classList.remove(\'bookmark-folder-drop-target\')"';
            }
            return 'ondragover="allowDrop(event)" '
                + `ondrop="event.currentTarget.classList.remove('bookmark-folder-drop-target'); moveBookmarksToFolderDrop(event, '${safeCategoryJs}', '${safeFolderId}', '${safeWorkspaceJs}')"`
                + ' ondragenter="event.currentTarget.classList.add(\'bookmark-folder-drop-target\')"'
                + ' ondragleave="event.currentTarget.classList.remove(\'bookmark-folder-drop-target\')"';
        }

        // Section-scoped stats helper
        const isCardTaskMode = !Array.isArray(options.hideStats) || !options.hideStats.includes(categoryName);
        function buildSectionStats(sectionLinks) {
            if (!isCardTaskMode || !sectionLinks.length) return '';
            var taskLinks = sectionLinks.filter(function (l) {
                if (typeof folderApi?.isTaskEnabledForLink === 'function') return !!folderApi.isTaskEnabledForLink(l);
                return isCardTaskMode;
            });
            if (!taskLinks.length) return '';
            var done = taskLinks.filter(function (l) { return !!l.done; }).length;
            var pending = taskLinks.length - done;
            return '<div class="bookmark-folder-section-stats">'
                + '<span class="section-stat-pending">Pending: ' + pending + '</span>'
                + '<span class="section-stat-done">Done: ' + done + '</span>'
                + '</div>';
        }

        function renderFolderNode(node) {
            const folderLinks = viewModel.folderLinks.get(node.id) || [];
            const childFolders = viewModel.childrenMap.get(node.id) || [];
            const childHtml = childFolders.map(renderFolderNode).join('');
            const isGhostNode = !!node.isGhost;
            const folderCountLabel = isGhostNode
                ? `${folderLinks.length} match${folderLinks.length === 1 ? '' : 'es'}`
                : `${folderLinks.length} bookmark${folderLinks.length === 1 ? '' : 's'}`;
            const childCountLabel = isGhostNode
                ? `${childFolders.length} view${childFolders.length === 1 ? '' : 's'}`
                : `${childFolders.length} subfolder${childFolders.length === 1 ? '' : 's'}`;
            const folderTargetId = window.EveQuickPins?.buildFolderTargetId
                ? window.EveQuickPins.buildFolderTargetId(workspaceId, categoryName, node.id)
                : '';
            const actionsExpanded = isFolderActionExpanded(workspaceId, categoryName, node.id);
            const actionsExpandedAttr = actionsExpanded ? 'true' : 'false';
            const actionsHiddenAttr = actionsExpanded ? '' : ' hidden';
            const dragStartAttr = (function () {
                if (isGhostNode || readOnlyFolders) return '';
                if (isDetachedParkingCard) {
                    if (!node.detachedEntryRoot || !node.detachedEntryId) return '';
                    return `draggable="true" ondragstart="if(window.EveConstellationMap&&window.EveConstellationMap._detached&&typeof window.EveConstellationMap._detached.handleDetachedFolderDragStart==='function') window.EveConstellationMap._detached.handleDetachedFolderDragStart(event, '${escapeCardJs(node.detachedEntryId)}', '${escapeCardJs(node.detachedOriginalId || '')}')" ondragend="this.classList.remove('is-dragging')"`;
                }
                return `draggable="true" ondragstart="if(typeof window.EveFolderViewV2?.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(node.id)}', '${safeCategoryJs}', '${safeWorkspaceJs}')" ondragend="this.classList.remove('is-dragging')"`;
            })();
            const dropTargetAttributes = isGhostNode ? '' : buildDropTargetAttributes(node.id, node.detachedEntryId || '');
            const isSubfoldersCollapsed = !!(window.eveState?.config?.subfoldersCollapsed || []).includes(node.id);
            const isSublinksCollapsed = !!(window.eveState?.config?.sublinksCollapsed || []).includes(node.id);
            const subfoldersCollapsedClass = isSubfoldersCollapsed ? ' subfolders-collapsed' : '';
            const sublinksCollapsedClass = isSublinksCollapsed ? ' sublinks-collapsed' : '';

            const summaryActionsHtml = (isGhostNode || readOnlyFolders || isDetachedParkingCard)
                ? ''
                : ''
                    + '<div class="bookmark-folder-summary-actions">'
                        + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle${sublinksCollapsedClass ? ' is-collapsed' : ''}" title="Toggle Bookmarks" onclick="event.preventDefault();event.stopPropagation();toggleSublinksCollapse('${escapeCardJs(node.id)}')">&#128216;</button>`
                        + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle${subfoldersCollapsedClass ? ' is-collapsed' : ''}" title="Toggle Subfolders" onclick="event.preventDefault();event.stopPropagation();toggleSubfoldersCollapse('${escapeCardJs(node.id)}')">&#128193;</button>`
                        + `<button type="button" class="bookmark-folder-inline-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(categoryName)}" data-scope-workspace="${escapeCardHtml(workspaceId)}" data-scope-folder-id="${escapeCardHtml(node.id)}" title="Select this folder subtree" onclick="event.preventDefault();event.stopPropagation();bulkToggleFolderScopeSelection('${safeCategoryJs}', '${safeWorkspaceJs}', '${escapeCardJs(node.id)}')">&#9744;</button>`
                        + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle" aria-expanded="${actionsExpandedAttr}" onclick="event.preventDefault();event.stopPropagation();toggleCategoryCardFolderActions(this, '${safeCategoryJs}', '${escapeCardJs(node.id)}', '${safeWorkspaceJs}')">&#9998;</button>`
                        + `<div class="bookmark-folder-summary-action-list"${actionsHiddenAttr}>`
                            + `<button type="button" class="bookmark-folder-inline-btn" onclick="${buildFolderAction(categoryName, node.id, 'openAddModalForFolder')}">Add</button>`
                            + `<button type="button" class="bookmark-folder-inline-btn" onclick="${buildFolderAction(categoryName, node.id, 'promptCreateBookmarkFolder')}">Subfolder</button>`
                            + `<button type="button" class="bookmark-folder-inline-btn" onclick="${buildFolderAction(categoryName, node.id, 'promptRenameBookmarkFolder')}">Rename</button>`
                            + `<button type="button" class="bookmark-folder-inline-btn danger" onclick="${buildFolderAction(categoryName, node.id, 'deleteBookmarkFolderPrompt')}">Delete</button>`
                        + '</div>'
                    + '</div>';
            const bodyContentHtml = folderLinks.length
                ? renderer(folderLinks)
                : (isGhostNode && childFolders.length
                    ? ''
                    : '<div class="bookmark-folder-empty">No bookmarks in this folder yet.</div>');

            return ''
                + `<details class="bookmark-folder-group${isGhostNode ? ' is-ghost-folder-group' : ''}${subfoldersCollapsedClass}${sublinksCollapsedClass}" open data-bookmark-folder-target-id="${escapeCardHtml(folderTargetId)}" data-detached-entry-id="${escapeCardHtml(node.detachedEntryId || '')}" ${dropTargetAttributes} ${dragStartAttr}>`

                    + '<summary class="bookmark-folder-summary">'
                        + '<div class="bookmark-folder-summary-copy">'
                            + `<span class="bookmark-folder-title">${escapeCardHtml(node.name)}</span>`
                            + `<span class="bookmark-folder-meta">${escapeCardHtml(folderCountLabel)} | ${escapeCardHtml(childCountLabel)}</span>`
                        + '</div>'
                        + summaryActionsHtml
                    + '</summary>'
                    + '<div class="bookmark-folder-body">'
                        + '<div class="bookmark-folder-links">' + bodyContentHtml + '</div>'
                        + '<div class="bookmark-folder-subfolders">' + childHtml + '</div>'
                        + buildSectionStats(folderLinks)
                    + '</div>'
                + '</details>';
        }

        const topLevelHtml = (viewModel.topLevelFolders || []).map(renderFolderNode).join('');
        const hasFolders = viewModel.nodes.length > 0;
        const hasRootLinks = viewModel.rootLinks.length > 0;
        const rootActionsExpanded = isFolderActionExpanded(workspaceId, categoryName, '__root__');
        const rootActionsExpandedAttr = rootActionsExpanded ? 'true' : 'false';
        const rootActionsHiddenAttr = rootActionsExpanded ? '' : ' hidden';
        const toolbarHtml = (readOnlyFolders || isDetachedParkingCard)
            ? ''
            : ''
            + `<div class="bookmark-folder-toolbar${toolbarExpanded ? ' is-visible' : ''}">`
                + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="promptCreateBookmarkFolder('${safeCategoryJs}', '')">New Folder</button>`
                + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="openBookmarkFolders('${safeCategoryJs}')">Manage Folders</button>`
            + '</div>';

        const isRootSubfoldersCollapsed = !!(window.eveState?.config?.subfoldersCollapsed || []).includes('__root__::' + categoryName);
        const isRootSublinksCollapsed = !!(window.eveState?.config?.sublinksCollapsed || []).includes('__root__::' + categoryName);
        const rootSubfoldersCollapsedClass = isRootSubfoldersCollapsed ? ' subfolders-collapsed' : '';
        const rootSublinksCollapsedClass = isRootSublinksCollapsed ? ' sublinks-collapsed' : '';

        if (!hasFolders) {
            return toolbarHtml + renderer(viewModel.rootLinks);
        }

        return ''
            + toolbarHtml
            + '<div class="bookmark-folder-sections">'
                + `<div class="bookmark-folder-root-group${rootSubfoldersCollapsedClass}${rootSublinksCollapsedClass}" ${buildDropTargetAttributes('', '')}>`
                    + '<div class="bookmark-folder-root-header">'
                        + '<div class="bookmark-folder-root-copy">'
                            + '<span class="bookmark-folder-root-title">Root Bookmarks</span>'
                            + `<span class="bookmark-folder-meta">${viewModel.rootLinks.length} bookmark${viewModel.rootLinks.length === 1 ? '' : 's'}</span>`
                        + '</div>'
                        + (readOnlyFolders || isDetachedParkingCard
                            ? ''
                            : '<div class="bookmark-folder-summary-actions">'
                                + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle${rootSublinksCollapsedClass ? ' is-collapsed' : ''}" title="Toggle Bookmarks" onclick="event.preventDefault();event.stopPropagation();toggleSublinksCollapse('__root__::${safeCategoryJs}')">&#128216;</button>`
                                + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle${rootSubfoldersCollapsedClass ? ' is-collapsed' : ''}" title="Toggle Subfolders" onclick="event.preventDefault();event.stopPropagation();toggleSubfoldersCollapse('__root__::${safeCategoryJs}')">&#128193;</button>`
                                + `<button type="button" class="bookmark-folder-inline-btn bookmark-folder-summary-edit-toggle" aria-expanded="${rootActionsExpandedAttr}" onclick="event.preventDefault();event.stopPropagation();toggleCategoryCardFolderActions(this, '${safeCategoryJs}', '__root__', '${safeWorkspaceJs}')">&#9998;</button>`
                                + `<div class="bookmark-folder-summary-action-list"${rootActionsHiddenAttr}>`
                                    + `<button type="button" class="bookmark-folder-inline-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(categoryName)}" data-scope-workspace="${escapeCardHtml(workspaceId)}" data-scope-folder-id="" title="Select root bookmarks in this card" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${safeCategoryJs}', '${safeWorkspaceJs}', '')">Select Root</button>`
                                    + `<button type="button" class="bookmark-folder-inline-btn" onclick="openAddModal('${safeCategoryJs}')">Add Root</button>`
                                + '</div>'
                            + '</div>')
                    + '</div>'
                    + '<div class="bookmark-folder-body">'
                        + '<div class="bookmark-folder-links">'
                            + (hasRootLinks
                                ? renderer(viewModel.rootLinks)
                                : '<div class="bookmark-folder-empty">No root bookmarks in this card.</div>')
                        + '</div>'
                        + buildSectionStats(viewModel.rootLinks)
                    + '</div>'
                + '</div>'
                + topLevelHtml
            + '</div>';
    }

    function toggleCategoryCardFolderActions(triggerEl, categoryName, folderId, workspaceId) {
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

    

    Object.assign(api, {
        buildFolderSectionsHtml,
        toggleCategoryCardFolderActions
    });
})();
