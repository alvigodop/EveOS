window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { escapeCardHtml, escapeCardJs, cloneGhostFilterChain } = shared;

    window.EveFolderViewV2.enterFolder = function (event, categoryName, folderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const card = document.querySelector(`.category-card[data-card-category="${escapeCardHtml(categoryName)}"][data-card-workspace="${escapeCardHtml(workspaceId)}"]`);
        if (!card) return;

        const cacheKey = `${workspaceId}::${categoryName}`;
        const cachedViewModel = window.EveFolderViewV2.getCachedViewModel(workspaceId, categoryName);
        const cachedTargetNode = cachedViewModel?.nodes?.find((node) => String(node?.id || '') === String(folderId || ''));
        const scopeRootId = cachedTargetNode?.isGhost
            ? (cachedTargetNode?._ghostScopeRootId || window.eveState?.config?.activeManhwaScopeRoots?.[cacheKey] || null)
            : folderId;
        window.EveFolderViewV2.saveActiveFolderState(workspaceId, categoryName, folderId, cloneGhostFilterChain(cachedTargetNode?._ghostFilterChain), scopeRootId);

        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return;

        const catLinks = window.getModalLinks
            ? window.getModalLinks().filter((link) => link.workspace === workspaceId && link.category === categoryName)
            : [];
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, catLinks);
        viewModel.scopedLinks = catLinks;
        window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);

        let trail = [{ label: categoryName.toLowerCase(), id: null }];
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
        const headerActionsExpanded = folderId ? window.EveFolderViewV2.isHeaderActionsExpanded(workspaceId, categoryName, folderId) : false;

        const isCardFoldersCollapsed = !!(window.eveState?.config?.foldersCollapsed || []).includes(categoryName);
        const isCardLinksCollapsed = !!(window.eveState?.config?.linksCollapsed || []).includes(categoryName);
        const isFolderSubfoldersCollapsed = !!(window.eveState?.config?.subfoldersCollapsed || []).includes(folderId);
        const isFolderSublinksCollapsed = !!(window.eveState?.config?.sublinksCollapsed || []).includes(folderId);

        const folderHeaderActionsHtml = folderId
            ? `<div class="folder-breadcrumb-actions">`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn ${isCardLinksCollapsed || isFolderSublinksCollapsed ? 'collapsed' : ''}" title="Toggle Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); toggleSublinksCollapse('${escapeCardJs(folderId)}');">&#128216;</button>`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn ${isCardFoldersCollapsed || isFolderSubfoldersCollapsed ? 'collapsed' : ''}" title="Toggle Subfolders" onclick="event.preventDefault(); event.stopPropagation(); toggleSubfoldersCollapse('${escapeCardJs(folderId)}');">&#128193;</button>`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn ${headerActionsExpanded ? 'active' : ''}" title="Folder Actions" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.toggleHeaderActions('${escapeCardJs(workspaceId)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}');">&#9998;</button>`
                + `<button type="button" class="folder-tile-edit-btn folder-breadcrumb-icon-btn" title="Constellation Map" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderScopedMap('${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">&#127756;</button>`
                + `</div>`
            : '';

        const editFolderButtonHtml = targetNode.isGhost
            ? ''
            : `<button type="button" class="folder-breadcrumb-action-btn" title="Edit Current Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">&#9998; Edit Folder</button>`;

        const folderHeaderActionTrayHtml = (folderId && headerActionsExpanded)
            ? `<div class="folder-breadcrumb-action-tray">${editFolderButtonHtml}<button type="button" class="folder-breadcrumb-action-btn bulk-scope-btn" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folderId)}');">&#9745; Select Subtree</button><button type="button" class="folder-breadcrumb-action-btn" title="Auto-Title Links" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkTitle('${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">&#127991; Auto-Title</button><button type="button" class="folder-breadcrumb-action-btn" title="Auto-Add Library Entries" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkLibraryAuto('${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}');">&#128214; Auto-Library</button></div>`
            : '';

        let breadcrumbsHtml = '<div class="folder-breadcrumbs"><div class="folder-breadcrumb-trail">';
        trail.forEach((trailEntry, index) => {
            if (index > 0) breadcrumbsHtml += '<span class="breadcrumb-separator">&#8250;</span>';
            const isLast = index === trail.length - 1;
            const clickAction = trailEntry.id
                ? `window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(trailEntry.id)}', '${escapeCardJs(workspaceId)}')`
                : `window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')`;
            const dropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('breadcrumb-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(trailEntry.id || '')}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('breadcrumb-drag-hover')" ondragleave="event.currentTarget.classList.remove('breadcrumb-drag-hover')"`;
            breadcrumbsHtml += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" onclick="${isLast ? '' : clickAction}" ${dropAction}>${escapeCardHtml(trailEntry.label.toUpperCase())}</span>`;
            if (isLast) breadcrumbsHtml += '<span class="breadcrumb-cursor"></span>';
        });
        breadcrumbsHtml += `</div>${folderHeaderActionsHtml}</div>${folderHeaderActionTrayHtml}`;

        let subFoldersHtml = '';
        if (subFolders.length > 0) {
            subFoldersHtml += `<div class="manhwa-divider folders-divider">FOLDERS</div><div class="folder-wrap-grid">${subFolders.map((folder) => {
                const isGhost = !!folder.isGhost;
                const folderDropAttr = isGhost ? '' : `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('folder-tile-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('folder-tile-drag-hover')" ondragleave="event.currentTarget.classList.remove('folder-tile-drag-hover')"`;
                const dragStartAttr = isGhost ? '' : `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(folder.id)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;
                const matchCount = viewModel.folderLinks.get(folder.id)?.length || 0;
                const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
                const statsLabel = isGhost ? (childCount > 0 ? `${matchCount} matches | ${childCount} views` : `${matchCount} matches`) : (childCount > 0 ? `${matchCount} items | ${childCount} folders` : `${matchCount} items`);
                const contextMenuAttr = isGhost ? '' : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');"`;
                const editButtonHtml = isGhost
                    ? `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" title="Select Matching Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9745;</button></div>`
                    : `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9745;</button><button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button></div>`;
                return `<div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}" ${folderDropAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')" ${contextMenuAttr}><div class="folder-tile-left-bar"></div><div class="folder-icon-box"><svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /></svg></div><div class="folder-tile-content"><div class="folder-tile-title">${escapeCardHtml(folder.name)}</div><div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div></div>${editButtonHtml}</div>`;
            }).join('')}</div>`;
        }

        let itemsHtml = '';
        if (folderItems.length > 0) {
            if (subFolders.length > 0) itemsHtml += '<div class="manhwa-divider items-divider">ITEMS</div>';
            const flatHtml = folderItems.map((link) => {
                const isTaskEnabled = typeof folderApi?.isTaskEnabledForLink === 'function' ? !!folderApi.isTaskEnabledForLink(link) : true;
                if (typeof window.DashboardCategories?.buildLinkHtml === 'function') {
                    return window.DashboardCategories.buildLinkHtml(link, '', workspaceId, window.eveState?.config?.workspaces || [], { folderLabel: '', isTaskEnabled });
                }
                const jsId = escapeCardJs(String(link.id));
                return `<div class="item-row" style="display: flex; align-items: center; gap: 12px; padding: 10px 18px; cursor: pointer; border-left: 2px solid rgba(128,128,128,0.2);" onclick="if(typeof window.handleLinkClick === 'function') { window.handleLinkClick(event, '${jsId}', this); } else { window.open('${escapeCardJs(link.url)}', '_blank'); }"><span>${escapeCardHtml(link.icon || 'ðŸ”—')}</span><span>${escapeCardHtml(link.title)}</span></div>`;
            }).join('');
            itemsHtml += `<div style="padding: 4px 0;"><ul class="category-scrollable" style="max-height: none; overflow: visible;">${flatHtml}</ul></div>`;
        }
        if (subFolders.length === 0 && folderItems.length === 0) {
            itemsHtml = `<div style="padding: 20px; text-align: center; color: rgba(128,128,128,0.5); font-family: 'Share Tech Mono', monospace; font-size: 11px;">DATA NODE EMPTY</div>`;
        }

        const frameDropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('active'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('active')" ondragleave="event.currentTarget.classList.remove('active')"`;
        const subfoldersCollapsedClass = (isCardFoldersCollapsed || isFolderSubfoldersCollapsed) ? ' subfolders-collapsed' : '';
        const sublinksCollapsedClass = (isCardLinksCollapsed || isFolderSublinksCollapsed) ? ' sublinks-collapsed' : '';
        const frameHtml = `${breadcrumbsHtml}<div class="manhwa-frame ${subfoldersCollapsedClass}${sublinksCollapsedClass}" ${frameDropAction}><div class="manhwa-frame-top-beam"></div><div class="manhwa-frame-left-glow"></div><div class="manhwa-scan-beam"></div><svg width="10" height="10" style="position: absolute; top: 6px; left: 6px;"><polyline points="8,1 1,1 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; top: 6px; right: 6px;"><polyline points="1,1 8,1 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; bottom: 6px; left: 6px;"><polyline points="1,1 1,8 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; bottom: 6px; right: 6px;"><polyline points="8,1 8,8 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><div style="position: relative; z-index: 1;"><div class="bookmark-folder-subfolders">${subFoldersHtml}</div><div class="bookmark-folder-links">${itemsHtml}</div></div></div><div style="margin-top: 10px; cursor: pointer; color: rgba(128,128,128,0.6); font-family: 'Share Tech Mono', monospace; font-size: 10px;" onclick="window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')">â€¹ SYSTEM ROOT</div>`;

        const listContainer = card.querySelector('.category-scrollable') || card.querySelector('.bookmark-folder-sections') || card.querySelector('.v2-folder-root-container') || card.querySelector('.v2-folder-container');
        if (!listContainer) return;

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
    };

    window.EveFolderViewV2.exitFolder = function (event, categoryName, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        window.EveFolderViewV2.saveActiveFolderState(workspaceId, categoryName, null, null, null);

        const card = document.querySelector(`.category-card[data-card-category="${escapeCardHtml(categoryName)}"][data-card-workspace="${escapeCardHtml(workspaceId)}"]`);
        if (!card) {
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }
        if (!card.dataset.mode1Html) {
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        const v2Container = card.querySelector('.v2-folder-container');
        if (v2Container) {
            v2Container.outerHTML = card.dataset.mode1Html;
            delete card.dataset.mode1Html;
        }

        const folderApi = window.EveBookmarkFolders;
        if (folderApi?.buildFolderView) {
            const catLinks = window.getModalLinks ? window.getModalLinks().filter((link) => link.workspace === workspaceId && link.category === categoryName) : [];
            window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, Object.assign(folderApi.buildFolderView(workspaceId, categoryName, catLinks), { scopedLinks: catLinks }));
        }
    };
})();
