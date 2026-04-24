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
    var scrollSeqAtRequest = Number(window._dashboardScrollActivitySeq || 0);

    dashboardCategorySummaryWarmPromise = Promise.resolve(indexApi.rebuild({ reason: 'dashboard-categories' }))
        .catch(function () {
            // Raw-link fallback remains active when the datapack spine is cold.
        })
        .finally(function () {
            dashboardCategorySummaryWarmPromise = null;
            if (Number(window._dashboardScrollActivitySeq || 0) !== scrollSeqAtRequest) return;
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

function getIndexedDashboardCardSummaryBucket(summary, workspaceId, categoryName) {
    if (!summary?.cards) return null;
    var normalizedWorkspaceId = String(workspaceId || 'main').trim() || 'main';
    var normalizedCategoryName = String(categoryName || 'Unsorted').trim() || 'Unsorted';
    return summary.cards[normalizedWorkspaceId + '::' + normalizedCategoryName] || null;
}

function createDashboardRenderContext(activeWorkspaceId) {
    var helpers = window.EveWorkspaceHelpers;
    var workspaces = Array.isArray(config?.workspaces) ? config.workspaces : [];
    var visibleWorkspaceIds = new Set(getVisibleDashboardWorkspaceIds(activeWorkspaceId));
    var workspaceById = new Map();
    var parentById = new Map();
    var childIdsById = new Map();
    var pathCache = new Map();
    var visibleDescendantCache = new Map();
    var linkedTabsByTarget = new Map();

    function addChild(parentId, childId) {
        var normalizedParentId = String(parentId || '').trim();
        var normalizedChildId = String(childId || '').trim();
        if (!normalizedChildId) return;
        if (!childIdsById.has(normalizedParentId)) childIdsById.set(normalizedParentId, []);
        childIdsById.get(normalizedParentId).push(normalizedChildId);
    }

    function walk(nodes, parentId) {
        (Array.isArray(nodes) ? nodes : []).forEach(function (workspace) {
            if (!workspace || !workspace.id) return;
            var workspaceId = String(workspace.id || '').trim();
            if (!workspaceId) return;

            workspaceById.set(workspaceId, workspace);
            if (parentId) parentById.set(workspaceId, String(parentId || '').trim());
            addChild(parentId, workspaceId);

            if (Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0) {
                walk(workspace.subTabs, workspaceId);
            }
        });
    }

    walk(workspaces, '');

    function getWorkspaceById(workspaceId) {
        var normalizedId = String(workspaceId || '').trim();
        return normalizedId ? (workspaceById.get(normalizedId) || null) : null;
    }

    function getPath(workspaceId) {
        var normalizedId = String(workspaceId || '').trim();
        if (!normalizedId) return [];
        if (pathCache.has(normalizedId)) return pathCache.get(normalizedId).slice();

        var path = [];
        var current = getWorkspaceById(normalizedId);
        while (current) {
            var currentId = String(current.id || '').trim();
            path.unshift({
                id: currentId,
                name: String(current.name || currentId || '').trim(),
                icon: current.icon || '📁'
            });
            var parentId = String(parentById.get(currentId) || '').trim();
            current = parentId ? getWorkspaceById(parentId) : null;
        }

        if (!path.length) {
            path = [{ id: normalizedId, name: normalizedId, icon: '📁' }];
        }
        pathCache.set(normalizedId, path);
        return path.slice();
    }

    function getVisibleDescendantIds(workspaceId) {
        var normalizedId = String(workspaceId || '').trim();
        if (!normalizedId) return [];
        if (visibleDescendantCache.has(normalizedId)) {
            return visibleDescendantCache.get(normalizedId).slice();
        }

        var descendants = [];
        var queue = (childIdsById.get(normalizedId) || []).slice();
        while (queue.length > 0) {
            var nextId = String(queue.shift() || '').trim();
            if (!nextId) continue;
            descendants.push(nextId);
            var children = childIdsById.get(nextId);
            if (Array.isArray(children) && children.length > 0) {
                for (var i = 0; i < children.length; i++) {
                    queue.push(children[i]);
                }
            }
        }

        if (visibleWorkspaceIds.size > 0) {
            descendants = descendants.filter(function (descendantId) {
                return visibleWorkspaceIds.has(descendantId);
            });
        }

        visibleDescendantCache.set(normalizedId, descendants);
        return descendants.slice();
    }

    if (visibleWorkspaceIds.size > 0) {
        visibleWorkspaceIds.forEach(function (visibleWorkspaceId) {
            var visibleWorkspace = getWorkspaceById(visibleWorkspaceId);
            if (!visibleWorkspace || !visibleWorkspace.linkedTo) return;

            var linkedTargetId = String(visibleWorkspace.linkedTo || '').trim();
            if (!linkedTargetId) return;

            if (!linkedTabsByTarget.has(linkedTargetId)) linkedTabsByTarget.set(linkedTargetId, []);
            linkedTabsByTarget.get(linkedTargetId).push(visibleWorkspace);

            getVisibleDescendantIds(linkedTargetId).forEach(function (descendantId) {
                if (!linkedTabsByTarget.has(descendantId)) linkedTabsByTarget.set(descendantId, []);
                linkedTabsByTarget.get(descendantId).push(visibleWorkspace);
            });
        });
    }

    return {
        activeWorkspaceId: String(activeWorkspaceId || 'main').trim() || 'main',
        visibleWorkspaceIds: visibleWorkspaceIds,
        getWorkspaceById: getWorkspaceById,
        getPath: getPath,
        getVisibleDescendantIds: getVisibleDescendantIds,
        getLinkedTabsByTarget: function (workspaceId) {
            var normalizedId = String(workspaceId || '').trim();
            return normalizedId && linkedTabsByTarget.has(normalizedId)
                ? linkedTabsByTarget.get(normalizedId).slice()
                : [];
        }
    };
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
    const isCrossWorkspaceSwitchRender = !!(
        renderHint
        && renderHint.kind === 'workspace-switch'
        && String(renderHint.fromWorkspaceId || '').trim()
        && String(renderHint.toWorkspaceId || '').trim()
        && String(renderHint.fromWorkspaceId || '').trim() !== String(renderHint.toWorkspaceId || '').trim()
    );

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
            var key = `${ws}::${cat}`;
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
        return getLinksByCatWs().get(`${workspaceId}::${categoryName}`) || [];
    }

    function resolveCategoryLinks(workspaceId, categoryName) {
        const indexedCardLinks = !searchStr
            ? collectIndexedDashboardCardLinks(getVisibleLinkIdMap(), workspaceId, categoryName)
            : null;
        return indexedCardLinks || getCategoryLiveLinks(workspaceId, categoryName);
    }

    var aggressiveDeferredCards = isCrossWorkspaceSwitchRender
        || (!searchStr && !focusCategory && (visibleLinks.length > 150 || categoryCount > 6));
    var CARD_CAP = aggressiveDeferredCards
        ? (visibleLinks.length > 500 ? 6 : 5)
        : (visibleLinks.length > 500 ? 2 : (visibleLinks.length > 200 ? 3 : 8));
    if (isCrossWorkspaceSwitchRender) {
        CARD_CAP = Math.min(CARD_CAP, 0);
    }
    var renderCount = 0;
    var deferredCards = [];

    categories.forEach(catObj => {
        const cat = catObj.category;
        const catWsId = catObj.workspaceId;

        if (focusCategory && cat !== focusCategory) return;

        const isDetachedParkingCard = !!detachedModel && cat === detachedModel.categoryName;
        const summaryBucket = (!searchStr && !isDetachedParkingCard)
            ? getIndexedDashboardCardSummaryBucket(dashboardStructureSummary, catWsId, cat)
            : null;
        const canUseLazyDeferredLinks = isCrossWorkspaceSwitchRender
            && !!summaryBucket;
        // Empty shortcut cards still map to the activeWorkspace context.
        const catLinks = isDetachedParkingCard
            ? detachedModel.links.slice()
            : (canUseLazyDeferredLinks ? [] : resolveCategoryLinks(catWsId, cat));
        const catLinkCount = isDetachedParkingCard
            ? catLinks.length
            : (canUseLazyDeferredLinks
                ? Math.max(0, Number(summaryBucket?.bookmarkCount || 0))
                : catLinks.length);
        
        const hasFolderContent = isDetachedParkingCard
            ? !!(detachedModel?.viewModel?.nodes?.length)
            : hasFolderBackedCategory(catWsId, cat);
        const shouldRenderEmptyCard = !searchStr && (
            window.EveCategoryOrder?.hasCategory
                ? window.EveCategoryOrder.hasCategory(activeWorkspace, cat)
                : workspaceCategoryOrder.includes(cat)
        );

        if (catLinkCount > 0 || hasFolderContent || shouldRenderEmptyCard) {
            const buildConfig = {
                ...config,
                searchStr: searchStr,
                focusMode: !!focusCategory,
                activeWorkspace: activeWorkspace, // Global active WS
                _renderGen: renderGen,
                _dashboardRenderHint: renderHint || null,
                _dashboardRenderContext: dashboardRenderContext
            };
            if ((aggressiveDeferredCards && catLinkCount > 0) || isCrossWorkspaceSwitchRender) {
                buildConfig._forceDeferredShell = true;
                buildConfig._deferredHydrationDelayMs = isCrossWorkspaceSwitchRender
                    ? Math.min(120, 12 + (renderCount * 10))
                    : (renderCount < CARD_CAP ? 0 : 12);
            }
            if (canUseLazyDeferredLinks) {
                buildConfig._deferredLinkCount = catLinkCount;
                buildConfig._deferredLinksLoader = function () {
                    return resolveCategoryLinks(catWsId, cat);
                };
            }
            if (isDetachedParkingCard) {
                buildConfig.virtualFolderViewModel = detachedModel.viewModel;
                buildConfig.detachedParkingCard = true;
            }

            if (isCrossWorkspaceSwitchRender) {
                window.DashboardCategories.renderCard(catObj, catLinks, gridContainer, buildConfig);
                renderCount++;
            } else if (renderCount < CARD_CAP) {
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
        var BATCH_SIZE = aggressiveDeferredCards
            ? 3
            : (visibleLinks.length > 500 ? 2 : 4);
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
