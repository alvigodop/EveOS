window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { escapeCardHtml, escapeCardJs, cloneGhostFilterChain } = shared;
    const nav = window.EveFolderViewV2._navigation || {};
    const { findCategoryCard, getCategoryLinks, buildFreshRootContentHtml } = nav;
    let pendingFolderEntryRetryKey = '';

    window.EveFolderViewV2.enterFolder = function (event, categoryName, folderId, workspaceId, enterOptions) {
        const options = enterOptions && typeof enterOptions === 'object' ? enterOptions : {};
        const preservePageScroll = options.preservePageScroll !== false;
        if (event) {
            window.__eveUserInteractedBeforeStartupRender = true;
            event.preventDefault();
            event.stopPropagation();
        }

        const resolvedCategoryName = String(categoryName || '').trim();
        const resolvedWorkspaceId = String(workspaceId || '').trim();
        if (window.EveDashboardHydrationMemory?.recordCardInteraction) {
            window.EveDashboardHydrationMemory.recordCardInteraction(resolvedWorkspaceId, resolvedCategoryName, 'folder');
        }
        if (typeof window.cancelPendingDashboardRender === 'function') {
            window.cancelPendingDashboardRender();
        }
        const card = findCategoryCard(resolvedWorkspaceId, resolvedCategoryName);

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
        
        // Save state FIRST so buildFolderView picks up the new active folder scope for ghosts
        window.EveFolderViewV2.saveActiveFolderState(resolvedWorkspaceId, resolvedCategoryName, folderId, cloneGhostFilterChain(cachedTargetNode?._ghostFilterChain), scopeRootId);

        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return;

        // Force rebuild of viewModel so ghost folders (System Views) attach to the new active folder instantly
        const catLinks = getCategoryLinks(resolvedWorkspaceId, resolvedCategoryName);
        let viewModel = folderApi.buildFolderView(resolvedWorkspaceId, resolvedCategoryName, catLinks, { skipGhosts: false });
        viewModel.scopedLinks = catLinks;
        viewModel._skipGhosts = false;

        // Only update the global cache if we are entering the root (rare) or if we want to preserve this as the root state.
        // Usually, we only want builder-card.folders.js to manage the permanent root cache.
        if (!folderId && window.EveFolderViewV2.setCachedViewModel) {
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
        let folderItems = viewModel.folderLinks.get(targetNode.id) || [];
        if (!targetNode.isGhost && scopeRootId === folderId && !folderItems.length && Array.isArray(viewModel.rootLinks)) {
            folderItems = viewModel.rootLinks;
        }
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
        const breadcrumbHoverOn = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'breadcrumb-drag-hover',true);else event.currentTarget.classList.add('breadcrumb-drag-hover');";
        const breadcrumbHoverOff = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'breadcrumb-drag-hover',false);else event.currentTarget.classList.remove('breadcrumb-drag-hover');";
        const breadcrumbHoverClear = "if(window.clearBookmarkFolderDropHovers)window.clearBookmarkFolderDropHovers();else event.currentTarget.classList.remove('breadcrumb-drag-hover');";
        const tileHoverOn = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'folder-tile-drag-hover',true);else event.currentTarget.classList.add('folder-tile-drag-hover');";
        const tileHoverOff = "if(window.setBookmarkFolderDropHover)window.setBookmarkFolderDropHover(event,'folder-tile-drag-hover',false);else event.currentTarget.classList.remove('folder-tile-drag-hover');";
        const tileHoverClear = "if(window.clearBookmarkFolderDropHovers)window.clearBookmarkFolderDropHovers();else event.currentTarget.classList.remove('folder-tile-drag-hover');";

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
            const dropAction = `ondragover="if(typeof allowDrop==='function')allowDrop(event);${breadcrumbHoverOn}" ondrop="${breadcrumbHoverClear} if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(trailEntry.id || '')}', '${escapeCardJs(resolvedWorkspaceId)}')" ondragenter="${breadcrumbHoverOn}" ondragleave="${breadcrumbHoverOff}"`;
            const crumbLabel = String(trailEntry.label || '');
            breadcrumbsHtml += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" title="${escapeCardHtml(crumbLabel)}" data-folder-hover-kind="Folder Path" data-folder-hover-label="${escapeCardHtml(crumbLabel)}" data-folder-hover-meta="${escapeCardHtml(trail.map((item) => item.label).slice(0, index + 1).join(' / '))}" onclick="${isLast ? '' : clickAction}" ${dropAction}>${escapeCardHtml(crumbLabel.toUpperCase())}</span>`;
            if (isLast) breadcrumbsHtml += '<span class="breadcrumb-cursor"></span>';
        });
        breadcrumbsHtml += `</div>${folderHeaderActionsHtml}</div>${folderHeaderActionTrayHtml}`;

        function getTotalNestedCount(targetFolderId, seenFolders) {
            const seen = seenFolders || new Set();
            if (!targetFolderId || seen.has(targetFolderId)) return 0;
            seen.add(targetFolderId);
            const directCount = (viewModel.folderLinks.get(targetFolderId) || []).length;
            const children = viewModel.childrenMap.get(targetFolderId) || [];
            return directCount + children.reduce(function (sum, child) {
                return sum + getTotalNestedCount(child.id, seen);
            }, 0);
        }

        function getFolderPreviewLinks(targetFolderId, limit) {
            const output = [];
            const seenFolders = new Set();
            function visit(id) {
                if (!id || seenFolders.has(id) || output.length >= limit) return;
                seenFolders.add(id);
                (viewModel.folderLinks.get(id) || []).forEach(function (link) {
                    if (output.length < limit) output.push(link);
                });
                (viewModel.childrenMap.get(id) || []).forEach(function (child) {
                    visit(child.id);
                });
            }
            visit(targetFolderId);
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
            const coverUrl = (typeof window.EveBookmarkCovers?.isDisplayableCoverUrl === 'function')
                ? (window.EveBookmarkCovers.isDisplayableCoverUrl(rawCoverUrl) ? rawCoverUrl : '')
                : ((typeof window.EveBookmarkCovers?.isRenderableCoverUrl === 'function' && !window.EveBookmarkCovers.isRenderableCoverUrl(rawCoverUrl)) ? '' : rawCoverUrl);
            if (coverUrl) return `<img class="hatch-bookmark-image" src="${escapeCardHtml(coverUrl)}" alt="" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" onerror="if(window.EveBookmarkCovers&&typeof window.EveBookmarkCovers.handleCoverImageError==='function'){window.EveBookmarkCovers.handleCoverImageError(this);return;}this.removeAttribute('src');this.style.display='none';">`;
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

        function buildHatchBookmarkSlides(sourceLinks, options) {
            const opts = options || {};
            const links = (Array.isArray(sourceLinks) ? sourceLinks : []).slice(0, Number(opts.limit || 3) || 3);
            if (!links.length) return '';
            const totalSlides = links.length;
            const nestedClass = opts.nested ? ' hatch-bookmark-slide-nested' : '';
            return '<div class="hatch-bookmarks' + (opts.nested ? ' hatch-bookmarks-nested' : '') + '">' + links.map(function (link, idx) {
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
            const nestedFolderId = folder.id;
            const directLinks = viewModel.folderLinks.get(nestedFolderId) || [];
            const children = viewModel.childrenMap.get(nestedFolderId) || [];
            const previewLinks = getFolderPreviewLinks(nestedFolderId, 3);
            const nestedHtml = children.slice(0, 6).map(function (child) {
                return buildNestedSubfolderPreview(child, depth + 1);
            }).join('');
            const meta = `${directLinks.length} direct | ${getTotalNestedCount(nestedFolderId)} branch | ${children.length} folders`;
            return `<details class="hatch-subfolder-node hatch-subfolder-depth-${Math.min(depth, 3)}" onclick="event.stopPropagation();">
                <summary class="hatch-subfolder-summary" data-folder-hover-kind="Subfolder" data-folder-hover-label="${escapeCardHtml(folder.name)}" data-folder-hover-meta="${escapeCardHtml(meta)}" title="${escapeCardHtml(folder.name)}">
                    <span class="hatch-subfolder-glyph"><svg width="10" height="10" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></span>
                    <span class="hatch-subfolder-name">${escapeCardHtml(folder.name)}</span>
                    <span class="hatch-subfolder-count">${escapeCardHtml(meta)}</span>
                    <button type="button" class="hatch-subfolder-open" title="Open folder" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(nestedFolderId)}', '${escapeCardJs(resolvedWorkspaceId)}')">Open</button>
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
                + list.map(function (sf) {
                    const nestedFolderId = sf.id;
                    const meta = `${viewModel.folderLinks.get(nestedFolderId)?.length || 0} direct | ${getTotalNestedCount(nestedFolderId)} branch`;
                    return `<button type="button" class="hatch-subfolder-icon" data-folder-hover-kind="Subfolder" data-folder-hover-label="${escapeCardHtml(sf.name)}" data-folder-hover-meta="${escapeCardHtml(meta)}" title="${escapeCardHtml(sf.name)}" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(nestedFolderId)}', '${escapeCardJs(resolvedWorkspaceId)}')"><svg width="10" height="10" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button>`;
                }).join('')
                + '</div>';
        }

        let subFoldersHtml = '';
        if (subFolders.length > 0) {
            subFoldersHtml += `<div class="manhwa-divider folders-divider">FOLDERS</div><div class="folder-wrap-grid">${subFolders.map((folder) => {
                const isGhost = !!folder.isGhost;
                const folderDropAttr = isGhost ? '' : `ondragover="if(typeof allowDrop==='function')allowDrop(event);${tileHoverOn}" ondrop="${tileHoverClear} if(typeof window.EveFolderViewV2.handleFolderDrop==='function') window.EveFolderViewV2.handleFolderDrop(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}')" ondragenter="${tileHoverOn}" ondragleave="${tileHoverOff}"`;
                const dragStartAttr = isGhost ? '' : `draggable="true" ondragstart="if(typeof window.EveFolderViewV2.handleFolderDragStart==='function') window.EveFolderViewV2.handleFolderDragStart(event, '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}')" ondragend="this.classList.remove('is-dragging')"`;
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
                const contextMenuAttr = isGhost ? '' : `oncontextmenu="if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}');"`;
                const deleteSmartViewButton = isGhost && folder._smartViewUserId
                    ? `<button type="button" class="folder-tile-edit-btn" title="Delete Smart View" onclick="window.deleteSmartViewFromTile?.(event, '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder._smartViewUserId)}', '${escapeCardJs(folder.name)}');">&#128465;</button>`
                    : '';
                const editButtonHtml = isGhost
                    ? `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(resolvedCategoryName)}" data-scope-workspace="${escapeCardHtml(resolvedWorkspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Matching Bookmarks" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(folder.id)}');">&#9745;</button>${deleteSmartViewButton}</div>`
                    : `<div class="folder-tile-action-buttons"><button type="button" class="folder-tile-edit-btn bulk-scope-btn" data-scope-category="${escapeCardHtml(resolvedCategoryName)}" data-scope-workspace="${escapeCardHtml(resolvedWorkspaceId)}" data-scope-folder-id="${escapeCardHtml(folder.id)}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(folder.id)}');">&#9745;</button><button type="button" class="folder-tile-edit-btn" title="Edit Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}');">&#9998;</button></div>`;
                const childFolders = viewModel.childrenMap.get(folder.id) || [];
                const folderLinksForHatch = viewModel.folderLinks.get(folder.id) || [];
                const hatchStoredState = localStorage.getItem(`eve_folder_hatch_collapsed_${resolvedWorkspaceId}_${resolvedCategoryName}_${folder.id}`);
                const isHatchCollapsed = hatchStoredState === null ? true : hatchStoredState === 'true';
                const collapsedClass = isHatchCollapsed ? ' hatch-collapsed' : '';
                const hasHatchContent = childFolders.length > 0 || folderLinksForHatch.length > 0;
                const subFolderInlineHtml = childFolders.length > 0
                    ? buildInlineSubfolderRail(childFolders)
                    : '';
                const nestedSubFolderHtml = (!isHatchCollapsed && childFolders.length > 0)
                    ? '<div class="hatch-subfolders hatch-subfolders-recursive" onwheel="event.stopPropagation();">' + childFolders.map(function (child) { return buildNestedSubfolderPreview(child, 1); }).join('') + '</div>'
                    : '';
                const hatchBookmarksHtml = !isHatchCollapsed
                    ? buildHatchBookmarkSlides(folderLinksForHatch, { limit: 3 })
                    : '';
                const hatchHtml = hatchBookmarksHtml ? `<div class="folder-tile-hatch">${hatchBookmarksHtml}</div>` : '';
                const hatchToggleHtml = hasHatchContent
                    ? `<div class="folder-tile-hatch-toggle" onclick="window.EveFolderViewV2.toggleFolderHatch(event, '${escapeCardJs(resolvedWorkspaceId)}', '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}')" title="Toggle folder covers and subfolders"></div>`
                    : '';
                const hatchPanelHtml = nestedSubFolderHtml || hatchHtml
                    ? `<div class="folder-tile-hatch-panel" onclick="event.stopPropagation();" onwheel="event.stopPropagation();">${nestedSubFolderHtml}${hatchHtml}</div>`
                    : '';
                return `<div class="folder-tile${isGhost ? ' folder-tile-ghost' : ''}${collapsedClass}" data-category="${escapeCardHtml(resolvedCategoryName)}" data-workspace="${escapeCardHtml(resolvedWorkspaceId)}" data-folder-id="${escapeCardHtml(folder.id)}" ${folderDropAttr} ${dragStartAttr} onclick="window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}')" ${contextMenuAttr}>
                    <div class="folder-tile-main" onclick="event.stopPropagation(); window.EveFolderViewV2.enterFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(folder.id)}', '${escapeCardJs(resolvedWorkspaceId)}')">
                        <div class="folder-tile-left-bar"></div>
                        <div class="folder-icon-box"><svg width="14" height="14" viewBox="0 0 14 14" style="overflow: visible;"><rect x="0" y="3" width="14" height="10" rx="0" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /><path d="M0,3 L4,3 L5.5,1 L9,1 L9,3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6" /></svg></div>
                        <div class="folder-tile-content"><div class="folder-tile-title" data-folder-hover-label="${escapeCardHtml(folder.name)}" data-folder-hover-meta="${escapeCardHtml(hoverMeta)}" title="${escapeCardHtml(hoverMeta)}">${escapeCardHtml(folder.name)}</div><div class="folder-tile-stats">${escapeCardHtml(statsLabel)}</div></div>
                        ${editButtonHtml}
                    </div>
                    ${subFolderInlineHtml}
                    ${hatchHtml}
                    ${hatchToggleHtml}
                    ${hatchPanelHtml}
                </div>`;
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

            const folderProgressiveEnabled = typeof window.isFolderBookmarkProgressiveRevealEnabled === 'function'
                ? !!window.isFolderBookmarkProgressiveRevealEnabled(resolvedWorkspaceId, resolvedCategoryName, folderId)
                : (typeof window.isCardBookmarkProgressiveRevealEnabled === 'function'
                    ? !!window.isCardBookmarkProgressiveRevealEnabled(resolvedWorkspaceId, resolvedCategoryName)
                    : true);
            const FOLDER_ITEM_CAP = folderProgressiveEnabled
                ? (window._evePerfMode ? 20 : 50)
                : Number.MAX_SAFE_INTEGER;
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
                return `<div class="item-row" style="display: flex; align-items: center; gap: 12px; padding: 10px 18px; cursor: pointer; border-left: 2px solid rgba(128,128,128,0.2);" onclick="if(typeof window.handleLinkClick === 'function') { window.handleLinkClick(event, '${jsId}', this); } else { window.open('${escapeCardJs(link.url)}', '_blank'); }"><span>${escapeCardHtml(link.icon || 'ðŸ”—')}</span><span>${escapeCardHtml(link.title)}</span></div>`;
            }).join('');

            let showMoreHtml = '';
            if (folderProgressiveEnabled && folderItems.length > FOLDER_ITEM_CAP) {
                const remaining = folderItems.length - FOLDER_ITEM_CAP;
                const btnId = 'showMore_folder_' + String(folderId || '').replace(/[^a-zA-Z0-9]/g, '_');
                if (!window._eveProgressiveLinks) window._eveProgressiveLinks = {};
                window._eveProgressiveLinks[btnId] = { links: folderItems, offset: FOLDER_ITEM_CAP, focused: false };
                showMoreHtml = '<li class="eve-show-more-item" id="' + btnId + '">'
                    + '<button class="eve-show-more-btn" onclick="window._eveLoadMoreLinks(\'' + btnId + '\')">'
                    + 'â–¾ Show ' + Math.min(remaining, 50) + ' more (' + remaining + ' remaining)'
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
        const frameHtml = `${breadcrumbsHtml}<div class="manhwa-frame ${subfoldersCollapsedClass}${sublinksCollapsedClass}" ${frameDropAction}><div class="manhwa-frame-top-beam"></div><div class="manhwa-frame-left-glow"></div><div class="manhwa-scan-beam"></div><svg width="10" height="10" style="position: absolute; top: 6px; left: 6px;"><polyline points="8,1 1,1 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; top: 6px; right: 6px;"><polyline points="1,1 8,1 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; bottom: 6px; left: 6px;"><polyline points="1,1 1,8 8,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><svg width="10" height="10" style="position: absolute; bottom: 6px; right: 6px;"><polyline points="8,1 8,8 1,8" fill="none" stroke="var(--accent, #0088ff)" stroke-width="1.5"/></svg><div style="position: relative; z-index: 1;"><div class="bookmark-folder-subfolders">${subFoldersHtml}</div><div class="bookmark-folder-links">${itemsHtml}</div></div></div><div style="margin-top: 10px; cursor: pointer; color: rgba(128,128,128,0.6); font-family: 'Share Tech Mono', monospace; font-size: 10px;" onclick="window.EveFolderViewV2.exitFolder(event, '${escapeCardJs(resolvedCategoryName)}', '${escapeCardJs(resolvedWorkspaceId)}')">â€¹ SYSTEM ROOT</div>`;

        if (!card.dataset.mode1Html) {
            const libPanel = card.querySelector('.lib-panel');
            const contentWrapper = Array.from(card.children).find((element) => element !== libPanel && !element.classList.contains('category-header') && !element.classList.contains('cat-progress-bg') && !element.classList.contains('category-footer'));
            if (contentWrapper) {
                card.dataset.mode1Html = contentWrapper.outerHTML;
                contentWrapper.outerHTML = `<div class="v2-folder-container card-folder-view-content" style="padding: 0 10px 10px;">${frameHtml}</div>`;
            }
        } else {
            const v2Container = card.querySelector('.v2-folder-container');
            if (v2Container) v2Container.innerHTML = frameHtml;
        }

        if (typeof window.scheduleDashboardMasonryLayout === 'function') {
            window.scheduleDashboardMasonryLayout(card.parentElement || document.getElementById('dashboard-grid'));
        }

        window.EveFolderViewV2.saveActiveFolderState(resolvedWorkspaceId, resolvedCategoryName, folderId, cloneGhostFilterChain(cachedTargetNode?._ghostFilterChain), scopeRootId);

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

})();
