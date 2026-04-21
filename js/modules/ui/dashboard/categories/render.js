// --- DASHBOARD CATEGORIES MODULE ---
function getDashboardFolderStore() {
    if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') return window.eveState.bookmarkFolders;
    if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') return bookmarkFolders;
    if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') return window.bookmarkFolders;
    return {};
}

function getDashboardActiveWorkspace() {
    return String(config?.activeWorkspace || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
}

var dashboardCategorySummaryWarmPromise = null;

function getDashboardDatapackIndexApi() {
    return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
}

function queueDashboardCategorySummaryWarmup() {
    var indexApi = getDashboardDatapackIndexApi();
    if (!indexApi || typeof indexApi.rebuild !== 'function') return;
    if (dashboardCategorySummaryWarmPromise) return;

    dashboardCategorySummaryWarmPromise = Promise.resolve(indexApi.rebuild({ reason: 'dashboard-categories' }))
        .catch(function () {
            // Raw-link fallback remains active when the datapack spine is cold.
        })
        .finally(function () {
            dashboardCategorySummaryWarmPromise = null;
            if (typeof renderDashboard === 'function') renderDashboard();
        });
}

function getDashboardStructureSummary() {
    var indexApi = getDashboardDatapackIndexApi();
    if (!indexApi || typeof indexApi.getStructureSummary !== 'function') return null;
    var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
    var hasUsableSnapshot = typeof indexApi.hasUsableSnapshot === 'function'
        ? indexApi.hasUsableSnapshot()
        : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    if (!hasUsableSnapshot) {
        queueDashboardCategorySummaryWarmup();
        return null;
    }
    var summary = indexApi.getStructureSummary();
    if (summary?.builtAt) return summary;
    queueDashboardCategorySummaryWarmup();
    return null;
}

function getVisibleDashboardWorkspaceIds(activeWorkspaceId) {
    var workspaceSet = window._eveActiveVisibleWorkspaceIds;
    if (workspaceSet instanceof Set && workspaceSet.size) {
        return Array.from(workspaceSet).map(function (workspaceId) {
            return String(workspaceId || '').trim();
        }).filter(Boolean);
    }
    return [String(activeWorkspaceId || 'main').trim() || 'main'];
}

function collectIndexedDashboardLinkedCategories(activeWorkspaceId, categoryOrder) {
    var summary = getDashboardStructureSummary();
    if (!summary?.cards) return null;

    var visibleWorkspaceIds = new Set(getVisibleDashboardWorkspaceIds(activeWorkspaceId));
    var fauxLinks = Object.keys(summary.cards)
        .map(function (key) { return summary.cards[key]; })
        .filter(function (bucket) {
            return !!bucket
                && visibleWorkspaceIds.has(String(bucket.workspaceId || '').trim())
                && Number(bucket.bookmarkCount || 0) > 0;
        })
        .map(function (bucket) {
            return {
                category: String(bucket.categoryName || 'Unsorted').trim() || 'Unsorted',
                workspace: String(bucket.workspaceId || 'main').trim() || 'main'
            };
        });

    return window.DashboardCategories.sort(fauxLinks, categoryOrder);
}

function buildDashboardLinkIdMap(visibleLinks) {
    var map = new Map();
    (Array.isArray(visibleLinks) ? visibleLinks : []).forEach(function (link) {
        var linkId = String(link?.id || '').trim();
        if (linkId) map.set(linkId, link);
    });
    return map;
}

function collectIndexedDashboardCardLinks(visibleLinkIdMap, workspaceId, categoryName) {
    var indexApi = getDashboardDatapackIndexApi();
    if (!indexApi || typeof indexApi.getExactBookmarkLinkIds !== 'function') return null;
    var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
    var hasUsableSnapshot = typeof indexApi.hasUsableSnapshot === 'function'
        ? indexApi.hasUsableSnapshot()
        : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    if (!hasUsableSnapshot) return null;

    return indexApi.getExactBookmarkLinkIds({
        workspaceId: workspaceId,
        categoryName: categoryName
    }).map(function (linkId) {
        return visibleLinkIdMap.get(String(linkId || '').trim()) || null;
    }).filter(Boolean);
}

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
    const linkedCategories = !searchStr
        ? (collectIndexedDashboardLinkedCategories(activeWorkspaceId, categoryOrder)
            || window.DashboardCategories.sort(visibleLinks, categoryOrder))
        : window.DashboardCategories.sort(visibleLinks, categoryOrder);
    const folderCategories = getFolderBackedCategories(activeWorkspaceId); 
    const ordered = [];
    const seen = new Set();

    function addCategory(catObj) {
        const normalizedCat = String(catObj.category || 'Unsorted').trim() || 'Unsorted';
        const wsId = String(catObj.workspaceId || 'main').trim();
        const key = `${wsId}::${normalizedCat}`;
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

window.renderCategories = function (visibleLinks, gridContainer, focusCategory, searchStr, renderGen) {
    if (!gridContainer) return;
    const activeWorkspace = getDashboardActiveWorkspace();
    const workspaceCategoryOrder = window.EveCategoryOrder?.getOrder
        ? window.EveCategoryOrder.getOrder(activeWorkspace)
        : (Array.isArray(config.categoryOrder) ? config.categoryOrder : []);
    const detachedModel = window.EveDetachedDashboardCard?.buildDetachedDashboardModel
        ? window.EveDetachedDashboardCard.buildDetachedDashboardModel(activeWorkspace)
        : null;
    const categories = collectDashboardCategories(visibleLinks, activeWorkspace, workspaceCategoryOrder, detachedModel, searchStr);

    // Pre-index links by (workspaceId::category) — O(n) instead of O(n * categories)
    const linksByCatWs = new Map();
    const visibleLinkIdMap = buildDashboardLinkIdMap(visibleLinks);
    for (var i = 0; i < visibleLinks.length; i++) {
        var cat = String(visibleLinks[i].category || 'Unsorted').trim() || 'Unsorted';
        var ws = String(visibleLinks[i].workspace || 'main').trim() || 'main';
        var key = `${ws}::${cat}`;
        if (!linksByCatWs.has(key)) linksByCatWs.set(key, []);
        linksByCatWs.get(key).push(visibleLinks[i]);
    }

    var CARD_CAP = visibleLinks.length > 500 ? 2 : (visibleLinks.length > 200 ? 3 : 8);
    var renderCount = 0;
    var deferredCards = [];

    categories.forEach(catObj => {
        const cat = catObj.category;
        const catWsId = catObj.workspaceId;

        if (focusCategory && cat !== focusCategory) return;

        const isDetachedParkingCard = !!detachedModel && cat === detachedModel.categoryName;
        const indexedCardLinks = (!searchStr && !isDetachedParkingCard)
            ? collectIndexedDashboardCardLinks(visibleLinkIdMap, catWsId, cat)
            : null;
        // The empty empty-shortcut cards (not tied to content) will still map to activeWorkspace context
        const catLinks = isDetachedParkingCard 
            ? detachedModel.links.slice() 
            : (indexedCardLinks || linksByCatWs.get(`${catWsId}::${cat}`) || []);
        
        const hasFolderContent = isDetachedParkingCard
            ? !!(detachedModel?.viewModel?.nodes?.length)
            : hasFolderBackedCategory(catWsId, cat);
        const shouldRenderEmptyCard = !searchStr && (
            window.EveCategoryOrder?.hasCategory
                ? window.EveCategoryOrder.hasCategory(activeWorkspace, cat)
                : workspaceCategoryOrder.includes(cat)
        );

        if (catLinks.length > 0 || hasFolderContent || shouldRenderEmptyCard) {
            const buildConfig = {
                ...config,
                searchStr: searchStr,
                focusMode: !!focusCategory,
                activeWorkspace: activeWorkspace, // Global active WS
                _renderGen: renderGen
            };
            if (isDetachedParkingCard) {
                buildConfig.virtualFolderViewModel = detachedModel.viewModel;
                buildConfig.detachedParkingCard = true;
            }

            if (renderCount < CARD_CAP) {
                window.DashboardCategories.renderCard(catObj, catLinks, gridContainer, buildConfig);
                renderCount++;
            } else {
                deferredCards.push({ cat: catObj, catLinks: catLinks, buildConfig: buildConfig });
            }
        }
    });

    // Render remaining cards in batches via setTimeout to avoid blocking paint
    if (deferredCards.length > 0) {
        var batchIdx = 0;
        var BATCH_SIZE = visibleLinks.length > 500 ? 2 : 4;
        var capturedGen = renderGen;
        function renderNextBatch() {
            // Bail if a newer render has started
            if (window._eveDashRenderGen !== capturedGen) return;
            var end = Math.min(batchIdx + BATCH_SIZE, deferredCards.length);
            for (var j = batchIdx; j < end; j++) {
                var d = deferredCards[j];
                window.DashboardCategories.renderCard(d.cat, d.catLinks, gridContainer, d.buildConfig);
            }
            batchIdx = end;
            if (batchIdx < deferredCards.length) {
                setTimeout(renderNextBatch, 0);
            }
        }
        setTimeout(renderNextBatch, 0);
    }
};
