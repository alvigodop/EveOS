// --- DASHBOARD CATEGORIES MODULE ---

function getFolderBackedCategories(workspaceId) {
    const scopedPrefix = String(workspaceId || 'main') + '::';
    const store = getDashboardFolderStore();
    return Object.keys(store)
        .filter(function (key) { return key.indexOf(scopedPrefix) === 0; })
        .map(function (key) { return key.slice(scopedPrefix.length) || 'Unsorted'; });
}

function hasFolderBackedCategory(workspaceId, categoryName) {
    const scopedKey = String(workspaceId || 'main') + '::' + String(categoryName || 'Unsorted');
    const store = getDashboardFolderStore();
    const tree = store && typeof store === 'object' ? store[scopedKey] : null;
    return !!(tree && Array.isArray(tree.nodes) && tree.nodes.length);
}

function collectDashboardCategories(visibleLinks, activeWorkspaceId, categoryOrder, detachedModel, searchStr) {
    const indexedCategories = !searchStr
        ? collectIndexedDashboardLinkedCategories(activeWorkspaceId, categoryOrder)
        : null;
    const linkedCategories = Array.isArray(indexedCategories) && indexedCategories.length
        ? indexedCategories
        : window.DashboardCategories.sort(visibleLinks, categoryOrder);
    const folderCategories = getFolderBackedCategories(activeWorkspaceId); 
    const ordered = [];
    const seen = new Set();

    function addCategory(catObj) {
        const normalizedCat = String(catObj.category || 'Unsorted').trim() || 'Unsorted';
        const wsId = String(catObj.workspaceId || catObj.workspace || 'main').trim();
        const key = `${wsId.toLowerCase()}::${normalizedCat.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        ordered.push({ category: normalizedCat, workspaceId: wsId });
    }

    linkedCategories.forEach(addCategory);
    
    folderCategories.forEach(cat => {
        addCategory({ category: cat, workspaceId: activeWorkspaceId });
    });
    
    if (detachedModel?.links?.length || detachedModel?.viewModel?.nodes?.length) {
        addCategory({ category: detachedModel.categoryName, workspaceId: activeWorkspaceId });
    }

    return ordered;
}

window.renderCategories = function (visibleLinks, gridContainer, focusCategory, searchStr, renderGen, renderHint) {
    if (!gridContainer) return;
    const activeWorkspace = getDashboardActiveWorkspace();
    const dashboardRenderContext = createDashboardRenderContext(activeWorkspace);
    const dashboardStructureSummary = !searchStr ? getDashboardStructureSummary() : null;
    const workspaceCategoryOrder = window.EveCategoryOrder?.getOrder
        ? window.EveCategoryOrder.getOrder(activeWorkspace)
        : (Array.isArray(config.categoryOrder) ? config.categoryOrder : []);
    const detachedModel = window.EveDetachedDashboardCard?.buildDetachedDashboardModel
        ? window.EveDetachedDashboardCard.buildDetachedDashboardModel(activeWorkspace)
        : null;
    const categories = collectDashboardCategories(visibleLinks, activeWorkspace, workspaceCategoryOrder, detachedModel, searchStr);
    const categoryCount = categories.length;
    const totalLiveLinksForRender = Array.isArray(window.eveState?.links)
        ? window.eveState.links.length
        : (typeof getLiveLinks === 'function'
            ? getLiveLinks().length
            : (Array.isArray(window.links) ? window.links.length : visibleLinks.length));
    const isLargeDatapackRender = totalLiveLinksForRender > 1500;
    const isCrossWorkspaceSwitchRender = !!(
        renderHint
        && renderHint.kind === 'workspace-switch'
        && String(renderHint.fromWorkspaceId || '').trim()
        && String(renderHint.toWorkspaceId || '').trim()
        && String(renderHint.fromWorkspaceId || '').trim() !== String(renderHint.toWorkspaceId || '').trim()
    );
    const isStartupRender = !!(renderHint && renderHint.kind === 'startup');
    const shouldGuardGhostHydration = !searchStr
        && !focusCategory
        && (isLargeDatapackRender || visibleLinks.length > 1000 || categoryCount > 8 || isStartupRender || isCrossWorkspaceSwitchRender);

    // Only build category/link indexes on demand so workspace-switch paints do not pay
    // the full per-category exact-link resolution cost up front.
    var linksByCatWs = null;
    var visibleLinkIdMap = null;

    function getLinksByCatWs() {
        if (linksByCatWs instanceof Map) return linksByCatWs;

        linksByCatWs = new Map();
        for (var i = 0; i < visibleLinks.length; i++) {
            var cat = String(visibleLinks[i].category || 'Unsorted').trim() || 'Unsorted';
            var ws = String(visibleLinks[i].workspace || 'main').trim() || 'main';
            var key = `${ws.toLowerCase()}::${cat.toLowerCase()}`;
            if (!linksByCatWs.has(key)) linksByCatWs.set(key, []);
            linksByCatWs.get(key).push(visibleLinks[i]);
        }
        return linksByCatWs;
    }

    function getVisibleLinkIdMap() {
        if (visibleLinkIdMap instanceof Map) return visibleLinkIdMap;
        visibleLinkIdMap = buildDashboardLinkIdMap(visibleLinks);
        return visibleLinkIdMap;
    }

    function getCategoryLiveLinks(workspaceId, categoryName) {
        return getLinksByCatWs().get(`${workspaceId.toLowerCase()}::${categoryName.toLowerCase()}`) || [];
    }

    function resolveCategoryLinks(workspaceId, categoryName) {
        const indexedCardLinks = !searchStr
            ? collectIndexedDashboardCardLinks(getVisibleLinkIdMap(), workspaceId, categoryName)
            : null;
        return indexedCardLinks || getCategoryLiveLinks(workspaceId, categoryName);
    }

    var aggressiveDeferredCards = isStartupRender
        || isCrossWorkspaceSwitchRender
        || (!searchStr && !focusCategory && (isLargeDatapackRender || visibleLinks.length > 150 || categoryCount > 6));
    var CARD_CAP = aggressiveDeferredCards
        ? (visibleLinks.length > 500 ? 6 : 5)
        : (visibleLinks.length > 500 ? 2 : (visibleLinks.length > 200 ? 3 : 8));
    if (isStartupRender) {
        CARD_CAP = visibleLinks.length > 1000 ? 3 : (visibleLinks.length > 500 ? 4 : 5);
    }
    if (isCrossWorkspaceSwitchRender) {
        CARD_CAP = Math.min(CARD_CAP, 0);
    }
    if (!isCrossWorkspaceSwitchRender && !searchStr && !focusCategory && (isLargeDatapackRender || visibleLinks.length > 3000)) {
        CARD_CAP = 0;
    }
    var renderCount = 0;
    var deferredCards = [];

    // Extract only needed config props instead of spreading the entire config per card
    var sharedBuildConfig = {
        collapsed: config.collapsed,
        foldersCollapsed: config.foldersCollapsed,
        linksCollapsed: config.linksCollapsed,
        hideStats: config.hideStats,
        scrollableCategories: config.scrollableCategories,
        workspaces: config.workspaces,
        categoryOrder: config.categoryOrder,
        activeWorkspace: activeWorkspace,
        searchStr: searchStr,
        focusMode: !!focusCategory,
        _renderGen: renderGen,
        _dashboardRenderHint: renderHint || null,
        _dashboardRenderContext: dashboardRenderContext,
        _preferActiveFolderShell: !!focusCategory && isLargeDatapackRender
    };

    // Pre-collect category render descriptors to avoid synchronous DOM work in the loop
    var categoryDescriptors = [];
    categories.forEach(function (catObj) {
        var cat = catObj.category;
        var catWsId = catObj.workspaceId;

        if (focusCategory && cat !== focusCategory) return;

        var isDetachedParkingCard = !!detachedModel && cat === detachedModel.categoryName;
        var summaryBucket = (!searchStr && !isDetachedParkingCard)
            ? getIndexedDashboardCardSummaryBucket(dashboardStructureSummary, catWsId, cat)
            : null;
        var canUseLazyDeferredLinks = isCrossWorkspaceSwitchRender
            && !!summaryBucket;
        var catLinks = isDetachedParkingCard
            ? detachedModel.links.slice()
            : (canUseLazyDeferredLinks ? [] : resolveCategoryLinks(catWsId, cat));

        if (!isDetachedParkingCard && Array.isArray(catLinks) && catLinks.length > 0) {
            var changedAny = false;
            var helpers = window.EveWorkspaceHelpers;
            catLinks.forEach(function (link) {
                if (!link) return;
                var linkWs = String(link.workspace || 'main').trim();
                var cardWs = String(catWsId || 'main').trim();
                if (linkWs.toLowerCase() !== cardWs.toLowerCase()) {
                    var isLegitimate = false;
                    if (dashboardRenderContext) {
                        var descendants = dashboardRenderContext.getVisibleDescendantIds(cardWs) || [];
                        var linkedTabs = dashboardRenderContext.getLinkedTabsByTarget(cardWs) || [];
                        if (descendants.some(function(id) { return String(id).toLowerCase() === linkWs.toLowerCase(); }) ||
                            linkedTabs.some(function(tab) { return String(tab.id).toLowerCase() === linkWs.toLowerCase(); })) {
                            isLegitimate = true;
                        }
                    } else if (helpers && typeof config !== 'undefined' && config && config.workspaces) {
                        var cardWsRecord = helpers.findById(config.workspaces, cardWs);
                        if (cardWsRecord) {
                            var descendants = helpers.getVisibleDescendantIds(cardWsRecord) || [];
                            if (descendants.some(function(id) { return String(id).toLowerCase() === linkWs.toLowerCase(); })) {
                                isLegitimate = true;
                            }
                        }
                    }
                    if (!isLegitimate) {
                        link.workspace = cardWs;
                        changedAny = true;
                    }
                }
            });
            if (changedAny && typeof saveData === 'function') {
                saveData({
                    skipRender: true,
                    skipSuggestions: true,
                    source: 'dashboard-self-healing',
                    meta: { skipEditHistory: true }
                });
            }
        }

        var catLinkCount = isDetachedParkingCard
            ? catLinks.length
            : (canUseLazyDeferredLinks
                ? Math.max(0, Number(summaryBucket?.bookmarkCount || 0))
                : catLinks.length);

        var hasFolderContent = isDetachedParkingCard
            ? !!(detachedModel?.viewModel?.nodes?.length)
            : (!searchStr && hasFolderBackedCategory(catWsId, cat));
        var shouldRenderEmptyCard = !searchStr && (
            window.EveCategoryOrder?.hasCategory
                ? window.EveCategoryOrder.hasCategory(activeWorkspace, cat)
                : workspaceCategoryOrder.includes(cat)
        );

        if (catLinkCount > 0 || hasFolderContent || shouldRenderEmptyCard) {
            categoryDescriptors.push({
                catObj: catObj,
                catLinks: catLinks,
                catLinkCount: catLinkCount,
                hasFolderContent: hasFolderContent,
                shouldRenderEmptyCard: shouldRenderEmptyCard,
                canUseLazyDeferredLinks: canUseLazyDeferredLinks,
                catWsId: catWsId,
                cat: cat,
                isDetachedParkingCard: isDetachedParkingCard
            });
        }
    });

    // Build and render cards — batch shells during cross-workspace switches
    var SHELL_BATCH = 4;
    var shellBatchIdx = 0;
    var capturedGen = renderGen;

    function buildCardConfig(desc) {
        var buildConfig = Object.assign({}, sharedBuildConfig);
        if ((aggressiveDeferredCards && (desc.catLinkCount > 0 || desc.hasFolderContent)) || isCrossWorkspaceSwitchRender) {
            buildConfig._forceDeferredShell = true;
            buildConfig._deferredUseIdle = true;
            buildConfig._deferredHydrateOnDemand = !!(
                !isCrossWorkspaceSwitchRender
                && !searchStr
                && !focusCategory
                && (isLargeDatapackRender || visibleLinks.length > 1000 || categoryCount > 8)
                && renderCount >= CARD_CAP
            );
            if (shouldGuardGhostHydration) {
                buildConfig._deferGhostHydration = true;
                buildConfig._skipDeferredGhostHydration = isLargeDatapackRender || visibleLinks.length > 1000 || categoryCount > 10;
            }
            buildConfig._deferredHydrationDelayMs = isStartupRender
                ? (renderCount < CARD_CAP ? 90 + (renderCount * 40) : 260 + (renderCount * 38))
                : (isCrossWorkspaceSwitchRender
                    ? Math.min(420, 90 + (renderCount * 35))
                    : Math.min(1200, 160 + (renderCount * 70)));
        }
        if (desc.canUseLazyDeferredLinks) {
            buildConfig._deferredLinkCount = desc.catLinkCount;
            buildConfig._deferredLinksLoader = function () {
                return resolveCategoryLinks(desc.catWsId, desc.cat);
            };
        }
        if (desc.isDetachedParkingCard) {
            buildConfig.virtualFolderViewModel = detachedModel.viewModel;
            buildConfig.detachedParkingCard = true;
        }
        return buildConfig;
    }

    function renderDescriptor(desc) {
        var buildConfig = buildCardConfig(desc);
        window.DashboardCategories.renderCard(desc.catObj, desc.catLinks, gridContainer, buildConfig);
        renderCount++;
    }

    if (isCrossWorkspaceSwitchRender && categoryDescriptors.length > SHELL_BATCH) {
        // Render the first batch of shells immediately so the user sees content fast
        var firstBatchEnd = Math.min(SHELL_BATCH, categoryDescriptors.length);
        for (var i = 0; i < firstBatchEnd; i++) {
            renderDescriptor(categoryDescriptors[i]);
        }
        shellBatchIdx = firstBatchEnd;

        // Yield to the browser between shell batches
        function renderNextShellBatch() {
            if (window._eveDashRenderGen !== capturedGen) return;
            var end = Math.min(shellBatchIdx + SHELL_BATCH, categoryDescriptors.length);
            for (var j = shellBatchIdx; j < end; j++) {
                renderDescriptor(categoryDescriptors[j]);
            }
            shellBatchIdx = end;
            if (shellBatchIdx < categoryDescriptors.length) {
                setTimeout(renderNextShellBatch, 0);
            }
        }
        setTimeout(renderNextShellBatch, 0);
    } else {
        // Non-switch render: use existing immediate + deferred pattern
        for (var k = 0; k < categoryDescriptors.length; k++) {
            var desc = categoryDescriptors[k];
            if (renderCount < CARD_CAP) {
                renderDescriptor(desc);
            } else {
                deferredCards.push({ cat: desc.catObj, catLinks: desc.catLinks, buildConfig: buildCardConfig(desc) });
            }
        }

        // Render remaining cards in batches via setTimeout to avoid blocking paint
        if (deferredCards.length > 0) {
            var batchIdx = 0;
            var BATCH_SIZE = aggressiveDeferredCards
                ? 3
                : (visibleLinks.length > 500 ? 2 : 4);
            function renderNextBatch() {
                if (window._eveDashRenderGen !== capturedGen) return;
                var end = Math.min(batchIdx + BATCH_SIZE, deferredCards.length);
                for (var j = batchIdx; j < end; j++) {
                    var d = deferredCards[j];
                    window.DashboardCategories.renderCard(d.cat, d.catLinks, gridContainer, d.buildConfig);
                }
                batchIdx = end;
                if (batchIdx < deferredCards.length) {
                    setTimeout(renderNextBatch, isStartupRender ? 36 : 0);
                }
            }
            setTimeout(renderNextBatch, isStartupRender ? 56 : 0);
        }
    }
};
