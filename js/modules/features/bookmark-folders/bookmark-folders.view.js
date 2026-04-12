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
            ghostFolders = [];
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



        const nodeMap = buildNodeMap(scopedNodes);

        const childrenMap = buildChildrenMap(scopedNodes);

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

