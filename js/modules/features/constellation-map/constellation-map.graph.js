window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const builders = ns._graphBuilders || {};
    const detached = ns._graphDetached || {};
    const world = ns._graphWorld || {};

    const {
        state,
        getViewportSize,
        clearInspectorCoverRotation,
        resetStaticLocks,
        normalizeScope,
        getScopedLinks,
        text,
        MAX_TAG_EDGES_PER_CLUSTER,
        getWorkspaceName,
        getAllWorkspaceIds,
        placeOnRing,
        createNode,
        getCategoryNames,
        getFolderView,
        collectFolderSubtree,
        addNode,
        addEdge,
        createManualAnchor,
        getResolvedMapThemeColorValue
    } = shared;

    const {
        createBuildContext,
        buildCoverCandidates,
        getFolderBranchLinks,
        addLinkNode,
        addFolderBranch,
        addCategoryBranch
    } = builders;

    const { addDetachedParking } = detached;
    const { initializeWorldField, getGraphBounds } = world;

    function buildGraphData(scopeOption, options = {}) {
        const scope = normalizeScope(scopeOption);
        const preserveLocks = options?.preserveLocks === true;
        const scopedLinks = getScopedLinks(scope);
        const { width, height } = getViewportSize();
        const centerX = width / 2;
        const centerY = height / 2;
        const context = createBuildContext(scope, scopedLinks);

        state.scope = scope;
        state.nodes = [];
        state.nodeIndex = new Map();
        state.motionAnchors = new Map();
        state.edges = [];
        state.edgeKeys = new Set();
        state.hovered = null;
        state.selected = null;
        state.selectionIds = new Set();
        state.actionWheel = { visible: false, nodeId: '', clientX: 0, clientY: 0, items: [] };
        state.searchState = { query: '', index: -1, matches: [] };
        state.infoCollapsed = true;
        state.infoHovered = false;
        state.infoHoverStartedAt = 0;
        clearInspectorCoverRotation();
        state.coverPreviewSession = null;
        state.pointer.forcePan = false;

        if (!preserveLocks) {
            resetStaticLocks();
        }

        if (scope.scope === 'all') {
            const workspaceIds = getAllWorkspaceIds(scopedLinks);
            workspaceIds.forEach((workspaceId, workspaceIndex) => {
                const workspaceLinks = scopedLinks.filter((link) => String(link?.workspace || 'main') === String(workspaceId));
                const workspacePosition = placeOnRing(workspaceIndex, workspaceIds.length, Math.min(width, height) * 0.22, centerX, centerY, 18);
                const workspaceNode = addNode(createNode({
                    id: 'workspace_' + workspaceId,
                    label: getWorkspaceName(workspaceId),
                    color: getResolvedMapThemeColorValue('workspaceNodeColor'),
                    radius: 15,
                    kind: 'workspace',
                    x: workspacePosition.x,
                    y: workspacePosition.y,
                    meta: workspaceLinks.length + ' bookmark' + (workspaceLinks.length === 1 ? '' : 's'),
                    data: {
                        workspaceId,
                        coverCandidates: buildCoverCandidates(workspaceLinks),
                        depth: -2
                    }
                }));
                const categories = getCategoryNames(workspaceId, workspaceLinks);
                categories.forEach((categoryName, categoryIndex) => {
                    const categoryCenter = placeOnRing(categoryIndex, categories.length, 128 + ((categoryIndex % 4) * 12), workspaceNode.x, workspaceNode.y, 10);
                    addCategoryBranch(context, workspaceId, categoryName, categoryCenter, workspaceNode);
                });
            });
        } else if (scope.scope === 'card') {
            addCategoryBranch(context, scope.workspaceId, text(scope.categoryName, 'Unsorted'), { x: centerX, y: centerY }, null);
        } else if (scope.scope === 'folder') {
            const folderView = getFolderView(scope.workspaceId, text(scope.categoryName, 'Unsorted'), scopedLinks);
            const subtree = collectFolderSubtree(folderView, scope.folderId);
            if (subtree) {
                const folderBranchLinks = getFolderBranchLinks(context, folderView, subtree.targetNode?.id);
                const folderNode = addNode(createNode({
                    id: 'folder_' + scope.workspaceId + '_' + text(scope.categoryName, 'Unsorted') + '_' + String(subtree.targetNode.id),
                    chainId: 'chain_' + scope.workspaceId + '_' + text(scope.categoryName, 'Unsorted'),
                    label: text(subtree.targetNode?.name, 'Folder'),
                    color: getResolvedMapThemeColorValue('folderNodeColor'),
                    radius: 10,
                    kind: 'folder',
                    x: centerX,
                    y: centerY,
                    meta: getWorkspaceName(scope.workspaceId) + ' / ' + text(scope.categoryName, 'Unsorted') + ' / ' + text(subtree.targetNode?.name, 'Folder'),
                    data: {
                        workspaceId: scope.workspaceId,
                        categoryName: text(scope.categoryName, 'Unsorted'),
                        coverCandidates: buildCoverCandidates(folderBranchLinks),
                        folderId: String(subtree.targetNode.id)
                    }
                }));
                if (state.stableMainNodes) {
                    folderNode.manualAnchor = createManualAnchor(folderNode);
                }
                subtree.directLinks.forEach((link, index) => {
                    addLinkNode(context, scope.workspaceId, text(scope.categoryName, 'Unsorted'), folderNode, link, index, subtree.directLinks.length, 68);
                });
                subtree.childFolders.forEach((childFolder, index) => {
                    addFolderBranch(context, scope.workspaceId, text(scope.categoryName, 'Unsorted'), childFolder, folderView, folderNode, index, subtree.childFolders.length, 92);
                });
            }
        } else if (scope.scope === 'derived') {
            const derivedCategoryName = text(scope.categoryName, '');
            if (derivedCategoryName) {
                addCategoryBranch(context, scope.workspaceId, derivedCategoryName, { x: centerX, y: centerY }, null);
            } else {
                const categories = getCategoryNames(scope.workspaceId, scopedLinks);
                categories.forEach((categoryName, categoryIndex) => {
                    const categoryCenter = placeOnRing(categoryIndex, categories.length, Math.min(width, height) * 0.24, centerX, centerY, 16);
                    addCategoryBranch(context, scope.workspaceId, categoryName, categoryCenter, null);
                });
            }
        } else {
            const categories = getCategoryNames(scope.workspaceId, scopedLinks);
            categories.forEach((categoryName, categoryIndex) => {
                const categoryCenter = placeOnRing(categoryIndex, categories.length, Math.min(width, height) * 0.24, centerX, centerY, 16);
                addCategoryBranch(context, scope.workspaceId, categoryName, categoryCenter, null);
            });
        }

        addDetachedParking(scope, centerX, centerY, width, height);

        context.tagBuckets.forEach((bucketNodes) => {
            const uniqueNodes = Array.from(new Set(bucketNodes));
            if (uniqueNodes.length < 2) return;
            const anchor = uniqueNodes[0];
            const maxEdges = Math.min(uniqueNodes.length - 1, MAX_TAG_EDGES_PER_CLUSTER);
            for (let index = 1; index <= maxEdges; index += 1) {
                addEdge(anchor, uniqueNodes[index], 'tag');
            }
        });

        initializeWorldField(centerX, centerY);
    }

    const graph = ns._graph = ns._graph || {};
    Object.assign(graph, { buildGraphData, initializeWorldField, getGraphBounds });
})(window.EveConstellationMap);
