window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { escapeCardHtml, escapeCardJs } = shared;

    window.EveFolderViewV2.renderRootGrid = function (workspaceId, categoryName, viewModel, defaultRenderer) {
        const topLevelFolders = viewModel.topLevelFolders || [];
        const rootLinks = viewModel.rootLinks || [];
        const folderApi = window.EveBookmarkFolders;
        const toolbarExpanded = !!folderApi?.isToolbarExpanded?.(workspaceId, categoryName);
        const toolbarHtml = ''
            + `<div class="bookmark-folder-toolbar${toolbarExpanded ? ' is-visible' : ''}">`
            + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="promptCreateBookmarkFolder('${escapeCardJs(categoryName)}', '')">New Folder</button>`
            + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="openBookmarkFolders('${escapeCardJs(categoryName)}')">Manage Folders</button>`
            + '</div>';

        const dropTargetAttr = `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('active'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('active')" ondragleave="event.currentTarget.classList.remove('active')"`;
        let html = toolbarHtml + `<div class="v2-folder-root-container" style="padding: 0 10px 10px;" ${dropTargetAttr}>`;

        if (topLevelFolders.length > 0) {
            html += `<div class="folder-wrap-grid">${topLevelFolders.map((folder) => {
                const isGhost = !!folder.isGhost;
                const folderDropAttr = isGhost ? '' : `ondragover="if(typeof allowDrop==='function')allowDrop(event)" ondrop="event.currentTarget.classList.remove('folder-tile-drag-hover'); if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')" ondragenter="event.currentTarget.classList.add('folder-tile-drag-hover')" ondragleave="event.currentTarget.classList.remove('folder-tile-drag-hover')"`;
                const dragStartAttr = isGhost ? '' : `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(folder.id)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;
                const matchCount = viewModel.folderLinks.get(folder.id)?.length || 0;
                const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
                const statsLabel = isGhost
                    ? (childCount > 0 ? `${matchCount} matches | ${childCount} views` : `${matchCount} matches`)
                    : (childCount > 0 ? `${matchCount} items | ${childCount} folders` : `${matchCount} items`);
                const contextMenuAttr = isGhost ? '' : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');"`;
                const editButtonHtml = isGhost
                    ? `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardJs(categoryName)}" data-scope-workspace="${escapeCardJs(workspaceId)}" data-scope-folder-id="${escapeCardJs(folder.id)}" title="Select Matching Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9744;</button></div>`
                    : `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardJs(categoryName)}" data-scope-workspace="${escapeCardJs(workspaceId)}" data-scope-folder-id="${escapeCardJs(folder.id)}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9744;</button><button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button></div>`;
                return `<div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}" ${folderDropAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')" ${contextMenuAttr}><div class="folder-tile-left-bar"></div><div class="folder-icon-box"><svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /></svg></div><div class="folder-tile-content"><div class="folder-tile-title">${escapeCardHtml(folder.name)}</div><div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div></div>${editButtonHtml}</div>`;
            }).join('')}</div>`;
        }

        if (topLevelFolders.length > 0 && rootLinks.length > 0) {
            html += '<div class="manhwa-divider">ROOT ITEMS</div>';
        }
        if (rootLinks.length > 0) {
            html += `<div style="padding-top: 4px;">${defaultRenderer(rootLinks)}</div>`;
        }
        if (topLevelFolders.length === 0 && rootLinks.length === 0) {
            html += `<div style="padding: 20px; text-align: center; color: rgba(128,128,128,0.5); font-family: 'Share Tech Mono', monospace; font-size: 11px;">EMPTY SECTOR</div>`;
        }

        html += '</div>';
        return html;
    };
})();
