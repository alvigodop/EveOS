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
            + `<button type="button" class="bookmark-folder-toolbar-btn" onclick="if(window.promptCreateSmartView)window.promptCreateSmartView('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}')">New Smart View</button>`
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

            function getFolderPreviewLinks(folderId, limit) {
                const output = [];
                const seenFolders = new Set();
                function visit(id) {
                    if (!id || seenFolders.has(id) || output.length >= limit) return;
                    seenFolders.add(id);
                    (viewModel.folderLinks.get(id) || []).forEach((link) => {
                        if (output.length < limit) output.push(link);
                    });
                    (viewModel.childrenMap.get(id) || []).forEach((child) => visit(child.id));
                }
                visit(folderId);
                return output;
            }

            function getBookmarkPreviewVisual(link) {
                const libraryEntry = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(link.id)?.entry || null;
                const rawCoverUrl = String(
                    window.EveBookmarkCovers?.getDisplayCover?.(link, libraryEntry?.image || libraryEntry?.imageUrl)
                    || link?.coverImage
                    || libraryEntry?.image
                    || libraryEntry?.imageUrl
                    || ''
                ).trim();
                const coverUrl = (typeof window.EveBookmarkCovers?.isRenderableCoverUrl === 'function' && !window.EveBookmarkCovers.isRenderableCoverUrl(rawCoverUrl)) ? '' : rawCoverUrl;
                if (coverUrl) return `<img class="hatch-bookmark-image" src="${escapeCardHtml(coverUrl)}" alt="" loading="lazy">`;
                const faviconUtils = window.EveFaviconUtils || null;
                const faviconDomain = faviconUtils && typeof faviconUtils.getDomainFromUrl === 'function'
                    ? faviconUtils.getDomainFromUrl(link.url)
                    : '';
                const faviconSrc = faviconDomain && faviconUtils && typeof faviconUtils.getBestEffortSrc === 'function'
                    ? faviconUtils.getBestEffortSrc(faviconDomain, 32)
                    : '';
                const faviconFallbackSrc = faviconDomain && faviconUtils && typeof faviconUtils.getFallbackSrc === 'function'
                    ? faviconUtils.getFallbackSrc(faviconDomain, 32)
                    : '';
                const faviconAttrs = faviconDomain
                    ? ` data-favicon-domain="${escapeCardHtml(faviconDomain)}" data-favicon-size="32"${faviconFallbackSrc ? ` data-fallback-src="${escapeCardHtml(faviconFallbackSrc)}"` : ''}`
                    : '';
                const faviconOnError = "if(window.EveFaviconUtils&&typeof window.EveFaviconUtils.handleImageError==='function'){window.EveFaviconUtils.handleImageError(this);return;}this.style.display='';";
                return `<div class="hatch-bookmark-icon-fallback"><img src="${escapeCardHtml(faviconSrc || faviconFallbackSrc)}" alt="" class="hatch-favicon"${faviconAttrs} loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="${faviconOnError}"></div>`;
            }

            function buildHatchBookmarkSlides(sourceLinks, options = {}) {
                const links = (Array.isArray(sourceLinks) ? sourceLinks : []).slice(0, Number(options.limit || 3) || 3);
                if (!links.length) return '';
                const totalSlides = links.length;
                const nestedClass = options.nested ? ' hatch-bookmark-slide-nested' : '';
                return '<div class="hatch-bookmarks' + (options.nested ? ' hatch-bookmarks-nested' : '') + '">' + links.map((link, idx) => {
                    const title = link.title || 'Untitled';
                    const animationClass = (totalSlides === 1) ? 'slide-single' : (totalSlides === 2 ? `slide-2-total-${idx + 1}` : `slide-3-total-${idx + 1}`);
                    const jsLinkIdLiteral = `'${String(link.id || '').replace(/'/g, "\\'")}'`;
                    const hoverHandlers = `onmouseenter="if(typeof showBookmarkCoverHover==='function') showBookmarkCoverHover(event, ${jsLinkIdLiteral})" onmousemove="if(typeof moveBookmarkCoverHover==='function') moveBookmarkCoverHover(event)" onmouseleave="if(typeof hideBookmarkCoverHover==='function') hideBookmarkCoverHover()"`;
                    const clickHandlers = `onclick="event.stopPropagation(); return (typeof openBookmarkFromDashboard==='function') ? openBookmarkFromDashboard(event, ${jsLinkIdLiteral}) : true;" oncontextmenu="event.stopPropagation(); if(typeof showLinkContextMenu==='function') showLinkContextMenu(event, ${jsLinkIdLiteral})"`;
                    return `<a href="${escapeCardHtml(link.url)}" class="hatch-bookmark-slide${nestedClass} ${animationClass}" ${hoverHandlers} ${clickHandlers} style="cursor: pointer; display: block; text-decoration: none;">
                        ${getBookmarkPreviewVisual(link)}
                        <div class="hatch-bookmark-title">${escapeCardHtml(title)}</div>
                    </a>`;
                }).join('') + '</div>';
            }

            function buildNestedSubfolderPreview(folder, depth) {
                if (!folder || depth > 3) return '';
                const folderId = folder.id;
                const directLinks = viewModel.folderLinks.get(folderId) || [];
                const children = viewModel.childrenMap.get(folderId) || [];
                const previewLinks = getFolderPreviewLinks(folderId, 3);
                const nestedHtml = children.slice(0, 6).map((child) => buildNestedSubfolderPreview(child, depth + 1)).join('');
                const meta = `${directLinks.length} direct | ${getTotalNestedCount(folderId)} branch | ${children.length} folders`;
                return `<details class="hatch-subfolder-node hatch-subfolder-depth-${Math.min(depth, 3)}" onclick="event.stopPropagation();">
                    <summary class="hatch-subfolder-summary" data-folder-hover-kind="Subfolder" data-folder-hover-label="${escapeCardHtml(folder.name)}" data-folder-hover-meta="${escapeCardHtml(meta)}" title="${escapeCardHtml(folder.name)}">
                        <span class="hatch-subfolder-glyph"><svg width="10" height="10" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></span>
                        <span class="hatch-subfolder-name">${escapeCardHtml(folder.name)}</span>
                        <span class="hatch-subfolder-count">${escapeCardHtml(meta)}</span>
                        <button type="button" class="hatch-subfolder-open" title="Open folder" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}')">Open</button>
                    </summary>
                    <div class="hatch-subfolder-body">
                        ${buildHatchBookmarkSlides(previewLinks, { nested: true, limit: 3 })}
                        ${nestedHtml}
                    </div>
                </details>`;
            }

            function buildInlineSubfolderRail(folders) {
                const list = Array.isArray(folders) ? folders : [];
                if (!list.length) return '';
                return '<div class="hatch-subfolders hatch-subfolders-inline" onwheel="event.stopPropagation();">'
                    + list.map((sf) => {
                        const folderId = sf.id;
                        const meta = `${viewModel.folderLinks.get(folderId)?.length || 0} direct | ${getTotalNestedCount(folderId)} branch`;
                        return `<button type="button" class="hatch-subfolder-icon" data-folder-hover-kind="Subfolder" data-folder-hover-label="${escapeCardHtml(sf.name)}" data-folder-hover-meta="${escapeCardHtml(meta)}" title="${escapeCardHtml(sf.name)}" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folderId)}', '${escapeCardJs(workspaceId)}')"><svg width="10" height="10" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button>`;
                    }).join('')
                    + '</div>';
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
                const ghostWhy = isGhost
                    ? String(folder._smartViewWhy || folder._ghostFilterChain?.map?.((item) => item.label).filter(Boolean).join(' > ') || '').trim()
                    : '';
                const hoverMeta = isGhost && ghostWhy
                    ? `${statsLabel} | Why included: ${ghostWhy}`
                    : statsLabel;
                const contextMenuAttr = isGhost ? '' : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');"`;
                const deleteSmartViewButton = isGhost && folder._smartViewUserId
                    ? `<button type="button" class="folder-tile-edit-btn" title="Delete Smart View" onclick="window.deleteSmartViewFromTile?.(event, '${escapeCardJs(workspaceId)}', '${escapeCardJs(categoryName)}', '${escapeCardJs(folder._smartViewUserId)}', '${escapeCardJs(folder.name)}');">&#128465;</button>`
                    : '';
                const editButtonHtml = isGhost
                    ? `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(categoryName)}" data-scope-workspace="${escapeCardHtml(workspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Matching Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9744;</button>${deleteSmartViewButton}</div>`
                    : `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(categoryName)}" data-scope-workspace="${escapeCardHtml(workspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(categoryName)}', '${escapeCardJs(workspaceId)}', '${escapeCardJs(folder.id)}');">&#9744;</button><button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}');">&#9998;</button></div>`;
                // Get subfolders for the hatch
                const subFolders = viewModel.childrenMap.get(folder.id) || [];
                const subFolderInlineHtml = buildInlineSubfolderRail(subFolders);
                let subFolderHtml = '';
                if (subFolders.length > 0) {
                    subFolderHtml = '<div class="hatch-subfolders hatch-subfolders-recursive" onwheel="event.stopPropagation();">' + subFolders.map((sf) => buildNestedSubfolderPreview(sf, 1)).join('') + '</div>';
                }

                // Get bookmarks for the hatch (up to 3)
                const folderLinks = viewModel.folderLinks.get(folder.id) || [];
                const hatchBookmarksHtml = buildHatchBookmarkSlides(folderLinks, { limit: 3 });

                let hatchHtml = '';
                if (hatchBookmarksHtml) {
                    hatchHtml = `<div class="folder-tile-hatch">${hatchBookmarksHtml}</div>`;
                }

                const hatchStoredState = localStorage.getItem(`eve_folder_hatch_collapsed_${workspaceId}_${categoryName}_${folder.id}`);
                const isHatchCollapsed = hatchStoredState === null ? true : hatchStoredState === 'true';
                const collapsedClass = isHatchCollapsed ? ' hatch-collapsed' : '';
                let hatchToggleHtml = '';
                if (subFolderHtml || hatchHtml) {
                    hatchToggleHtml = `<div class="folder-tile-hatch-toggle" onclick="event.stopPropagation(); const tile = this.closest('.folder-tile'); const isCol = tile.classList.toggle('hatch-collapsed'); localStorage.setItem('eve_folder_hatch_collapsed_${escapeCardJs(workspaceId)}_${escapeCardJs(categoryName)}_${escapeCardJs(folder.id)}', isCol);" title="Toggle folder covers and subfolders"></div>`;
                }

                const hatchPanelHtml = subFolderHtml || hatchHtml
                    ? `<div class="folder-tile-hatch-panel" onclick="event.stopPropagation();" onwheel="event.stopPropagation();">${subFolderHtml}${hatchHtml}</div>`
                    : '';

                return `<div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}${collapsedClass}" data-category="${escapeCardHtml(categoryName)}" data-workspace="${escapeCardHtml(workspaceId)}" data-folder-id="${escapeCardHtml(folder.id)}" ${folderDropAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')" ${contextMenuAttr}>
                    <div class="folder-tile-main" onclick="event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(categoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(workspaceId)}')">
                        <div class="folder-tile-left-bar"></div>
                        <div class="folder-icon-box"><svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /></svg></div>
                        <div class="folder-tile-content">
                            <div class="folder-tile-title" data-folder-hover-label="${escapeCardHtml(folder.name)}" data-folder-hover-meta="${escapeCardHtml(hoverMeta)}" title="${escapeCardHtml(hoverMeta)}">${escapeCardHtml(folder.name)}</div>
                            <div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div>
                        </div>
                        ${editButtonHtml}
                    </div>
                    ${subFolderInlineHtml}
                    ${hatchHtml}
                    ${hatchToggleHtml}
                    ${hatchPanelHtml}
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
