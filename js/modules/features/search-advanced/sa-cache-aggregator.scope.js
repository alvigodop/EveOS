window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.CacheAggregatorScope) return;

    function getWorkspaceIdsInScope(scope) {
        if (Array.isArray(scope?.workspaceIds) && scope.workspaceIds.length) {
            const explicitIds = new Set();
            scope.workspaceIds.forEach(function (workspaceId) {
                const id = String(workspaceId || '').trim().toLowerCase();
                if (id) explicitIds.add(id);
            });
            return explicitIds.size ? explicitIds : null;
        }
        if (!scope?.workspaceId) return null;
        const wsId = String(scope.workspaceId).trim().toLowerCase();
        const ids = new Set([wsId]);
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = window.eveState?.config?.workspaces
            || (typeof config !== 'undefined' ? config.workspaces : null)
            || [];
        if (helpers?.findById && helpers?.getDescendantIds) {
            const ws = helpers.findById(workspaces, wsId);
            if (ws) helpers.getDescendantIds(ws).forEach(function (id) { ids.add(String(id || '').trim().toLowerCase()); });
        }
        return ids;
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function hasUsableDatapackSnapshot(indexApi) {
        if (!indexApi) return false;
        const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        return typeof indexApi.hasUsableSnapshot === 'function'
            ? indexApi.hasUsableSnapshot()
            : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    }

    function hasReadableDatapackLinkSnapshot(indexApi) {
        if (!indexApi) return false;
        if (typeof indexApi.hasReadableLinkSnapshot === 'function') return !!indexApi.hasReadableLinkSnapshot();
        return hasUsableDatapackSnapshot(indexApi);
    }

    function getDatapackSnapshot(indexApi) {
        if (!hasReadableDatapackLinkSnapshot(indexApi) || typeof indexApi?.getSnapshot !== 'function') return null;
        return indexApi.getSnapshot();
    }

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function buildLiveLinkMap(links) {
        const map = new Map();
        (Array.isArray(links) ? links : []).forEach(function (link) {
            const linkId = String(link?.id || '').trim();
            if (linkId) map.set(linkId, link);
        });
        return map;
    }

    function getRecordWorkspaceIds(record) {
        const rawIds = Array.isArray(record?.workspaceIds) && record.workspaceIds.length
            ? record.workspaceIds
            : [record?.workspaceId];
        return rawIds.map(function (workspaceId) {
            return String(workspaceId || '').trim();
        }).filter(Boolean);
    }

    function matchesSnapshotScope(record, wsIds, catFilter) {
        if (!record) return false;
        if (wsIds && !getRecordWorkspaceIds(record).some(function (workspaceId) { return wsIds.has(workspaceId.toLowerCase()); })) {
            return false;
        }
        if (catFilter) {
            const recordCategory = String(record?.categoryName || record?.path?.categoryName || 'Unsorted').trim() || 'Unsorted';
            if (recordCategory !== catFilter) return false;
        }
        return true;
    }

    function getScopedLinks(scope) {
        const indexApi = getDatapackIndexApi();
        if (indexApi && hasReadableDatapackLinkSnapshot(indexApi)
            && typeof indexApi.getScopedBookmarkLinkIds === 'function'
            && typeof indexApi.resolveBookmarkLink === 'function') {
            const liveLinkMap = buildLiveLinkMap(getLiveLinks());
            return indexApi.getScopedBookmarkLinkIds(scope || null).map(function (linkId) {
                const normalizedId = String(linkId || '').trim();
                if (!normalizedId) return null;
                return liveLinkMap.get(normalizedId) || indexApi.resolveBookmarkLink(normalizedId);
            }).filter(Boolean);
        }

        const links = getLiveLinks();
        const wsIds = getWorkspaceIdsInScope(scope);
        const catFilter = scope?.categoryName ? String(scope.categoryName).trim() : null;

        return links.filter(function (link) {
            if (!link) return false;
            if (wsIds && !wsIds.has(String(link.workspace || 'main').trim().toLowerCase())) return false;
            if (catFilter && String(link.category || 'Unsorted').trim() !== catFilter) return false;
            return true;
        });
    }

    function getVisibleCategories(scope) {
        const indexApi = getDatapackIndexApi();
        const snapshot = getDatapackSnapshot(indexApi);
        const wsIds = getWorkspaceIdsInScope(scope);
        const catFilter = scope?.categoryName ? String(scope.categoryName).trim() : null;
        if (Array.isArray(snapshot?.records)) {
            const categories = new Set();
            snapshot.records.forEach(function (record) {
                if (String(record?.type || '').trim() !== 'card') return;
                if (!matchesSnapshotScope(record, wsIds, catFilter)) return;
                const categoryName = String(record?.categoryName || 'Unsorted').trim() || 'Unsorted';
                if (categoryName) categories.add(categoryName);
            });
            return Array.from(categories);
        }

        const scopedLinks = getScopedLinks(scope);
        const categories = new Set();
        scopedLinks.forEach(function (link) {
            const cat = String(link?.category || 'Unsorted').trim();
            if (cat) categories.add(cat);
        });
        return Array.from(categories);
    }

    ns.CacheAggregatorScope = {
        getWorkspaceIdsInScope,
        getDatapackIndexApi,
        getDatapackSnapshot,
        getLiveLinks,
        getScopedLinks,
        getVisibleCategories
    };
})();
