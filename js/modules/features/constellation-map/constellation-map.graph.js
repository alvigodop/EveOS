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
        getResolvedMapThemeColorValue,
        getLinkColor,
        getLinkMeta
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

    const graphProjection = ns._graphProjection || {};
    const { tryBuildGraphDataFromNexusProjection } = graphProjection;

function buildGraphData(scopeOption, options = {}) {
        const scope = normalizeScope(scopeOption);
        const preserveLocks = options?.preserveLocks === true;
        const scopedLinks = getScopedLinks(scope);
        const scopedWorkspaceIds = Array.isArray(scope.workspaceIds) && scope.workspaceIds.length
            ? new Set(scope.workspaceIds.map(function (value) { return text(value, ''); }).filter(Boolean))
            : null;
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

        if (!options?.skipNexusProjection) {
            const usedProjection = tryBuildGraphDataFromNexusProjection(scope, scopedLinks, context, centerX, centerY, width, height);
            if (usedProjection && typeof usedProjection.then === 'function') {
                return usedProjection.then(function (resolvedUsedProjection) {
                    if (resolvedUsedProjection) return true;
                    return buildGraphData(scope, Object.assign({}, options, { skipNexusProjection: true }));
                });
            }
            if (usedProjection) return true;
        }

        if (scope.scope === 'all') {
            const wsHelpers = window.EveWorkspaceHelpers;
            const configObj = typeof config !== 'undefined' ? config : (window.config || {});
            const configWorkspaces = Array.isArray(configObj.workspaces) ? configObj.workspaces : [];

            // Recursive workspace node builder for sub-tab hierarchy
            function addWorkspaceBranch(ws, parentWorkspaceNode, wsIndex, wsSiblingCount, ringRadius, ringCenterX, ringCenterY, wsDepth) {
                const workspaceId = text(ws?.id, 'main');
                if (scopedWorkspaceIds && !scopedWorkspaceIds.has(workspaceId)) return;
                const workspaceLinks = scopedLinks.filter((link) => String(link?.workspace || 'main') === workspaceId);
                const workspacePosition = placeOnRing(wsIndex, Math.max(wsSiblingCount, 1), ringRadius, ringCenterX, ringCenterY, 18);
                const nodeRadius = Math.max(8, 15 - (wsDepth * 2));
                const isHiddenInParent = !!(ws?.hiddenInParent && wsDepth > 0);
                const wsLabel = text(ws?.name, workspaceId) + (isHiddenInParent ? ' [hidden]' : '');
                const wsColor = isHiddenInParent
                    ? getResolvedMapThemeColorValue('mapAccent') || 'rgba(140,140,140,0.5)'
                    : getResolvedMapThemeColorValue('workspaceNodeColor');
                const workspaceNode = addNode(createNode({
                    id: 'workspace_' + workspaceId,
                    label: wsLabel,
                    color: wsColor,
                    radius: nodeRadius,
                    kind: 'workspace',
                    x: workspacePosition.x,
                    y: workspacePosition.y,
                    meta: workspaceLinks.length + ' bookmark' + (workspaceLinks.length === 1 ? '' : 's'),
                    data: {
                        workspaceId,
                        coverCandidates: buildCoverCandidates(workspaceLinks),
                        depth: -2 - wsDepth,
                        anchorNodeId: parentWorkspaceNode?.id || '',
                        hiddenInParent: isHiddenInParent
                    }
                }));
                if (!parentWorkspaceNode && state.stableMainNodes) {
                    workspaceNode.manualAnchor = createManualAnchor(workspaceNode);
                }

                // Connect to parent workspace node
                if (parentWorkspaceNode) {
                    addEdge(workspaceNode, parentWorkspaceNode, 'hierarchy');
                }

                // Add category branches
                const categories = getCategoryNames(workspaceId, workspaceLinks);
                categories.forEach((categoryName, categoryIndex) => {
                    const categoryCenter = placeOnRing(categoryIndex, categories.length, 128 + ((categoryIndex % 4) * 12), workspaceNode.x, workspaceNode.y, 10);
                    addCategoryBranch(context, workspaceId, categoryName, categoryCenter, workspaceNode);
                });

                // Recurse into sub-tabs
                const subTabs = Array.isArray(ws?.subTabs)
                    ? ws.subTabs.filter(function (childWorkspace) {
                        return !scopedWorkspaceIds || scopedWorkspaceIds.has(text(childWorkspace?.id, ''));
                    })
                    : [];
                if (subTabs.length > 0) {
                    const subRadius = Math.max(40, ringRadius * 0.55);
                    subTabs.forEach((childWs, childIndex) => {
                        addWorkspaceBranch(childWs, workspaceNode, childIndex, subTabs.length, subRadius, workspaceNode.x, workspaceNode.y, wsDepth + 1);
                    });
                }
            }

            // Build from config tree if available, else fallback to flat IDs
            if (wsHelpers && configWorkspaces.length > 0) {
                const rootWorkspaces = scopedWorkspaceIds
                    ? configWorkspaces.filter(function (workspace) {
                        return scopedWorkspaceIds.has(text(workspace?.id, ''));
                    })
                    : configWorkspaces;
                rootWorkspaces.forEach((ws, wsIndex) => {
                    addWorkspaceBranch(ws, null, wsIndex, rootWorkspaces.length, Math.min(width, height) * 0.22, centerX, centerY, 0);
                });
            } else {
                const workspaceIds = scopedWorkspaceIds && scopedWorkspaceIds.size
                    ? Array.from(scopedWorkspaceIds)
                    : getAllWorkspaceIds(scopedLinks);
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
                            anchorNodeId: '',
                            depth: -2
                        }
                    }));
                    if (state.stableMainNodes) {
                        workspaceNode.manualAnchor = createManualAnchor(workspaceNode);
                    }
                    const categories = getCategoryNames(workspaceId, workspaceLinks);
                    categories.forEach((categoryName, categoryIndex) => {
                        const categoryCenter = placeOnRing(categoryIndex, categories.length, 128 + ((categoryIndex % 4) * 12), workspaceNode.x, workspaceNode.y, 10);
                        addCategoryBranch(context, workspaceId, categoryName, categoryCenter, workspaceNode);
                    });
                });
            }
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
            // Single workspace scope — no root node visible, just categories + sub-tab hierarchy
            const wsHelpers = window.EveWorkspaceHelpers;
            const configObj = typeof config !== 'undefined' ? config : (window.config || {});
            const configWorkspaces = Array.isArray(configObj.workspaces) ? configObj.workspaces : [];
            const rootWs = wsHelpers ? wsHelpers.findById(configWorkspaces, scope.workspaceId) : null;

            // Root workspace links (only direct, not descendant)
            const rootWsLinks = scopedLinks.filter((link) => String(link?.workspace || 'main') === String(scope.workspaceId));

            // Add category branches for root workspace — no parent node (original behavior)
            const rootCategories = getCategoryNames(scope.workspaceId, rootWsLinks);
            rootCategories.forEach((categoryName, categoryIndex) => {
                const categoryCenter = placeOnRing(categoryIndex, rootCategories.length, Math.min(width, height) * 0.24, centerX, centerY, 16);
                addCategoryBranch(context, scope.workspaceId, categoryName, categoryCenter, null);
            });

            // Recursively add sub-tab workspace nodes
            function addSubTabBranch(ws, parentNode, anchorX, anchorY, wsIndex, wsSiblingCount, ringRadius, wsDepth) {
                const workspaceId = text(ws?.id, '');
                if (!workspaceId) return;
                const wsLinks = scopedLinks.filter((link) => String(link?.workspace || 'main') === workspaceId);
                const pos = placeOnRing(wsIndex, Math.max(wsSiblingCount, 1), ringRadius, anchorX, anchorY, 18);
                const nodeRadius = Math.max(7, 12 - ((wsDepth - 1) * 2));
                const isHiddenInParent = !!ws?.hiddenInParent;
                const wsLabel = text(ws?.name, workspaceId) + (isHiddenInParent ? ' [hidden]' : '');
                const wsColor = isHiddenInParent
                    ? getResolvedMapThemeColorValue('mapAccent') || 'rgba(140,140,140,0.5)'
                    : getResolvedMapThemeColorValue('workspaceNodeColor');

                const subWsNode = addNode(createNode({
                    id: 'workspace_' + workspaceId,
                    label: wsLabel,
                    color: wsColor,
                    radius: nodeRadius,
                    kind: 'workspace',
                    x: pos.x,
                    y: pos.y,
                    meta: wsLinks.length + ' bookmark' + (wsLinks.length === 1 ? '' : 's'),
                    data: {
                        workspaceId,
                        coverCandidates: buildCoverCandidates(wsLinks),
                        anchorNodeId: parentNode?.id || '',
                        depth: -2 - wsDepth,
                        hiddenInParent: isHiddenInParent
                    }
                }));
                if (!parentNode && state.stableMainNodes) {
                    subWsNode.manualAnchor = createManualAnchor(subWsNode);
                }

                // Connect to parent sub-tab node (not root — root has no node)
                if (parentNode) {
                    addEdge(subWsNode, parentNode, 'hierarchy');
                }

                // Category branches for this sub-tab
                const subCategories = getCategoryNames(workspaceId, wsLinks);
                subCategories.forEach((catName, catIndex) => {
                    const catCenter = placeOnRing(catIndex, subCategories.length, 100 + ((catIndex % 3) * 10), subWsNode.x, subWsNode.y, 10);
                    addCategoryBranch(context, workspaceId, catName, catCenter, subWsNode);
                });

                // Recurse deeper
                const childTabs = Array.isArray(ws?.subTabs) ? ws.subTabs : [];
                if (childTabs.length > 0) {
                    const childRadius = Math.max(40, ringRadius * 0.55);
                    childTabs.forEach((child, childIdx) => {
                        addSubTabBranch(child, subWsNode, subWsNode.x, subWsNode.y, childIdx, childTabs.length, childRadius, wsDepth + 1);
                    });
                }
            }

            // Add sub-tabs orbiting center (no parent node to connect to)
            if (rootWs && Array.isArray(rootWs.subTabs) && rootWs.subTabs.length > 0) {
                const subTabRadius = Math.min(width, height) * 0.18;
                rootWs.subTabs.forEach((childWs, childIdx) => {
                    addSubTabBranch(childWs, null, centerX, centerY, childIdx, rootWs.subTabs.length, subTabRadius, 1);
                });
            }
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
        return true;
    }

    const graph = ns._graph = ns._graph || {};
    Object.assign(graph, { buildGraphData, initializeWorldField, getGraphBounds });
})(window.EveConstellationMap);
