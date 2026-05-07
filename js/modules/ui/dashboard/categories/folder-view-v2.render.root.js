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
            + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="promptCreateBookmarkFolder('${escapeCardJs(categoryName)}', '', '${escapeCardJs(workspaceId)}')">New Folder</button>`
            + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="openBookmarkFolders('${escapeCardJs(categoryName)}')">Manage Folders</button>`
            + '</div>';

        const rootHoverOn = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'active',true);else event.currentTarget.classList.add('active');";
        const rootHoverOff = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'active',false);else event.currentTarget.classList.remove('active');";
        const rootHoverClear = "if(window.clearBookmarkFolderDropHovers)window.clearBookmarkFolderDropHovers();else event.currentTarget.classList.remove('active');";
        const tileHoverOn = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'folder-tile-drag-hover',true);else event.currentTarget.classList.add('folder-tile-drag-hover');";
        const tileHoverOff = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'folder-tile-drag-hover',false);else event.currentTarget.classList.remove('folder-tile-drag-hover');";
        const tileHoverClear = "if(window.clearBookmarkFolderDropHovers)window.clearBookmarkFolderDropHovers();else event.currentTarget.classList.remove('folder-tile-drag-hover');";

        const dropTargetAttr = `ondragover="if(typeof allowDrop==='function')allowDrop(event);${rootHoverOn}" ondrop="${rootHoverClear} if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '', '${escapeCardJs(workspaceId)}')" ondragenter="${rootHoverOn}" ondragleave="${rootHoverOff}"`;

        // Section stats helper
        const isCardTaskMode = typeof folderApi?.isCardTaskEnabled === 'function'
            ? !!folderApi.isCardTaskEnabled(workspaceId, categoryName)
            : !(window.eveState?.config?.hideStats || []).includes(categoryName);
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

        let html = toolbarHtml + `<div class="v2-folder-root-container card-folder-view-content" style="padding: 0 10px 10px;" ${dropTargetAttr}>`;

        if (topLevelFolders.length > 0) {
            // Helper: recursively count all bookmarks nested inside a folder tree
            function getTotalNestedCount(folderId) {
                var directCount = (viewModel.folderLinks.get(folderId) || []).length;
                var children = viewModel.childrenMap.get(folderId) || [];
                var childTotal = children.reduce(function (sum, child) {
                    return sum + getTotalNestedCount(child.id);
                }, 0);
                return directCount + childTotal;
            }

            html += `<div class="folder-wrap-grid">${topLevelFolders.map((folder) => {
                const isGhost = !!folder.isGhost;
                const folderDropAttr = isGhost ? '' : `ondragover="if(typeof allowDrop==='function')allowDrop(event);${tileHoverOn}" ondrop="${tileHoverClear} if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')" ondragenter="${tileHoverOn}" ondragleave="${tileHoverOff}"`;
                const dragStartAttr = isGhost ? '' : `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(folder.id)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;
                const matchCount = viewModel.folderLinks.get(folder.id)?.length || 0;
                const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
                const statsLabel = isGhost
                    ? (childCount > 0 ? `${matchCount} matches | ${childCount} views` : `${matchCount} matches`)
                    : (childCount > 0 ? `${matchCount} items | ${childCount} folders` : `${matchCount} items`);
                const contextMenuAttr = isGhost ? '' : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');"`;
                const editButtonHtml = isGhost
                    ? `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(categoryName)}" data-scope-workspace="${escapeCardHtml(workspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Matching Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9744;</button></div>`
                    : `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(categoryName)}" data-scope-workspace="${escapeCardHtml(workspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9744;</button><button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button></div>`;
                // Get subfolders for the hatch
                const subFolders = viewModel.childrenMap.get(folder.id) || [];
                let subFolderHtml = '';
                if (subFolders.length > 0) {
                    subFolderHtml = '<div class="hatch-subfolders" onwheel="event.stopPropagation();">' + subFolders.map(sf => {
                        return `<div class="hatch-subfolder-icon" title="${escapeCardHtml(sf.name)}" onclick="event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(sf.id)}', '${escapeCardJs(workspaceId)}')"><svg width="10" height="10" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></div>`;
                    }).join('') + '</div>';
                }

                // Get bookmarks with images for the hatch
                const folderLinks = viewModel.folderLinks.get(folder.id) || [];
                let hatchBookmarksHtml = '';
                const linksWithCovers = [];
                for (const link of folderLinks) {
                    if (linksWithCovers.length >= 3) break; // keep up to 3
                    const libraryEntry = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(link.id)?.entry || null;
                    const rawCoverUrl = String(
                        window.EveBookmarkCovers?.getDisplayCover?.(link, libraryEntry?.image || libraryEntry?.imageUrl)
                        || link?.coverImage
                        || libraryEntry?.image
                        || libraryEntry?.imageUrl
                        || ''
                    ).trim();
                    const coverUrl = (typeof window.EveBookmarkCovers?.isRenderableCoverUrl === 'function' && !window.EveBookmarkCovers.isRenderableCoverUrl(rawCoverUrl)) ? '' : rawCoverUrl;
                    if (coverUrl) {
                        linksWithCovers.push({ link, coverUrl });
                    }
                }
                
                if (linksWithCovers.length > 0) {
                    const totalSlides = linksWithCovers.length;
                    hatchBookmarksHtml = '<div class="hatch-bookmarks">' + linksWithCovers.map((item, idx) => {
                        const title = item.link.title || 'Untitled';
                        let animationClass = (totalSlides === 1) ? 'slide-single' : (totalSlides === 2 ? `slide-2-total-${idx + 1}` : `slide-3-total-${idx + 1}`);
                        const jsLinkIdLiteral = `'${String(item.link.id || '').replace(/'/g, "\\'")}'`;
                        const hoverHandlers = `onmouseenter="if(typeof showBookmarkCoverHover==='function') showBookmarkCoverHover(event, ${jsLinkIdLiteral})" onmousemove="if(typeof moveBookmarkCoverHover==='function') moveBookmarkCoverHover(event)" onmouseleave="if(typeof hideBookmarkCoverHover==='function') hideBookmarkCoverHover()"`;
                        const clickHandlers = `onclick="event.stopPropagation(); return (typeof openBookmarkFromDashboard==='function') ? openBookmarkFromDashboard(event, ${jsLinkIdLiteral}) : true;" oncontextmenu="event.stopPropagation(); if(typeof showLinkContextMenu==='function') showLinkContextMenu(event, ${jsLinkIdLiteral})"`;
                        return `<a href="${escapeCardHtml(item.link.url)}" class="hatch-bookmark-slide ${animationClass}" ${hoverHandlers} ${clickHandlers} style="cursor: pointer; display: block; text-decoration: none;">
                            <img class="hatch-bookmark-image" src="${escapeCardHtml(item.coverUrl)}" alt="" loading="lazy">
                            <div class="hatch-bookmark-title">${escapeCardHtml(title)}</div>
                        </a>`;
                    }).join('') + '</div>';
                }

                let hatchHtml = '';
                if (hatchBookmarksHtml) {
                    hatchHtml = `<div class="folder-tile-hatch">${hatchBookmarksHtml}</div>`;
                }

                return `<div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}" data-category="${escapeCardHtml(categoryName)}" data-workspace="${escapeCardHtml(workspaceId)}" data-folder-id="${escapeCardHtml(folder.id)}" ${folderDropAttr} ${dragStartAttr} ${contextMenuAttr}>
                    <div class="folder-tile-main" onclick="event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')">
                        <div class="folder-tile-left-bar"></div>
                        <div class="folder-icon-box"><svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /></svg></div>
                        <div class="folder-tile-content">
                            <div class="folder-tile-title">${escapeCardHtml(folder.name)}</div>
                            <div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div>
                        </div>
                        ${subFolderHtml}
                        ${editButtonHtml}
                    </div>
                    ${hatchHtml}
                </div>`;
            }).join('')}</div>`;
        }
        if (topLevelFolders.length > 0 && rootLinks.length > 0) {
            html += '<div class="manhwa-divider">ROOT ITEMS</div>';
        }
        if (rootLinks.length > 0) {
            html += `<div style="padding-top: 4px;">${defaultRenderer(rootLinks, {
                workspaceId: workspaceId,
                categoryName: categoryName,
                folderId: ''
            })}${buildSectionStats(rootLinks)}</div>`;
        }
        if (topLevelFolders.length === 0 && rootLinks.length === 0) {
            html += `<div style="padding: 20px; text-align: center; color: rgba(128,128,128,0.5); font-family: 'Share Tech Mono', monospace; font-size: 11px;">EMPTY SECTOR</div>`;
        }

        html += '</div>';
        return html;
    };
})();
