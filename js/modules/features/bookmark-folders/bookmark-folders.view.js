window.EveBookmarkFolders = window.EveBookmarkFolders || {};



(function (ns) {

    const shared = ns._shared || {};

    const ghosts = ns._ghosts || {};

    const { buildGhostAugmentedScope } = ghosts;

    const {

        getScopedNodes,

        buildScopedKey,

        buildNodeMap,

        buildChildrenMap,

        normalizeFolderId,

        getLibraryEntryForLink,

        getNormalizedDuplicateUrl,

        hasMeaningfulIcon,

        hasBookmarkTags,

        hasLibraryTaxonomy,

        hasMeaningfulCover,

        isAutoSourceSummary,

        uniqueNonEmpty,

        splitLibraryFieldValues,

        normalizeLanguageLabel,

        normalizeStatusLabel,

        getDerivedTagValues,

        getDerivedGenreValues,

        getDerivedAuthorValues,

        getDerivedLanguageValues,

        getDerivedStatusValue,

        getDerivedRatingValue,

        getDerivedConfidenceValue,

        getRatingBucketLabel,

        getConfidenceBucketLabel,

        getDerivedProgressValue,

        getProgressBucketLabel,

        getDerivedDemographicValue,

        getDerivedPublicationValue,

        getPublicationBucketLabel,

        getTitleInitial,

        getCoarseTitleBucket,

        getDerivedTimelineBucket

    } = shared;



    function buildViewNodeMap(nodes) {

        const normalizedMap = buildNodeMap(nodes);

        const rawById = new Map();

        (Array.isArray(nodes) ? nodes : []).forEach((node) => {

            const id = normalizeFolderId(node?.id);

            if (id && !rawById.has(id)) rawById.set(id, node);

        });

        const map = new Map();

        normalizedMap.forEach((node, id) => {

            map.set(id, Object.assign({}, rawById.get(id) || {}, node));

        });

        return map;

    }



    function buildViewChildrenMap(nodes) {

        const map = new Map();

        buildViewNodeMap(nodes).forEach((node) => {

            const parentId = normalizeFolderId(node?.parentId) || null;

            if (!map.has(parentId)) map.set(parentId, []);

            map.get(parentId).push(node);

        });

        map.forEach((siblings) => {

            siblings.sort((a, b) => {

                const orderDiff = (Number(a?.order) || 0) - (Number(b?.order) || 0);

                if (orderDiff !== 0) return orderDiff;

                return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });

            });

        });

        return map;

    }



    function buildFolderView(workspaceId, categoryName, cardLinks, options) {

        let scopedNodes = getScopedNodes(workspaceId, categoryName);

        const scopedCardKey = buildScopedKey(workspaceId, categoryName);

        const realScopedNodes = scopedNodes.filter((node) => !node?.isGhost);

        const realNodeMap = buildNodeMap(realScopedNodes);

        const realChildrenMap = buildChildrenMap(realScopedNodes);

        const configuredScopeRootId = normalizeFolderId(window.eveState?.config?.activeManhwaScopeRoots?.[scopedCardKey]);

        const configuredActiveFolderId = normalizeFolderId(window.eveState?.config?.activeManhwaFolders?.[scopedCardKey]);

        const activeRealFolderId = configuredScopeRootId && realNodeMap.has(configuredScopeRootId)

            ? configuredScopeRootId

            : (configuredActiveFolderId && realNodeMap.has(configuredActiveFolderId)

                ? configuredActiveFolderId

                : null);

        // For mega-cards, skip the expensive ghost sensor system entirely.
        // Ghost folders (System Views, domains, genres, health, etc.) require 25+
        // full-array iterations over all links and are not needed for initial paint.
        var activeLinks;
        var ghostFolders;
        if (options && options.skipGhosts) {
            activeLinks = Array.isArray(cardLinks) ? cardLinks : [];
            ghostFolders = [{
                id: '__ghost_master__',
                name: '[ System Views ]',
                parentId: activeRealFolderId || null,
                isGhost: true,
                isMasterGhost: true,
                isGhostPlaceholder: true,
                _ghostLinks: [],
                _ghostScopeRootId: activeRealFolderId || null
            }];
            scopedNodes = [...ghostFolders, ...scopedNodes];
        } else {

            const ghostScope = buildGhostAugmentedScope({

                workspaceId,

                categoryName,

                cardLinks,

                scopedNodes,

                scopedCardKey,

                activeRealFolderId,

                realNodeMap,

                realChildrenMap

            });



            scopedNodes = ghostScope.scopedNodes;

            activeLinks = ghostScope.activeLinks;

            ghostFolders = ghostScope.ghostFolders;

        }



        const nodeMap = buildViewNodeMap(scopedNodes);

        const childrenMap = buildViewChildrenMap(scopedNodes);

        const folderLinks = new Map();

        const rootLinks = [];



        // Pre-fill ghost folder links

        ghostFolders.forEach(gf => {

            folderLinks.set(gf.id, gf._ghostLinks);

        });



        activeLinks.forEach((link) => {

            const folderId = normalizeFolderId(link?.folderId);

            if (folderId && nodeMap.has(folderId) && !nodeMap.get(folderId).isGhost) {

                if (!folderLinks.has(folderId)) folderLinks.set(folderId, []);

                folderLinks.get(folderId).push(link);

                return;

            }

            rootLinks.push(link);

        });



        return {

            nodes: scopedNodes,

            nodeMap,

            childrenMap,

            folderLinks,

            rootLinks,

            topLevelFolders: childrenMap.get(null) || []

        };

    }



    ns.buildFolderView = buildFolderView;

})(window.EveBookmarkFolders);

