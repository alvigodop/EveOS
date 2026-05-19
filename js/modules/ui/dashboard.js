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
    if (typeof window.getDashboardScrollTop === 'function') {
        return window.getDashboardScrollTop();
    }
    return Math.max(
        window.pageYOffset || 0,
        document.documentElement.scrollTop || 0,
        document.body.scrollTop || 0,
        window.scrollY || 0
    );
}

function _setRobustScrollTop(top) {
    if (typeof window.setDashboardScrollTop === 'function') {
        window.setDashboardScrollTop(top);
        return;
    }
    window.scrollTo(0, Math.max(0, Number(top || 0)));
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

function isDashboardStartupRenderHint(renderHint) {
    return !!(renderHint && renderHint.kind === 'startup');
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

function restoreDashboardOpenLibrarySurface(surface) {
    if (!surface || surface.kind !== 'card-library') return;
    var categoryName = String(surface.categoryName || '').trim();
    if (!categoryName) return;
    var panelId = 'lib-' + categoryName.replace(/[^a-zA-Z0-9]/g, '_') + '-panel';
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var parentCard = panel.closest('.category-card');
    var isFocusedCard = !!parentCard?.classList.contains('is-focus-mode');
    panel.style.display = 'block';
    if (!isFocusedCard) {
        panel.style.maxHeight = 'min(74vh, 760px)';
        panel.style.overflow = '';
        panel.style.overflowX = 'hidden';
        panel.style.overflowY = 'auto';
        panel.style.overscrollBehavior = 'auto';
    }
    if (parentCard) {
        parentCard.classList.add('has-library-expanded');
        if (isFocusedCard) parentCard.classList.add('focus-library-expanded');
    }
    wireDashboardOpenLibrarySurfaceScrollBridge(panel);
    if (!panel.children.length && window.EveLibrary?.UI?.initLibraryPanel) {
        window.EveLibrary.UI.initLibraryPanel(categoryName);
    }
    window.__eveOpenCardLibrarySurface = {
        kind: 'card-library',
        categoryName: categoryName,
        cardTargetId: String(parentCard?.getAttribute('data-card-target-id') || surface.cardTargetId || ''),
        isFocusedCard: isFocusedCard,
        panel: panel,
        openedAt: surface.openedAt || Date.now()
    };
}

function wireDashboardOpenLibrarySurfaceScrollBridge(panel) {
    if (!panel || panel.dataset.dashboardLibraryScrollBridge === '1') return;
    panel.dataset.dashboardLibraryScrollBridge = '1';
    panel.addEventListener('wheel', function (event) {
        if (typeof window.noteDashboardUserScrollActivity === 'function') {
            window.noteDashboardUserScrollActivity({ force: true });
        }
        var deltaY = Number(event?.deltaY || 0);
        if (!deltaY) return;
        var parentCard = panel.closest('.category-card');
        var isNormalCardLibrary = !!parentCard && !parentCard.classList.contains('is-focus-mode');
        if (isNormalCardLibrary) {
            event.preventDefault();
            var scrollHost = typeof window.getDashboardNearestScrollHost === 'function'
                ? window.getDashboardNearestScrollHost(panel, { skipNode: panel })
                : null;
            var pageTop = scrollHost
                ? Number(scrollHost.scrollTop || 0)
                : (typeof window.getDashboardScrollTop === 'function'
                    ? window.getDashboardScrollTop()
                    : (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0));
            if (scrollHost && scrollHost !== document.body && scrollHost !== document.documentElement) {
                scrollHost.scrollTop = Math.max(0, pageTop + deltaY);
            } else if (typeof window.setDashboardScrollTop === 'function') {
                window.setDashboardScrollTop(pageTop + deltaY);
            } else {
                window.scrollTo(0, pageTop + deltaY);
            }
            return;
        }
        var panelCanScroll = panel.scrollHeight > panel.clientHeight + 2;
        if (!panelCanScroll) return;
        var atTop = panel.scrollTop <= 1;
        var atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
        var shouldHandOff = (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
        if (!shouldHandOff) return;
        var scrollHost = typeof window.getDashboardPrimaryScrollHost === 'function'
            ? window.getDashboardPrimaryScrollHost()
            : (document.scrollingElement || document.documentElement || document.body);
        if (!scrollHost || scrollHost === panel) return;
        event.preventDefault();
        var currentTop = typeof window.getDashboardScrollTop === 'function'
            ? window.getDashboardScrollTop()
            : (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);
        if (typeof window.setDashboardScrollTop === 'function') {
            window.setDashboardScrollTop(currentTop + deltaY);
        } else {
            window.scrollTo(0, currentTop + deltaY);
        }
    }, { passive: false, capture: true });
}

function scheduleDashboardOpenLibrarySurfaceRestore(surface) {
    if (!surface || surface.kind !== 'card-library') return;
    window.requestAnimationFrame(function () {
        restoreDashboardOpenLibrarySurface(surface);
    });
    window.setTimeout(function () {
        restoreDashboardOpenLibrarySurface(surface);
    }, 120);
    window.setTimeout(function () {
        restoreDashboardOpenLibrarySurface(surface);
    }, 320);
}

function hasDashboardOpenCardLibrarySurface(surface) {
    return !!(surface && surface.kind === 'card-library');
}

function shouldDashboardProtectLibrarySurfaceScroll(surface) {
    if (!hasDashboardOpenCardLibrarySurface(surface)) return false;
    if (typeof window.isDashboardFocusedCardLibrarySurface === 'function') {
        return window.isDashboardFocusedCardLibrarySurface(surface);
    }
    return surface.isFocusedCard === true;
}

function getDashboardLibrarySurfaceScrollProtectionMs(surface) {
    if (!hasDashboardOpenCardLibrarySurface(surface)) return 0;
    if (shouldDashboardProtectLibrarySurfaceScroll(surface)) return 700;
    if (typeof window.isDashboardInlineCardLibrarySurface === 'function' && window.isDashboardInlineCardLibrarySurface(surface)) {
        return 80;
    }
    return surface.isFocusedCard === false ? 80 : 0;
}

function isDashboardInlineLibrarySurfaceForRender(surface) {
    if (!hasDashboardOpenCardLibrarySurface(surface)) return false;
    if (typeof window.isDashboardInlineCardLibrarySurface === 'function') {
        return window.isDashboardInlineCardLibrarySurface(surface);
    }
    return surface.isFocusedCard === false;
}

function findDashboardCardByTargetId(targetId) {
    var normalized = String(targetId || '').trim();
    if (!normalized) return null;
    return document.querySelector('.category-card[data-card-target-id="' + normalized.replace(/["\\]/g, '\\$&') + '"]');
}

function captureDashboardInlineLibraryViewportAnchor(surface) {
    if (!isDashboardInlineLibrarySurfaceForRender(surface)) return null;
    var panel = typeof window.getDashboardLibrarySurfacePanel === 'function'
        ? window.getDashboardLibrarySurfacePanel(surface)
        : surface.panel;
    var card = panel?.closest('.category-card') || findDashboardCardByTargetId(surface.cardTargetId);
    var targetId = String(card?.getAttribute('data-card-target-id') || surface.cardTargetId || '').trim();
    if (!card || !targetId) return null;
    return {
        cardTargetId: targetId,
        top: card.getBoundingClientRect().top,
        scrollSeq: Number(window._dashboardScrollActivitySeq || 0)
    };
}

function restoreDashboardInlineLibraryViewportAnchor(anchor) {
    if (!anchor || Number(window._dashboardScrollActivitySeq || 0) !== anchor.scrollSeq) return;
    var card = findDashboardCardByTargetId(anchor.cardTargetId);
    if (!card) return;
    var currentTop = card.getBoundingClientRect().top;
    var delta = currentTop - Number(anchor.top || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) <= 2) return;
    markDashboardProgrammaticScrollWindow(24);
    _setRobustScrollTop(_getRobustScrollTop() + delta);
}

function scheduleDashboardInlineLibraryViewportAnchorRestore(anchor) {
    if (!anchor) return;
    requestAnimationFrame(function () {
        restoreDashboardInlineLibraryViewportAnchor(anchor);
    });
    setTimeout(function () {
        restoreDashboardInlineLibraryViewportAnchor(anchor);
    }, 120);
    setTimeout(function () {
        restoreDashboardInlineLibraryViewportAnchor(anchor);
    }, 320);
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
    var isStartupRender = isDashboardStartupRenderHint(renderHint);
    var openLibrarySurface = window.__eveOpenCardLibrarySurface || null;
    var inlineLibraryAnchor = captureDashboardInlineLibraryViewportAnchor(openLibrarySurface);

    // Fast path for workspace switches: skip all scroll preservation overhead
    // (layout reflow from scrollHeight measurement, spacer div, card scroll queries)
    if (isWsSwitch || isStartupRender) {
        clearDashboardScrollPreservation();
        var startupLibraryProtectionMs = getDashboardLibrarySurfaceScrollProtectionMs(openLibrarySurface);
        if (startupLibraryProtectionMs > 0) {
            markDashboardProgrammaticScrollWindow(startupLibraryProtectionMs);
        }
        _renderDashboardCore(renderHint);
        restoreDashboardOpenLibrarySurface(openLibrarySurface);
        restoreDashboardInlineLibraryViewportAnchor(inlineLibraryAnchor);
        scheduleDashboardOpenLibrarySurfaceRestore(openLibrarySurface);
        scheduleDashboardInlineLibraryViewportAnchorRestore(inlineLibraryAnchor);
        if (isWsSwitch) _setRobustScrollTop(0);
        return;
    }

    // Fast path for data mutations (bookmark save/edit, folder create):
    // skip expensive scroll-preservation (scrollHeight, spacer div, card scroll capture)
    // and just save/restore a simple scroll offset — the view stays on the same workspace.
    var isDataMutation = !!(renderHint && renderHint.kind === 'data-mutation');
    if (isDataMutation) {
        var scrollY = _getRobustScrollTop();
        clearDashboardScrollPreservation();
        var mutationLibraryProtectionMs = getDashboardLibrarySurfaceScrollProtectionMs(openLibrarySurface);
        if (mutationLibraryProtectionMs > 0) {
            markDashboardProgrammaticScrollWindow(mutationLibraryProtectionMs);
        }
        _renderDashboardCore(renderHint);
        restoreDashboardOpenLibrarySurface(openLibrarySurface);
        restoreDashboardInlineLibraryViewportAnchor(inlineLibraryAnchor);
        scheduleDashboardOpenLibrarySurfaceRestore(openLibrarySurface);
        markDashboardProgrammaticScrollWindow(24);
        _setRobustScrollTop(scrollY);
        scheduleDashboardInlineLibraryViewportAnchorRestore(inlineLibraryAnchor);
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
        var scrollHost = typeof window.getDashboardPrimaryScrollHost === 'function'
            ? window.getDashboardPrimaryScrollHost()
            : null;
        var hostIsDocument = !scrollHost || scrollHost === document.body || scrollHost === document.documentElement;
        var spacerHeight = Math.max(
            scrollHost?.scrollHeight || 0,
            document.documentElement.scrollHeight || 0,
            document.body.scrollHeight || 0
        );
        _scrollSpacer = document.createElement('div');
        if (hostIsDocument) {
            _scrollSpacer.style.cssText = 'height:' + spacerHeight + 'px; width:100%; position:absolute; top:0; left:0; z-index:-1; pointer-events:none; visibility:hidden; display:block;';
            document.body.appendChild(_scrollSpacer);
        } else {
            _scrollSpacer.style.cssText = 'height:' + spacerHeight + 'px; width:1px; flex:0 0 auto; pointer-events:none; visibility:hidden; display:block;';
            scrollHost.appendChild(_scrollSpacer);
        }
    }

    // Run render synchronously â€” DOM is rebuilt immediately but Masonry takes later frames
    var libraryProtectionMs = getDashboardLibrarySurfaceScrollProtectionMs(openLibrarySurface);
    if (libraryProtectionMs > 0) {
        markDashboardProgrammaticScrollWindow(libraryProtectionMs);
    }
    _renderDashboardCore(renderHint);
    restoreDashboardOpenLibrarySurface(openLibrarySurface);
    restoreDashboardInlineLibraryViewportAnchor(inlineLibraryAnchor);
    scheduleDashboardOpenLibrarySurfaceRestore(openLibrarySurface);

    // Restore scroll position immediately
    markDashboardProgrammaticScrollWindow(24);
    _setRobustScrollTop(_scrollSave);
    restoreDashboardInlineLibraryViewportAnchor(inlineLibraryAnchor);
    restoreDashboardCardScrollState(cardScrollState);
    scheduleDashboardInlineLibraryViewportAnchorRestore(inlineLibraryAnchor);

    // Remove spacer and affirm scroll position AFTER Masonry has likely finished
    // 300ms is generous enough to span typical reflows and transitions
    var target = _scrollSave;
    function affirmDashboardScrollTarget() {
        restoreDashboardOpenLibrarySurface(openLibrarySurface);
        markDashboardProgrammaticScrollWindow(24);
        _setRobustScrollTop(target);
        restoreDashboardCardScrollState(cardScrollState);
    }
    _scrollRafId = setTimeout(function () {
        if (_dashboardScrollActivitySeq !== scrollActivitySeqAtCapture) {
            clearDashboardScrollPreservation();
            return;
        }
        affirmDashboardScrollTarget();
        _scrollRafId = setTimeout(function () {
            if (_dashboardScrollActivitySeq === scrollActivitySeqAtCapture) {
                affirmDashboardScrollTarget();
            }
            clearDashboardScrollPreservation();
        }, 140);
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
    const isStartupRender = isDashboardStartupRenderHint(renderHint);

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
    if (isStartupRender) {
        window._eveStartupBookmarkPaintActive = true;
        window.__eveStartupBookmarkPaintGen = _eveDashRenderGen;
        if (window.__eveStartupBookmarkPaintTimer) {
            clearTimeout(window.__eveStartupBookmarkPaintTimer);
        }
        window.__eveStartupBookmarkPaintTimer = setTimeout(function () {
            if (window.__eveStartupBookmarkPaintGen === _eveDashRenderGen) {
                window._eveStartupBookmarkPaintActive = false;
            }
            window.__eveStartupBookmarkPaintTimer = 0;
        }, 7200);
    }

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

    if (window.EveBookmarkCovers && typeof window.EveBookmarkCovers.scheduleWarmup === 'function' && !window._eveMegaPerfMode) {
        window.EveBookmarkCovers.scheduleWarmup(visibleLinks, {
            limit: isStartupRender ? (window._evePerfMode ? 18 : 42) : (window._evePerfMode ? 36 : 96),
            delayMs: isStartupRender ? 2800 : (window._evePerfMode ? 1800 : 900)
        });
    }

    if (typeof window.renderCategories === 'function') {
        window.renderCategories(visibleLinks, grid, focusCategory, searchStr, _eveDashRenderGen, renderHint);
        // Defer masonry layout to after initial cards have painted
        var _masonryGen = _eveDashRenderGen;
        setTimeout(function () {
            if (_eveDashRenderGen !== _masonryGen) return;
            applyDashboardLayoutMaintenance(grid);
        }, isStartupRender ? 180 : 100);
    } else {
        console.error('renderCategories not found');
    }

    // Schedule prefetch of adjacent tabs during idle time
    if (window.EveDashboardPrefetch && typeof window.EveDashboardPrefetch.schedulePrefetch === 'function') {
        if (isStartupRender) {
            setTimeout(function () {
                if (_eveDashRenderGen !== window.__eveStartupBookmarkPaintGen && window._eveStartupBookmarkPaintActive) return;
                window.EveDashboardPrefetch.schedulePrefetch();
            }, 2200);
        } else {
            window.EveDashboardPrefetch.schedulePrefetch();
        }
    }
}
