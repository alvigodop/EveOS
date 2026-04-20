window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {

    const shared = ns._shared || {};

    const {
        normalizeFolderId,
        getLibraryEntryForLink
    } = shared;

    const ghostSensorHelpers = ns._ghostSensorsHelpers || {};
    const getEmptyGhostDerivedState = () => ({
        recentTime: 0,
        nowMs: Date.now(),
        staleMs: 90 * 24 * 60 * 60 * 1000,
        recentVisMs: 7 * 24 * 60 * 60 * 1000,
        ancientsMs: 2 * 365 * 24 * 60 * 60 * 1000,
        recentLinks: [],
        unlinkedLinks: [],
        missingIcons: [],
        missingCovers: [],
        duplicateSuspects: [],
        untaggedLinks: [],
        needsReviewLinks: [],
        unreadLinks: [],
        readingLinks: [],
        completedLinks: [],
        onHoldLinks: [],
        droppedLinks: [],
        brokenLinks: [],
        missingNotesLinks: [],
        topRatedLinks: [],
        deadLinks: [],
        redirectedLinks: [],
        titleDriftLinks: [],
        recentlyVisited: [],
        staleLinks: [],
        ancientsLinks: [],
        noTitleLinks: [],
        orphanedLibEntries: [],
        domainGhosts: [],
        topGenres: [],
        doneLinks: [],
        pendingLinks: [],
        notTaskLinks: [],
        tvLockedLinks: [],
        tvAboveTrueLinks: [],
        tvNearTrueLinks: [],
        tvBelowTrueLinks: [],
        linkedLinks: [],
        lowConfidenceLinks: [],
        highConfidenceLinks: []
    });
    const computeGhostDerivedState = typeof ghostSensorHelpers.computeGhostDerivedState === 'function'
        ? ghostSensorHelpers.computeGhostDerivedState
        : getEmptyGhostDerivedState;

    function collectFolderScopeIds(rootFolderId, realNodeMap, realChildrenMap) {

        if (!rootFolderId || !realNodeMap?.has(rootFolderId)) return null;

        const ids = new Set();
        const stack = [rootFolderId];

        while (stack.length > 0) {

            const currentId = stack.pop();

            if (!currentId || ids.has(currentId)) continue;

            ids.add(currentId);

            (realChildrenMap?.get(currentId) || []).forEach((childNode) => {

                if (childNode?.id) stack.push(childNode.id);

            });

        }

        return ids;

    }

    function filterLinksToActiveFolderScope(links, rootFolderId, realNodeMap, realChildrenMap) {

        if (!rootFolderId) return Array.isArray(links) ? links.slice() : [];

        const allowedFolderIds = collectFolderScopeIds(rootFolderId, realNodeMap, realChildrenMap);

        if (!allowedFolderIds || allowedFolderIds.size === 0) return [];

        return (Array.isArray(links) ? links : []).filter((link) => {

            const folderId = normalizeFolderId(link?.folderId);

            return !!folderId && allowedFolderIds.has(folderId);

        });

    }

    function buildGhostSensorState(context) {

        const {
            workspaceId,
            categoryName,
            cardLinks,
            scopedNodes,
            scopedCardKey,
            activeRealFolderId,
            realNodeMap,
            realChildrenMap
        } = context || {};

        const activeLinks = filterLinksToActiveFolderScope(cardLinks, activeRealFolderId, realNodeMap, realChildrenMap);

        const isGhostEnabled = (type) => !window.EveFolderViewV2 || window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, type);

        const ghostFolders = [];
        const masterGhostId = '__ghost_master__';
        const ghostCategories = {
            linkHealth: { id: '__ghost_cat_linkHealth__', name: '[ Link Health ]', links: [] },
            domains: { id: '__ghost_cat_domains__', name: '[ Domains ]', links: [] },
            readingStatus: { id: '__ghost_cat_readingStatus__', name: '[ Reading Status ]', links: [] },
            taskStatus: { id: '__ghost_cat_taskStatus__', name: '[ Task Status ]', links: [] },
            maintenance: { id: '__ghost_cat_maintenance__', name: '[ Maintenance ]', links: [] },
            activity: { id: '__ghost_cat_activity__', name: '[ Activity ]', links: [] },
            insights: { id: '__ghost_cat_insights__', name: '[ Insights ]', links: [] },
            trueValue: { id: '__ghost_cat_trueValue__', name: '[ True Value ]', links: [] },
            indexes: { id: '__ghost_cat_indexes__', name: '[ Smart Indexes ]', links: [] }
        };
        const activeSubGhosts = [];
        const rootRecursiveTasks = [];

        const libraryEntryCache = new Map();

        activeLinks.forEach((link) => {

            libraryEntryCache.set(String(link?.id || ''), getLibraryEntryForLink(workspaceId, categoryName, link?.id));

        });

        const getCachedEntry = (link) => libraryEntryCache.get(String(link?.id || '')) || null;

        const preferredGhostChain = Array.isArray(window.eveState?.config?.activeManhwaFolderChains?.[scopedCardKey])
            ? window.eveState.config.activeManhwaFolderChains[scopedCardKey]
                .map((item) => ({
                    dimension: String(item?.dimension || '').trim(),
                    valueKey: String(item?.valueKey || '').trim().toLowerCase(),
                    label: String(item?.label || '').trim()
                }))
                .filter((item) => item.dimension && item.valueKey)
            : [];

        const isMegaSensor = activeLinks.length > 500;
        const derivedGhostNodeBudget = {
            count: 0,
            max: isMegaSensor
                ? 200
                : activeLinks.length <= 16
                    ? 12000
                    : activeLinks.length <= 48
                        ? 10000
                        : Math.min(12000, Math.max(5000, activeLinks.length * 70))
        };
        const derivedValueLimit = isMegaSensor ? 5 : (activeLinks.length > 120 ? 8 : 10);
        const derivedDepthLimit = isMegaSensor ? 2 : 4;
        const derivedState = computeGhostDerivedState({
            activeLinks,
            isGhostEnabled,
            getCachedEntry,
            workspaceId,
            categoryName,
            isMegaSensor
        });

        return {
            workspaceId,
            categoryName,
            activeRealFolderId,
            scopedNodes,
            activeLinks,
            isGhostEnabled,
            ghostFolders,
            masterGhostId,
            ghostCategories,
            activeSubGhosts,
            rootRecursiveTasks,
            libraryEntryCache,
            getCachedEntry,
            preferredGhostChain,
            derivedGhostNodeBudget,
            derivedValueLimit,
            derivedDepthLimit,
            ...derivedState
        };

    }

    ns._ghostSensors = ns._ghostSensors || {};
    ns._ghostSensors.buildGhostSensorState = buildGhostSensorState;

})(window.EveBookmarkFolders);
