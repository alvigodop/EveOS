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

    function getProjectionMapKind(node) {
        const kind = text(node?.kind || node?.sourceType, 'link');
        if (kind === 'workspace') return 'workspace';
        if (kind === 'card') return 'category';
        if (kind === 'folder') return 'folder';
        return 'link';
    }

    function getProjectionNodeId(node) {
        const workspaceId = text(node?.workspaceId, 'main');
        const categoryName = text(node?.categoryName, 'Unsorted');
        const folderId = text(node?.folderId, '');
        const linkId = text(node?.linkId, '');
        const sourceId = text(node?.id, '');
        const safeSourceId = sourceId.replace(/[^A-Za-z0-9_-]+/g, '_');
        const mapKind = getProjectionMapKind(node);

        if (mapKind === 'workspace') return 'workspace_' + workspaceId;
        if (mapKind === 'category') return 'category_' + workspaceId + '_' + categoryName;
        if (mapKind === 'folder') return 'folder_' + workspaceId + '_' + categoryName + '_' + folderId;
        if (linkId) return 'link_' + linkId;
        return 'nexus_' + safeSourceId;
    }

    function getProjectionNodeChainId(node, mapKind) {
        const workspaceId = text(node?.workspaceId, 'main');
        const categoryName = text(node?.categoryName, 'Unsorted');
        if (mapKind === 'category' || mapKind === 'folder' || mapKind === 'link') {
            return 'chain_' + workspaceId + '_' + categoryName;
        }
        return '';
    }

    function getProjectionNodeRadius(mapKind, node, depth) {
        if (mapKind === 'workspace') {
            return Math.max(8, 15 - (Math.max(depth, 0) * 2));
        }
        if (mapKind === 'category') return 12;
        if (mapKind === 'folder') return 8;
        if (text(node?.sourceType || node?.kind, '') === 'bookmark') return 4;
        if (text(node?.sourceType || node?.kind, '') === 'library') return 5;
        return 4.5;
    }

    function getProjectionNodeColor(mapKind, node, linkById) {
        if (mapKind === 'workspace') {
            return node?.hiddenInParent
                ? (getResolvedMapThemeColorValue('mapAccent') || 'rgba(140,140,140,0.5)')
                : getResolvedMapThemeColorValue('workspaceNodeColor');
        }
        if (mapKind === 'category') return getResolvedMapThemeColorValue('categoryNodeColor');
        if (mapKind === 'folder') {
            if (text(node?.healthState, '') === 'broken') {
                return getResolvedMapThemeColorValue('mapAccent') || 'rgba(255,120,120,0.7)';
            }
            return getResolvedMapThemeColorValue('folderNodeColor');
        }

        const linkId = text(node?.linkId, '');
        if (linkId && typeof getLinkColor === 'function') {
            const liveLink = linkById.get(linkId);
            if (liveLink) return getLinkColor(liveLink);
        }
        if (text(node?.healthState, '') === 'broken') return getResolvedMapThemeColorValue('mapAccent') || '#ff6b6b';
        if (text(node?.visibilityState, '') === 'hidden') return 'rgba(140, 180, 200, 0.72)';
        if (text(node?.sourceType || node?.kind, '') === 'knowledge') return '#77d4ff';
        if (text(node?.sourceType || node?.kind, '') === 'cached') return '#8be38f';
        if (text(node?.sourceType || node?.kind, '') === 'library') return '#ffd36b';
        return '#8fd3ff';
    }

    function buildProjectionNodeMeta(node, mapKind, scopedLinks, linkById, viewCache, context) {
        const workspaceId = text(node?.workspaceId, 'main');
        const categoryName = text(node?.categoryName, 'Unsorted');
        const folderId = text(node?.folderId, '');
        const linkId = text(node?.linkId, '');
        const label = text(node?.label, mapKind === 'folder' ? 'Folder' : mapKind === 'category' ? 'Card' : 'Node');

        if (mapKind === 'workspace') {
            const workspaceLinks = scopedLinks.filter(function (link) {
                return String(link?.workspace || 'main') === String(workspaceId);
            });
            return {
                meta: workspaceLinks.length + ' bookmark' + (workspaceLinks.length === 1 ? '' : 's'),
                coverCandidates: buildCoverCandidates(workspaceLinks)
            };
        }

        if (mapKind === 'category') {
            const categoryLinks = scopedLinks.filter(function (link) {
                return String(link?.workspace || 'main') === String(workspaceId)
                    && text(link?.category, 'Unsorted') === categoryName;
            });
            return {
                meta: getWorkspaceName(workspaceId) + ' / ' + categoryLinks.length + ' bookmark' + (categoryLinks.length === 1 ? '' : 's'),
                coverCandidates: buildCoverCandidates(categoryLinks)
            };
        }

        if (mapKind === 'folder') {
            const cacheKey = workspaceId + '::' + categoryName;
            let viewModel = viewCache.get(cacheKey);
            if (!viewModel) {
                const categoryLinks = scopedLinks.filter(function (link) {
                    return String(link?.workspace || 'main') === String(workspaceId)
                        && text(link?.category, 'Unsorted') === categoryName;
                });
                viewModel = getFolderView(workspaceId, categoryName, categoryLinks);
                viewCache.set(cacheKey, viewModel);
            }
            const folderBranchLinks = getFolderBranchLinks(context, viewModel, folderId);
            return {
                meta: getWorkspaceName(workspaceId) + ' / ' + categoryName + ' / ' + label,
                coverCandidates: buildCoverCandidates(folderBranchLinks)
            };
        }

        if (linkId && typeof getLinkMeta === 'function') {
            const liveLink = linkById.get(linkId);
            return {
                meta: liveLink ? getLinkMeta(workspaceId, categoryName, liveLink) : text(node?.meta, text(node?.pathLabel, label)),
                coverCandidates: liveLink ? buildCoverCandidates([liveLink]) : []
            };
        }

        return {
            meta: text(node?.meta, text(node?.pathLabel, label)),
            coverCandidates: []
        };
    }

    async function tryBuildGraphDataFromNexusProjection(scope, scopedLinks, context, centerX, centerY, width, height) {
        const projectionLoader = typeof ns.getNexusGraphProjection === 'function'
            ? ns.getNexusGraphProjection.bind(ns)
            : (window.EveOS?.DatapackIndex?.buildGraphProjection
                ? function (inputScope) { return window.EveOS.DatapackIndex.buildGraphProjection({ scope: inputScope || null }); }
                : (window.EveOS?.SearchAdvanced?.Index?.buildGraphProjection
                    ? function (inputScope) { return window.EveOS.SearchAdvanced.Index.buildGraphProjection({ scope: inputScope || null }); }
                    : null));
        if (!projectionLoader) return false;

        let projection = null;
        try {
            projection = await projectionLoader(scope);
        } catch (error) {
            console.warn('[ConstellationMap] Nexus projection load failed, falling back to raw graph:', error);
            return false;
        }

        const projectionNodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
        const projectionEdges = Array.isArray(projection?.edges) ? projection.edges : [];
        if (!projectionNodes.length) return false;

        const nodeByProjectionId = new Map();
        const childrenByProjectionId = new Map();
        const parentByProjectionId = new Map();
        const linkById = new Map();
        const viewCache = new Map();

        scopedLinks.forEach(function (link) {
            const linkId = text(link?.id, '');
            if (linkId) linkById.set(linkId, link);
        });

        projectionNodes.forEach(function (node) {
            nodeByProjectionId.set(text(node?.id, ''), node);
        });
        projectionEdges.forEach(function (edge) {
            const sourceId = text(edge?.source, '');
            const targetId = text(edge?.target, '');
            if (!sourceId || !targetId) return;
            if (!childrenByProjectionId.has(sourceId)) childrenByProjectionId.set(sourceId, []);
            childrenByProjectionId.get(sourceId).push(targetId);
            if (!parentByProjectionId.has(targetId)) parentByProjectionId.set(targetId, sourceId);
        });

        function getRootNodes() {
            return projectionNodes.filter(function (node) {
                return !parentByProjectionId.has(text(node?.id, ''));
            });
        }

        function getPreferredRootNodes() {
            const preferredIds = Array.isArray(projection?.preferredRootIds) ? projection.preferredRootIds : [];
            if (!preferredIds.length) return [];
            return preferredIds.map(function (nodeId) {
                return nodeByProjectionId.get(text(nodeId, ''));
            }).filter(Boolean);
        }

        function getChildRadius(parentKind, childKind) {
            if (parentKind === 'workspace' && childKind === 'workspace') return 90;
            if (parentKind === 'workspace' && childKind === 'category') return 128;
            if (parentKind === 'category' && childKind === 'folder') return 78;
            if (parentKind === 'category' && childKind === 'link') return 66;
            if (parentKind === 'folder' && childKind === 'folder') return 92;
            if (parentKind === 'folder' && childKind === 'link') return 68;
            return 96;
        }

        function sortProjectionChildren(children) {
            const order = { workspace: 0, category: 1, folder: 2, link: 3 };
            return children.slice().sort(function (left, right) {
                const leftKind = getProjectionMapKind(left);
                const rightKind = getProjectionMapKind(right);
                return (order[leftKind] || 99) - (order[rightKind] || 99)
                    || text(left?.label, '').localeCompare(text(right?.label, ''));
            });
        }

        function addProjectionNode(projectionNode, parentMapNode, index, total, depth) {
            const projectionId = text(projectionNode?.id, '');
            const mapKind = getProjectionMapKind(projectionNode);
            const mapNodeId = getProjectionNodeId(projectionNode);
            const position = parentMapNode
                ? placeOnRing(index, Math.max(total, 1), getChildRadius(parentMapNode.kind, mapKind), parentMapNode.x, parentMapNode.y, 10)
                : (total <= 1
                    ? { x: centerX, y: centerY }
                    : placeOnRing(index, Math.max(total, 1), Math.min(width, height) * 0.22, centerX, centerY, 18));
            const label = text(projectionNode?.label, mapKind === 'category' ? 'Card' : mapKind === 'folder' ? 'Folder' : 'Node');
            const metaInfo = buildProjectionNodeMeta(projectionNode, mapKind, scopedLinks, linkById, viewCache, context);
            const mapNode = addNode(createNode({
                id: mapNodeId,
                chainId: getProjectionNodeChainId(projectionNode, mapKind),
                label: mapKind === 'workspace' && projectionNode?.hiddenInParent
                    ? (label + ' [hidden]')
                    : label,
                color: getProjectionNodeColor(mapKind, projectionNode, linkById),
                radius: getProjectionNodeRadius(mapKind, projectionNode, depth),
                kind: mapKind,
                x: position.x,
                y: position.y,
                meta: metaInfo.meta,
                data: {
                    workspaceId: text(projectionNode?.workspaceId, ''),
                    categoryName: text(projectionNode?.categoryName, ''),
                    folderId: text(projectionNode?.folderId, ''),
                    linkId: text(projectionNode?.linkId, ''),
                    url: text(projectionNode?.url, ''),
                    coverCandidates: metaInfo.coverCandidates,
                    anchorNodeId: parentMapNode?.id || '',
                    depth: mapKind === 'workspace'
                        ? (-2 - Math.max(depth, 0))
                        : mapKind === 'category'
                            ? -1
                            : Math.max(depth, 0),
                    hiddenInParent: !!projectionNode?.hiddenInParent,
                    visibilityState: text(projectionNode?.visibilityState, ''),
                    healthState: text(projectionNode?.healthState, ''),
                    sourceType: text(projectionNode?.sourceType || projectionNode?.kind, ''),
                    nexusId: projectionId,
                    pathLabel: text(projectionNode?.pathLabel, '')
                }
            }));

            if (!parentMapNode && state.stableMainNodes && mapKind !== 'link') {
                mapNode.manualAnchor = createManualAnchor(mapNode);
            }
            if (parentMapNode) {
                addEdge(mapNode, parentMapNode, 'hierarchy');
            }

            const liveLink = linkById.get(text(projectionNode?.linkId, ''));
            if (liveLink) {
                context.tagBuckets = context.tagBuckets || new Map();
                if (typeof builders.addTagEdges === 'function') {
                    builders.addTagEdges(context, mapNode, liveLink);
                } else if (Array.isArray(liveLink?.tags)) {
                    liveLink.tags.forEach(function (tag) {
                        const tagKey = text(tag, '').toLowerCase();
                        if (!tagKey) return;
                        if (!context.tagBuckets.has(tagKey)) context.tagBuckets.set(tagKey, []);
                        context.tagBuckets.get(tagKey).push(mapNode);
                    });
                }
            }

            const childProjectionIds = childrenByProjectionId.get(projectionId) || [];
            const childNodes = sortProjectionChildren(childProjectionIds.map(function (childId) {
                return nodeByProjectionId.get(childId);
            }).filter(Boolean));
            childNodes.forEach(function (childNode, childIndex) {
                addProjectionNode(childNode, mapNode, childIndex, childNodes.length, depth + 1);
            });
        }

        const rootNodes = sortProjectionChildren(getPreferredRootNodes().length ? getPreferredRootNodes() : getRootNodes());
        rootNodes.forEach(function (rootNode, rootIndex) {
            addProjectionNode(rootNode, null, rootIndex, rootNodes.length, 0);
        });

        addDetachedParking(scope, centerX, centerY, width, height);

        context.tagBuckets.forEach(function (bucketNodes) {
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

    async function buildGraphData(scopeOption, options = {}) {
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

        const usedProjection = await tryBuildGraphDataFromNexusProjection(scope, scopedLinks, context, centerX, centerY, width, height);
        if (usedProjection) return;

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
    }

    const graph = ns._graph = ns._graph || {};
    Object.assign(graph, { buildGraphData, initializeWorldField, getGraphBounds });
})(window.EveConstellationMap);
