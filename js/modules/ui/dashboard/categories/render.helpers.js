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
    if (!indexApi || (typeof indexApi.ensureFresh !== 'function' && typeof indexApi.rebuild !== 'function')) return;
    if (dashboardCategorySummaryWarmPromise) return;
    var scrollSeqAtRequest = Number(window._dashboardScrollActivitySeq || 0);
    var warmPromise = typeof indexApi.ensureFresh === 'function'
        ? indexApi.ensureFresh({ reason: 'dashboard-categories', allowStale: true, deferMs: 1400 })
        : indexApi.rebuild({ reason: 'dashboard-categories' });

    dashboardCategorySummaryWarmPromise = Promise.resolve(warmPromise)
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
    var hasUsableSnapshot = typeof indexApi.hasReadableStructureSnapshot === 'function'
        ? indexApi.hasReadableStructureSnapshot()
        : (typeof indexApi.hasUsableSnapshot === 'function'
            ? indexApi.hasUsableSnapshot()
            : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0));
    if (!hasUsableSnapshot) {
        queueDashboardCategorySummaryWarmup();
        if (Number(buildState?.builtAt || 0) <= 0) return null;
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
    var hasReadableSnapshot = typeof indexApi.hasReadableLinkSnapshot === 'function'
        ? indexApi.hasReadableLinkSnapshot()
        : (typeof indexApi.hasUsableSnapshot === 'function'
            ? indexApi.hasUsableSnapshot()
            : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0));
    var hasUsableSnapshot = typeof indexApi.hasUsableSnapshot === 'function'
        ? indexApi.hasUsableSnapshot()
        : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    if (!hasReadableSnapshot && !hasUsableSnapshot) return null;

    var linkMap = visibleLinkIdMap instanceof Map ? visibleLinkIdMap : new Map();
    var resolveIndexedLink = typeof indexApi.resolveBookmarkLink === 'function'
        ? function (linkId) { return indexApi.resolveBookmarkLink(linkId); }
        : null;

    var resolvedLinks = indexApi.getExactBookmarkLinkIds({
        workspaceId: workspaceId,
        categoryName: categoryName
    }).map(function (linkId) {
        var normalizedId = String(linkId || '').trim();
        if (!normalizedId) return null;
        return linkMap.get(normalizedId)
            || (resolveIndexedLink ? resolveIndexedLink(normalizedId) : null)
            || null;
    }).filter(Boolean);
    return resolvedLinks.length ? resolvedLinks : null;
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
