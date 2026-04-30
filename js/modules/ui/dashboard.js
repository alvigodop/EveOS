// --- DASHBOARD CORE ---

function renderDashboard() {
    // Coalesce rapid-fire render calls into a single frame
    if (window._eveDashRenderPending) return;
    window._eveDashRenderPending = true;
    requestAnimationFrame(function () {
        window._eveDashRenderPending = false;
        _renderDashboardImmediate();
    });
}

function _getRobustScrollTop() {
    return Math.max(
        window.pageYOffset || 0,
        document.documentElement.scrollTop || 0,
        document.body.scrollTop || 0,
        window.scrollY || 0
    );
}

function getDashboardLiveLinks() {
    if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
    if (Array.isArray(window.eveState?.links)) return window.eveState.links;
    if (Array.isArray(window.links)) return window.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function getDashboardDatapackIndexApi() {
    return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
}

function consumeDashboardRenderHint() {
    var hint = window.__eveDashboardRenderHint || null;
    window.__eveDashboardRenderHint = null;
    return hint;
}

function shouldSkipDashboardCardScrollPreserve(renderHint) {
    return !!(
        renderHint
        && renderHint.kind === 'workspace-switch'
        && String(renderHint.fromWorkspaceId || '').trim()
        && String(renderHint.toWorkspaceId || '').trim()
        && String(renderHint.fromWorkspaceId || '').trim() !== String(renderHint.toWorkspaceId || '').trim()
    );
}

function getDashboardLiveLinkMap(sourceLinks) {
    var linksList = Array.isArray(sourceLinks) ? sourceLinks : [];
    var firstId = linksList.length ? String(linksList[0]?.id || '').trim() : '';
    var lastId = linksList.length ? String(linksList[linksList.length - 1]?.id || '').trim() : '';
    if (
        _dashboardLiveLinkMapCache.ref === linksList
        && _dashboardLiveLinkMapCache.length === linksList.length
        && _dashboardLiveLinkMapCache.firstId === firstId
        && _dashboardLiveLinkMapCache.lastId === lastId
        && _dashboardLiveLinkMapCache.map instanceof Map
    ) {
        return _dashboardLiveLinkMapCache.map;
    }

    var linkMap = new Map();
    for (var i = 0; i < linksList.length; i += 1) {
        var link = linksList[i];
        var linkId = String(link?.id || '').trim();
        if (!linkId) continue;
        linkMap.set(linkId, link);
    }

    _dashboardLiveLinkMapCache = {
        ref: linksList,
        length: linksList.length,
        firstId: firstId,
        lastId: lastId,
        map: linkMap
    };
    return linkMap;
}

function hasDashboardUsableSnapshot(indexApi) {
    if (!indexApi) return false;
    if (typeof indexApi.hasUsableSnapshot === 'function') return !!indexApi.hasUsableSnapshot();
    var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
    return !buildState?.dirty && Number(buildState?.builtAt || 0) > 0;
}

function hasDashboardReadableLinkSnapshot(indexApi) {
    if (!indexApi) return false;
    if (typeof indexApi.hasReadableLinkSnapshot === 'function') return !!indexApi.hasReadableLinkSnapshot();
    return hasDashboardUsableSnapshot(indexApi);
}

function buildDashboardVisibleLinkMatcher(visibleWorkspaceIds, searchTerms, folderPathLabelBuilder) {
    return function (link) {
        if (!visibleWorkspaceIds.has(String(link?.workspace || 'main').trim())) return false;
        if (!searchTerms.length) return true;

        var titleStr = String(link?.title || link?.name || '').toLowerCase();
        var nameStr = String(link?.name || '').toLowerCase();
        var urlStr = String(link?.url || '').toLowerCase();
        var catStr = String(link?.category || 'Unsorted').toLowerCase();
        var folderStr = String(link?.folderId || '').toLowerCase();
        var folderLabelStr = typeof folderPathLabelBuilder === 'function'
            ? String(folderPathLabelBuilder(link?.workspace, link?.category, link?.folderId) || '').toLowerCase()
            : '';
        var notesStr = String(link?.notes || '').toLowerCase();
        var tagsStr = Array.isArray(link?.tags)
            ? link.tags.map(function (tag) { return String(tag || '').trim(); }).filter(Boolean).join(' ').toLowerCase()
            : '';

        return searchTerms.every(function (term) {
            return titleStr.includes(term)
                || nameStr.includes(term)
                || urlStr.includes(term)
                || catStr.includes(term)
                || folderStr.includes(term)
                || folderLabelStr.includes(term)
                || notesStr.includes(term)
                || tagsStr.includes(term);
        });
    };
}

function mergeDashboardPreferredLinks(preferredLinks, liveLinks) {
    var merged = [];
    var seen = new Set();

    function pushLinks(items) {
        (Array.isArray(items) ? items : []).forEach(function (link) {
            var linkId = String(link?.id || '').trim();
            if (!linkId || seen.has(linkId)) return;
            seen.add(linkId);
            merged.push(link);
        });
    }

    pushLinks(preferredLinks);
    pushLinks(liveLinks);
    return merged;
}

function collectIndexedDashboardVisibleLinks(sourceLinks, scope, matcher) {
    var indexApi = getDashboardDatapackIndexApi();
    if (!indexApi || typeof indexApi.getScopedBookmarkLinkIds !== 'function' || !hasDashboardReadableLinkSnapshot(indexApi)) {
        return null;
    }

    var liveLinkMap = getDashboardLiveLinkMap(sourceLinks);
    var resolveIndexedLink = typeof indexApi.resolveBookmarkLink === 'function'
        ? function (linkId) { return indexApi.resolveBookmarkLink(linkId); }
        : null;

    return indexApi.getScopedBookmarkLinkIds(scope || null).map(function (linkId) {
        var normalizedId = String(linkId || '').trim();
        if (!normalizedId) return null;
        return liveLinkMap.get(normalizedId) || (resolveIndexedLink ? resolveIndexedLink(normalizedId) : null) || null;
    }).filter(function (link) {
        return !!link && (!matcher || matcher(link));
    });
}

function _renderDashboardImmediate() {
    var renderHint = consumeDashboardRenderHint();
    var isWsSwitch = shouldSkipDashboardCardScrollPreserve(renderHint);

    // Fast path for workspace switches: skip all scroll preservation overhead
    // (layout reflow from scrollHeight measurement, spacer div, card scroll queries)
    if (isWsSwitch) {
        clearDashboardScrollPreservation();
        _renderDashboardCore(renderHint);
        window.scrollTo(0, 0);
        return;
    }

    // Fast path for data mutations (bookmark save/edit, folder create):
    // skip expensive scroll-preservation (scrollHeight, spacer div, card scroll capture)
    // and just save/restore a simple scroll offset — the view stays on the same workspace.
    var isDataMutation = !!(renderHint && renderHint.kind === 'data-mutation');
    if (isDataMutation) {
        var scrollY = _getRobustScrollTop();
        clearDashboardScrollPreservation();
        _renderDashboardCore(renderHint);
        markDashboardProgrammaticScrollWindow(24);
        window.scrollTo(0, scrollY);
        return;
    }

    var shouldPreserveCardScroll = true;
    var cardScrollState = captureDashboardCardScrollState();
    var scrollActivitySeqAtCapture = _dashboardScrollActivitySeq;

    // Cancel any pending cleanup from a previous call in this batch, then capture fresh scroll state.
    clearDashboardScrollPreservation();
    if (_scrollSave < 0) {
        _scrollSave = _getRobustScrollTop();
    }
    if (_scrollSave > 0 && !_scrollSpacer) {
        _scrollSpacer = document.createElement('div');
        _scrollSpacer.style.cssText = 'height:' + Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) + 'px; width:100%; position:absolute; top:0; left:0; z-index:-1; pointer-events:none; visibility:hidden; display:block;';
        document.body.appendChild(_scrollSpacer);
    }

    // Run render synchronously â€” DOM is rebuilt immediately but Masonry takes later frames
    _renderDashboardCore(renderHint);

    // Restore scroll position immediately
    markDashboardProgrammaticScrollWindow(24);
    window.scrollTo(0, _scrollSave);
    restoreDashboardCardScrollState(cardScrollState);

    // Remove spacer and affirm scroll position AFTER Masonry has likely finished
    // 300ms is generous enough to span typical reflows and transitions
    var target = _scrollSave;
    _scrollRafId = setTimeout(function () {
        if (_dashboardScrollActivitySeq !== scrollActivitySeqAtCapture) {
            clearDashboardScrollPreservation();
            return;
        }
        markDashboardProgrammaticScrollWindow(24);
        window.scrollTo(0, target);
        restoreDashboardCardScrollState(cardScrollState);
        clearDashboardScrollPreservation();
    }, 350);
}

