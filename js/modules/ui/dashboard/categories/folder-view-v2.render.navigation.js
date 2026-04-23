window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { escapeCardHtml, escapeCardJs, cloneGhostFilterChain } = shared;
    let pendingFolderEntryRetryKey = '';

    function getCategoryLinks(workspaceId, categoryName) {
        const scopeShared = window.EveFolderViewV2._shared || {};
        if (typeof scopeShared.getCategoryLinks === 'function') {
            return scopeShared.getCategoryLinks(workspaceId, categoryName);
        }
        const sourceLinks = typeof window.getLiveLinks === 'function'
            ? window.getLiveLinks()
            : (window.getModalLinks
                ? window.getModalLinks()
                : []);
        return (Array.isArray(sourceLinks) ? sourceLinks : []).filter((link) => (
            String(link?.workspace || 'main').trim() === String(workspaceId || 'main').trim()
            && String(link?.category || 'Unsorted').trim() === String(categoryName || 'Unsorted').trim()
        ));
    }

    window.EveFolderViewV2.enterFolder = function (event, categoryName, folderId, workspaceId, enterOptions) {
        const options = enterOptions && typeof enterOptions === 'object' ? enterOptions : {};
        const preservePageScroll = options.preservePageScroll !== false;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const resolvedCategoryName = String(categoryName || '').trim();
        const resolvedWorkspaceId = String(workspaceId || '').trim();
        const card = document.querySelector(`.category-card[data-card-category="${CSS.escape(resolvedCategoryName)}"][data-card-workspace="${CSS.escape(resolvedWorkspaceId)}"]`);
        
        if (!card) {
            // If the card is mid-rerender, retry once after forcing a fresh dashboard pass.
            if (!event && !window._evePerfMode && typeof window.renderDashboard === 'function') {
                const retryKey = `${resolvedWorkspaceId}::${resolvedCategoryName}::${String(folderId || '').trim()}`;
                if (pendingFolderEntryRetryKey !== retryKey) {
                    pendingFolderEntryRetryKey = retryKey;
                    window.renderDashboard();
                    window.setTimeout(function () {
                        if (pendingFolderEntryRetryKey !== retryKey) return;
                        pendingFolderEntryRetryKey = '';
                        window.EveFolderViewV2.enterFolder(null, resolvedCategoryName, folderId, resolvedWorkspaceId);
                    }, 80);
                    return;
                }
                window.renderDashboard();
            }
            return;
        }
        pendingFolderEntryRetryKey = '';

        const scrollBefore = preservePageScroll
            ? (window.pageYOffset || document.documentElement.scrollTop)
            : -1;

        const cacheKey = `${resolvedWorkspaceId}::${resolvedCategoryName}`;
        const cachedViewModel = window.EveFolderViewV2.getCachedViewModel(resolvedWorkspaceId, resolvedCategoryName);
        const cachedTargetNode = cachedViewModel?.nodes?.find((node) => String(node?.id || '') === String(folderId || ''));
        const scopeRootId = cachedTargetNode?.isGhost
            ? (cachedTargetNode?._ghostScopeRootId || window.eveState?.config?.activeManhwaScopeRoots?.[cacheKey] || null)
            : folderId;
        window.EveFolderViewV2.saveActiveFolderState(resolvedWorkspaceId, resolvedCategoryName, folderId, cloneGhostFilterChain(cachedTargetNode?._ghostFilterChain), scopeRootId);

        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return;

        // Reuse cached view model if available
        let viewModel = cachedViewModel;
        if (!viewModel || !viewModel.nodes || !viewModel.childrenMap) {
            const catLinks = getCategoryLinks(resolvedWorkspaceId, resolvedCategoryName);
            viewModel = folderApi.buildFolderView(resolvedWorkspaceId, resolvedCategoryName, catLinks);
            viewModel.scopedLinks = catLinks;
            window.EveFolderViewV2.setCachedViewModel(resolvedWorkspaceId, resolvedCategoryName, viewModel);
        }

        let trail = [{ label: resolvedCategoryName.toLowerCase(), id: null }];
        let currentNodeId = folderId;
        const pathNodes = [];
        while (currentNodeId) {
            const node = viewModel.nodes.find((entry) => entry.id === currentNodeId);
            if (!node) break;
            pathNodes.unshift({ label: node.name, id: node.id });
            currentNodeId = (node.parentId && node.parentId !== node.id && viewModel.nodes.some((entry) => entry.id === node.parentId)) ? node.parentId : null;
        }
        trail = trail.concat(pathNodes);

        const targetNode = viewModel.nodes.find((entry) => entry.id === folderId);
        if (!targetNode) return;

        const subFolders = viewModel.childrenMap.get(targetNode.id) || [];
        const folderItems = viewModel.folderLinks.get(targetNode.id) || [];
        const headerActionsExpanded = folderId ? window.EveFolderViewV2.isHeaderActionsExpanded(resolvedWorkspaceId, resolvedCategoryName, folderId) : false;

        // Section stats helper for Manhwa view
        const isCardTaskMode = typeof folderApi?.isCardTaskEnabled === 'function'
            ? !!folderApi.isCardTaskEnabled(resolvedWorkspaceId, resolvedCategoryName)
            : !(window.eveState?.config?.hideStats || []).includes(resolvedCategoryName);
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

        const isCardFoldersCollapsed = !!(window.eveState?.config?.foldersCollapsed || []).includes(resolvedCategoryName);
        const isCardLinksCollapsed = !!(window.eveState?.config?.linksCollapsed || []).includes(resolvedCategoryName);
        const isFolderSubfoldersCollapsed = !!(window.eveState?.config?.subfoldersCollapsed || []).includes(folderId);
        const isFolderSublinksCollapsed = !!(window.eveState?.config?.sublinksCollapsed || []).includes(folderId);

        const folderHeaderActionsHtml = folderId
            ? `<div class="folder-breadcrumb-actions">`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn ${isCardLinksCollapsed || isFolderSublinksCollapsed ? 'collapsed' : ''}" title="Toggle Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); toggleSublinksCollapse('${escapeCardJs(folderId)}');">&#128216;</button>`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn ${isCardFoldersCollapsed || isFolderSubfoldersCollapsed ? 'collapsed' : ''}" title="Toggle Subfolders" onclick="event.preventDefault(); event.stopPropagation(); toggleSubfoldersCollapse('${escapeCardJs(folderId)}');">&#128193;</button>`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(resolvedCategoryName)}" data-scope-workspace="${escapeCardHtml(resolvedWorkspaceId)}" data-scope-folder-id="${escapeCardHtml(folderId)}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(folderId)}');">&#9744;</button>`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn ${headerActionsExpanded ? 'active' : ''}" title="Folder Actions" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.toggleHeaderActions('${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folderId)}');">&#9998;</button>`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn" title="Constellation Map" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderScopedMap('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(resolvedWorkspaceId)}');">&#127756;</button>`
                + `</div>`
            : '';

        const editFolderButtonHtml = targetNode.isGhost
            ? ''
            : `<button type="button" class="folder-breadcrumb-action-btn" title="Edit Current Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(resolvedWorkspaceId)}');">&#9998; Edit Folder</button>`;

        const folderHeaderActionTrayHtml = (folderId && headerActionsExpanded)
            ? `<div class="folder-breadcrumb-action-tray">${editFolderButtonHtml}<button type="button" class="folder-breadcrumb-action-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(resolvedCategoryName)}" data-scope-workspace="${escapeCardHtml(resolvedWorkspaceId)}" data-scope-folder-id="${escapeCardHtml(folderId)}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(folderId)}');">&#9744; Select Subtree</button><button type="button" class="folder-breadcrumb-action-btn" title="Auto-Title Links" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkTitle('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(resolvedWorkspaceId)}');">&#127991; Auto-Title</button><button type="button" class="folder-breadcrumb-action-btn" title="Auto-Add Library Entries" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkLibraryAuto('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(resolvedWorkspaceId)}');">&#128214; Auto-Library</button></div>`
            : '';

        let breadcrumbsHtml = '<div class="folder-breadcrumbs"><div class="folder-breadcrumb-trail">';
        trail.forEach((trailEntry, index) => {
            if (index > 0) breadcrumbsHtml += '<span class="breadcrumb-separator">&#8250;</span>';
            const isLast = index === trail.length - 1;
            const clickAction = trailEntry.id
                ? `window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(trailEntry.id)}', '${escapeCardJs(resolvedWorkspaceId)}')`
                : `window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}')`;
            const dropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('breadcrumb-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(trailEntry.id || '')}', '${escapeCardJs(resolvedWorkspaceId)}')" ondragenter="event.currentTarget.classList.add('breadcrumb-drag-hover')" ondragleave="event.currentTarget.classList.remove('breadcrumb-drag-hover')"`;
            breadcrumbsHtml += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" onclick="${isLast ? '' : clickAction}" ${dropAction}>${escapeCardHtml(trailEntry.label.toUpperCase())}</span>`;
            if (isLast) breadcrumbsHtml += '<span class="breadcrumb-cursor"></span>';
        });
        breadcrumbsHtml += `</div>${folderHeaderActionsHtml}</div>${folderHeaderActionTrayHtml}`;

        let subFoldersHtml = '';
        if (subFolders.length > 0) {
            subFoldersHtml += `<div class="manhwa-divider folders-divider">FOLDERS</div><div class="folder-wrap-grid">${subFolders.map((folder) => {
                const isGhost = !!folder.isGhost;
                const folderDropAttr = isGhost ? '' : `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('folder-tile-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}')" ondragenter="event.currentTarget.classList.add('folder-tile-drag-hover')" ondragleave="event.currentTarget.classList.remove('folder-tile-drag-hover')"`;
                const dragStartAttr = isGhost ? '' : `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;
                const matchCount = viewModel.folderLinks.get(folder.id)?.length || 0;
                const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
                const statsLabel = isGhost
                    ? (childCount > 0 ? `${matchCount} matches | ${childCount} views` : `${matchCount} matches`)
                    : (childCount > 0 ? `${matchCount} items | ${childCount} folders` : `${matchCount} items`);
                const contextMenuAttr = isGhost ? '' : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}');"`;
                const editButtonHtml = isGhost
                    ? `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(resolvedCategoryName)}" data-scope-workspace="${escapeCardHtml(resolvedWorkspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Matching Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(folder.id)}');">&#9745;</button></div>`
                    : `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(resolvedCategoryName)}" data-scope-workspace="${escapeCardHtml(resolvedWorkspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(folder.id)}');">&#9745;</button><button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}');">&#9998;</button></div>`;
                return `<div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}" ${folderDropAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}')" ${contextMenuAttr}><div class="folder-tile-left-bar"></div><div class="folder-icon-box"><svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /></svg></div><div class="folder-tile-content"><div class="folder-tile-title">${escapeCardHtml(folder.name)}</div><div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div></div>${editButtonHtml}</div>`;
            }).join('')}</div>`;
        }

        let itemsHtml = '';
        if (folderItems.length > 0) {
            if (subFolders.length > 0) itemsHtml += '<div class="manhwa-divider items-divider">ITEMS</div>';
            const tvApi = window.EveTrueValue;
            const customOrderApi = window.EveCustomOrder;
            const tvEnabled = tvApi ? tvApi.isEnabled(resolvedWorkspaceId, resolvedCategoryName) : false;
            const coEnabled = customOrderApi ? customOrderApi.isEnabled(resolvedWorkspaceId, resolvedCategoryName) : false;
            const tvData = tvEnabled ? tvApi.computeTrueValues(folderItems, resolvedWorkspaceId, resolvedCategoryName) : null;

            const FOLDER_ITEM_CAP = window._evePerfMode ? 50 : folderItems.length;
            const cappedItems = folderItems.slice(0, FOLDER_ITEM_CAP);

            const flatHtml = cappedItems.map((link) => {
                const isTaskEnabled = typeof folderApi?.isTaskEnabledForLink === 'function' ? !!folderApi.isTaskEnabledForLink(link) : true;
                if (typeof window.DashboardCategories?.buildLinkHtml === 'function') {
                    return window.DashboardCategories.buildLinkHtml(link, '', resolvedWorkspaceId, window.eveState?.config?.workspaces || [], {
                        folderLabel: '',
                        isTaskEnabled,
                        customOrderEnabled: coEnabled,
                        customOrderWsId: resolvedWorkspaceId,
                        customOrderCategory: resolvedCategoryName,
                        trueValueEnabled: tvEnabled,
                        trueValueData: tvData
                    });
                }
                const jsId = escapeCardJs(String(link.id));
                return `<div class="item-row" style="display: flex; align-items: center; gap: 12px; padding: 10px 18px; cursor: pointer; border-left: 2px solid rgba(128,128,128,0.2);" onclick="if(typeof window.handleLinkClick === 'function') { window.handleLinkClick(event, '${jsId}', this); } else { window.open('${escapeCardJs(link.url)}', '_blank'); }"><span>${escapeCardHtml(link.icon || '🔗')}</span><span>${escapeCardHtml(link.title)}</span></div>`;
            }).join('');

            let showMoreHtml = '';
            if (folderItems.length > FOLDER_ITEM_CAP) {
                const remaining = folderItems.length - FOLDER_ITEM_CAP;
                const btnId = 'showMore_folder_' + String(folderId || '').replace(/[^a-zA-Z0-9]/g, '_');
                if (!window._eveProgressiveLinks) window._eveProgressiveLinks = {};
                window._eveProgressiveLinks[btnId] = { links: folderItems, offset: FOLDER_ITEM_CAP, focused: false };
                showMoreHtml = '<li class="eve-show-more-item" id="' + btnId + '">'
                    + '<button class="eve-show-more-btn" onclick="window._eveLoadMoreLinks(\'' + btnId + '\')">'
                    + '▾ Show ' + Math.min(remaining, 50) + ' more (' + remaining + ' remaining)'
                    + '</button></li>';
            }
            itemsHtml += `<div style="padding: 4px 0;"><ul class="category-scrollable" style="max-height: none; overflow: visible;">${flatHtml}${showMoreHtml}</ul>${buildSectionStats(folderItems)}</div>`;
        }
        if (subFolders.length === 0 && folderItems.length === 0) {
            itemsHtml = `<div style="padding: 20px; text-align: center; color: rgba(128,128,128,0.5); font-family: 'Share Tech Mono', monospace; font-size: 11px;">DATA NODE EMPTY</div>`;
        }

        const frameDropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('active'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(resolvedWorkspaceId)}')" ondragenter="event.currentTarget.classList.add('active')" ondragleave="event.currentTarget.classList.remove('active')"`;
        const subfoldersCollapsedClass = (isCardFoldersCollapsed || isFolderSubfoldersCollapsed) ? ' subfolders-collapsed' : '';
        const sublinksCollapsedClass = (isCardLinksCollapsed || isFolderSublinksCollapsed) ? ' sublinks-collapsed' : '';
        const frameHtml = `${breadcrumbsHtml}<div class="manhwa-frame ${subfoldersCollapsedClass}${sublinksCollapsedClass}" ${frameDropAction}><div class="manhwa-frame-top-beam"></div><div class="manhwa-frame-left-glow"></div><div class="manhwa-scan-beam"></div><svg width="10" height="10" style="position: absolute; top: 6px; left: 6px;"><polyline points="8,1 1,1 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; top: 6px; right: 6px;"><polyline points="1,1 8,1 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; bottom: 6px; left: 6px;"><polyline points="1,1 1,8 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; bottom: 6px; right: 6px;"><polyline points="8,1 8,8 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><div style="position: relative; z-index: 1;"><div class="bookmark-folder-subfolders">${subFoldersHtml}</div><div class="bookmark-folder-links">${itemsHtml}</div></div></div><div style="margin-top: 10px; cursor: pointer; color: rgba(128,128,128,0.6); font-family: 'Share Tech Mono', monospace; font-size: 10px;" onclick="window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}')">‹ SYSTEM ROOT</div>`;

        if (!card.dataset.mode1Html) {
            const libPanel = card.querySelector('.lib-panel');
            const contentWrapper = Array.from(card.children).find((element) => element !== libPanel && !element.classList.contains('category-header') && !element.classList.contains('cat-progress-bg') && !element.classList.contains('category-footer'));
            if (contentWrapper) {
                card.dataset.mode1Html = contentWrapper.outerHTML;
                contentWrapper.outerHTML = `<div class="v2-folder-container" style="padding: 0 10px 10px;">${frameHtml}</div>`;
            }
        } else {
            const v2Container = card.querySelector('.v2-folder-container');
            if (v2Container) v2Container.innerHTML = frameHtml;
        }

        if (typeof window.scheduleDashboardMasonryLayout === 'function') {
            window.scheduleDashboardMasonryLayout(card.parentElement || document.getElementById('dashboard-grid'));
        }
        
        // Final fallback to ensure scroll doesn't jump away from the user
        if (
            preservePageScroll
            && scrollBefore >= 0
            && Math.abs((window.pageYOffset || document.documentElement.scrollTop) - scrollBefore) > 100
        ) {
            if (typeof window.markDashboardProgrammaticScrollWindow === 'function') {
                window.markDashboardProgrammaticScrollWindow(48);
            }
            window.scrollTo(0, scrollBefore);
        }
    };

    window.EveFolderViewV2.exitFolder = function (event, categoryName, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const resolvedCategoryName = String(categoryName || '').trim();
        const resolvedWorkspaceId = String(workspaceId || '').trim();
        const scrollBefore = window.pageYOffset || document.documentElement.scrollTop;

        window.EveFolderViewV2.saveActiveFolderState(resolvedWorkspaceId, resolvedCategoryName, null, null, null);

        const card = document.querySelector(`.category-card[data-card-category="${CSS.escape(resolvedCategoryName)}"][data-card-workspace="${CSS.escape(resolvedWorkspaceId)}"]`);
        if (!card) {
            if (!window._evePerfMode && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }
        if (!card.dataset.mode1Html) {
            if (!window._evePerfMode && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        const v2Container = card.querySelector('.v2-folder-container');
        if (v2Container) {
            v2Container.outerHTML = card.dataset.mode1Html;
            delete card.dataset.mode1Html;
        }

        if (typeof window.scheduleDashboardMasonryLayout === 'function') {
            window.scheduleDashboardMasonryLayout(card.parentElement || document.getElementById('dashboard-grid'));
        }
        
        if (Math.abs((window.pageYOffset || document.documentElement.scrollTop) - scrollBefore) > 100) {
            window.scrollTo(0, scrollBefore);
        }

        if (!window._evePerfMode) {
            const folderApi = window.EveBookmarkFolders;
            if (folderApi?.buildFolderView) {
                const catLinks = getCategoryLinks(resolvedWorkspaceId, resolvedCategoryName);
                window.EveFolderViewV2.setCachedViewModel(resolvedWorkspaceId, resolvedCategoryName, Object.assign(folderApi.buildFolderView(resolvedWorkspaceId, resolvedCategoryName, catLinks), { scopedLinks: catLinks }));
            }
        }
    };
})();