function _renderDashboardCore(renderHint) {
    const grid = document.getElementById('dashboard-grid');
    const dock = document.getElementById('dock-container');
    const searchInput = document.getElementById('search');
    const focusBanner = document.getElementById('focus-banner');
    const mainContent = document.getElementById('main-content');

    if (!grid) return;

    const searchStr = searchInput ? searchInput.value.toLowerCase() : '';
    const searchTerms = searchStr ? searchStr.split(/\s+/).filter(Boolean) : [];
    const isSearchActive = searchTerms.length > 0;
    const isListMode = config.viewMode === 'list';
    const isUnidexMode = config.viewMode === 'unidex';

    // --- Workspace DOM Cache: save outgoing, try restore incoming ---
    var cache = window.EveDashboardCache || null;
    var isWorkspaceSwitch = !!(
        renderHint
        && renderHint.kind === 'workspace-switch'
        && String(renderHint.fromWorkspaceId || '').trim()
        && String(renderHint.toWorkspaceId || '').trim()
        && String(renderHint.fromWorkspaceId || '').trim() !== String(renderHint.toWorkspaceId || '').trim()
    );

    if (cache && isWorkspaceSwitch && !isSearchActive && grid.children.length > 0) {
        var fromKey = cache.cacheKey(renderHint.fromWorkspaceId, '');
        cache.save(fromKey, grid, dock);
    }

    if (cache && isWorkspaceSwitch && !isSearchActive && !String(config.groupOverviewId || '').trim()) {
        var toKey = cache.cacheKey(renderHint.toWorkspaceId, '');
        if (cache.has(toKey)) {
            _eveDashRenderGen++;
            window._eveDashRenderGen = _eveDashRenderGen;
            cleanupDashboardMasonryObserver();

            grid.innerHTML = '';
            if (dock) dock.innerHTML = '';
            grid.classList.toggle('list-mode', isListMode);
            grid.classList.toggle('unidex-mode', isUnidexMode);
            grid.classList.toggle('focus-mode', false);
            if (mainContent) mainContent.classList.toggle('unidex-view-active', isUnidexMode);
            if (focusBanner) focusBanner.style.display = 'none';

            cache.restore(toKey, grid, dock);

            var _cacheGen = _eveDashRenderGen;
            setTimeout(function () {
                if (_eveDashRenderGen !== _cacheGen) return;
                applyDashboardLayoutMaintenance(grid);
            }, 50);

            // Schedule prefetch of adjacent tabs after cache restore too
            if (window.EveDashboardPrefetch && typeof window.EveDashboardPrefetch.schedulePrefetch === 'function') {
                window.EveDashboardPrefetch.schedulePrefetch();
            }
            return;
        }
    }

    // Bump generation â€” all in-flight deferred work from previous renders is now stale
    _eveDashRenderGen++;
    window._eveDashRenderGen = _eveDashRenderGen;

    cleanupDashboardMasonryObserver();

    grid.innerHTML = '';
    if (dock) dock.innerHTML = '';

    grid.classList.toggle('list-mode', isListMode);
    grid.classList.toggle('unidex-mode', isUnidexMode);
    grid.classList.toggle('focus-mode', !!focusCategory && !isUnidexMode);
    if (mainContent) mainContent.classList.toggle('unidex-view-active', isUnidexMode);

    const activeWorkspaceId = String(config.activeWorkspace || 'main').trim() || 'main';

    // Build the set of workspace IDs to include in this view
    const visibleWorkspaceIds = new Set();
    const helpers = window.EveWorkspaceHelpers;
    const groupsApi = window.EveSidebarGroups || null;
    const overviewGroupId = String(config.groupOverviewId || '').trim();
    const groupOverviewRootMap = new Map();

    function addDescendantsToRoot(rootNode, ownerRootId) {
        if (!rootNode || !helpers) return;
        if (!rootNode.hideSubTabs && Array.isArray(rootNode.subTabs) && rootNode.subTabs.length > 0) {
            helpers.getVisibleDescendantIds(rootNode).forEach(function (id) {
                visibleWorkspaceIds.add(id);
                if (ownerRootId && !groupOverviewRootMap.has(String(id))) {
                    groupOverviewRootMap.set(String(id), ownerRootId);
                }
            });
        }
    }

    if (overviewGroupId && groupsApi && typeof groupsApi.getGroupRoots === 'function' && helpers) {
        groupsApi.getGroupRoots(overviewGroupId, config).forEach(function (rootWs) {
            if (!rootWs || !rootWs.id) return;
            const rootId = String(rootWs.id);
            visibleWorkspaceIds.add(rootId);
            groupOverviewRootMap.set(rootId, rootId);

            let resolvedRoot = rootWs;
            if (rootWs.linkedTo) {
                const linkedTarget = helpers.findById(config.workspaces || [], rootWs.linkedTo);
                if (linkedTarget) {
                    visibleWorkspaceIds.add(String(linkedTarget.id));
                    // Don't overwrite â€” if the linkedTo target is itself a group root, it owns its own cards.
                    if (!groupOverviewRootMap.has(String(linkedTarget.id))) {
                        groupOverviewRootMap.set(String(linkedTarget.id), rootId);
                    }
                    resolvedRoot = linkedTarget;
                }
            }
            addDescendantsToRoot(resolvedRoot, rootId);
        });

        const resolvedLinkedIds = new Set();
        Array.from(visibleWorkspaceIds).forEach(function (wsId) {
            const ws = helpers.findById(config.workspaces || [], wsId);
            if (!ws || !ws.linkedTo || resolvedLinkedIds.has(ws.linkedTo)) return;
            resolvedLinkedIds.add(ws.linkedTo);
            const linkedTarget = helpers.findById(config.workspaces || [], ws.linkedTo);
            if (!linkedTarget) return;
            const ownerRoot = groupOverviewRootMap.get(String(wsId)) || '';
            visibleWorkspaceIds.add(linkedTarget.id);
            if (ownerRoot && !groupOverviewRootMap.has(String(linkedTarget.id))) {
                groupOverviewRootMap.set(String(linkedTarget.id), ownerRoot);
            }
            addDescendantsToRoot(linkedTarget, ownerRoot);
        });
    } else {
        visibleWorkspaceIds.add(activeWorkspaceId);
        if (helpers) {
            const activeWs = helpers.findById(config.workspaces || [], activeWorkspaceId);

            let resolvedWs = activeWs;
            if (activeWs && activeWs.linkedTo) {
                const targetWs = helpers.findById(config.workspaces || [], activeWs.linkedTo);
                if (targetWs) {
                    visibleWorkspaceIds.add(targetWs.id);
                    resolvedWs = targetWs;
                }
            }

            if (resolvedWs && !resolvedWs.hideSubTabs && Array.isArray(resolvedWs.subTabs) && resolvedWs.subTabs.length > 0) {
                helpers.getVisibleDescendantIds(resolvedWs).forEach(function (id) { visibleWorkspaceIds.add(id); });
            }

            // Second pass: resolve linkedTo for any sub-tab that is itself a linked tab.
            // This ensures nested linked tabs contribute their target's content to the parent view.
            var resolvedLinkedIds = new Set();
            visibleWorkspaceIds.forEach(function (wsId) {
                if (wsId === activeWorkspaceId) return; // already resolved above
                var ws = helpers.findById(config.workspaces || [], wsId);
                if (ws && ws.linkedTo && !resolvedLinkedIds.has(ws.linkedTo)) {
                    resolvedLinkedIds.add(ws.linkedTo);
                    var linkedTarget = helpers.findById(config.workspaces || [], ws.linkedTo);
                    if (linkedTarget) {
                        visibleWorkspaceIds.add(linkedTarget.id);
                        // Also include the linked target's visible descendants
                        if (!linkedTarget.hideSubTabs && Array.isArray(linkedTarget.subTabs) && linkedTarget.subTabs.length > 0) {
                            helpers.getVisibleDescendantIds(linkedTarget).forEach(function (descId) {
                                visibleWorkspaceIds.add(descId);
                            });
                        }
                    }
                }
            });
        }
    }
    // Expose for link badge rendering
    window._eveActiveVisibleWorkspaceIds = visibleWorkspaceIds;
    window._eveGroupOverviewRootMap = (overviewGroupId && groupOverviewRootMap.size) ? groupOverviewRootMap : null;
    const folderPathLabelBuilder = window.EveBookmarkFolders?.buildFolderPathLabel;
    const visibleScope = visibleWorkspaceIds.size
        ? { workspaceIds: Array.from(visibleWorkspaceIds) }
        : null;

    const matchesVisibleLink = buildDashboardVisibleLinkMatcher(visibleWorkspaceIds, searchTerms, folderPathLabelBuilder);
    const liveLinks = getDashboardLiveLinks();

    var isWorkspaceSwitchRender = shouldSkipDashboardCardScrollPreserve(renderHint);

    // Try to use prefetched data for this workspace (adjacent tab prefetch).
    // Workspace switches prefer the scoped index so large datapacks avoid stale prefetched slices.
    var prefetch = (!isSearchActive && !isWorkspaceSwitchRender && window.EveDashboardPrefetch)
        ? window.EveDashboardPrefetch.getPrefetched(activeWorkspaceId)
        : null;

    var visibleLinks;
    if (prefetch && Array.isArray(prefetch.visibleLinks) && prefetch.visibleLinks.length > 0) {
        visibleLinks = prefetch.visibleLinks;
    } else {
        const shouldPreferIndexedVisibleLinks = !!(
            searchTerms.length > 0
            || visibleWorkspaceIds.size > 1
            || liveLinks.length > 250
            || isWorkspaceSwitchRender
        );
        const indexedVisibleLinks = shouldPreferIndexedVisibleLinks
            ? collectIndexedDashboardVisibleLinks(liveLinks, visibleScope, searchTerms.length > 0 ? matchesVisibleLink : null)
            : null;
        visibleLinks = Array.isArray(indexedVisibleLinks)
            ? indexedVisibleLinks
            : liveLinks.filter(matchesVisibleLink);
    }
    // Level 1: Standard Perf Mode (600+) - degraded animations, basic throttling
    // Level 2: Mega Perf Mode (1500+) - strip icons, strip hovers, max throttling
    window._evePerfMode = visibleLinks.length > 600;
    window._eveMegaPerfMode = visibleLinks.length > 1500;

    if (isUnidexMode) {
        if (focusBanner) focusBanner.style.display = 'none';
        if (dock) dock.classList.add('hidden');

        if (window.UnidexView && typeof window.UnidexView.render === 'function') {
            window.UnidexView.render(grid, { searchStr: searchStr });
        } else {
            grid.innerHTML = '<div class="unidex-empty-state"><h3>Unidex View Module Missing</h3><p>Reload to retry.</p></div>';
        }
        applyDashboardLayoutMaintenance(grid);
        return;
    }

    if (focusBanner) {
        focusBanner.style.display = focusCategory ? 'block' : 'none';
        if (focusCategory) focusBanner.innerHTML = `&#127919; FOCUS: ${focusCategory} (Click to Exit)`;
    }

    if (typeof window.renderDock === 'function') {
        window.renderDock(visibleLinks, dock, focusCategory);
    } else {
        console.error('renderDock not found');
    }

    if (typeof window.renderCategories === 'function') {
        window.renderCategories(visibleLinks, grid, focusCategory, searchStr, _eveDashRenderGen, renderHint);
        // Defer masonry layout to after initial cards have painted
        var _masonryGen = _eveDashRenderGen;
        setTimeout(function () {
            if (_eveDashRenderGen !== _masonryGen) return;
            applyDashboardLayoutMaintenance(grid);
        }, 100);
    } else {
        console.error('renderCategories not found');
    }

    // Schedule prefetch of adjacent tabs during idle time
    if (window.EveDashboardPrefetch && typeof window.EveDashboardPrefetch.schedulePrefetch === 'function') {
        window.EveDashboardPrefetch.schedulePrefetch();
    }
}
