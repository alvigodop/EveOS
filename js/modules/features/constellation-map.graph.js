window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const {

        state,

        getViewportSize,

        clearInspectorCoverRotation,

        resetStaticLocks,

        normalizeScope,

        getScopedLinks,

        getConfig,

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

        getLinkColor,

        getLinkMeta,

        getResolvedLinkCover

    } = shared;

    const MAX_NODE_COVER_CANDIDATES = 96;



    function buildGraphData(scopeOption) {

        const scope = normalizeScope(scopeOption);

        const scopedLinks = getScopedLinks(scope);

        const { width, height } = getViewportSize();

        const centerX = width / 2;

        const centerY = height / 2;

        const tagBuckets = new Map();



        state.scope = scope;

        state.nodes = [];

        state.nodeIndex = new Map();

        state.motionAnchors = new Map();

        state.edges = [];

        state.edgeKeys = new Set();

        state.hovered = null;

        state.selected = null;

        state.searchState = { query: '', index: -1, matches: [] };

        state.infoCollapsed = true;

        state.infoHovered = false;

        state.infoHoverStartedAt = 0;

        clearInspectorCoverRotation();

        state.coverPreviewSession = null;

        state.pointer.forcePan = false;

        resetStaticLocks();



        function addTagEdges(linkNode, link) {

            if (!Array.isArray(link?.tags)) return;

            link.tags

                .map((tag) => text(tag, ''))

                .filter(Boolean)

                .forEach((tag) => {

                    const key = tag.toLowerCase();

                    if (!tagBuckets.has(key)) tagBuckets.set(key, []);

                    tagBuckets.get(key).push(linkNode);

                });

        }

        const folderSubtreeLinksCache = new Map();

        function buildCoverCandidates(links) {

            const covers = [];

            const seen = new Set();

            (Array.isArray(links) ? links : []).forEach((link) => {

                if (covers.length >= MAX_NODE_COVER_CANDIDATES) return;

                const cover = text(getResolvedLinkCover(link), '');

                if (!cover || seen.has(cover)) return;

                seen.add(cover);

                covers.push(cover);

            });

            return covers;

        }

        function getFolderBranchLinks(viewModel, folderId) {

            const normalizedId = text(folderId, '');

            if (!normalizedId) return [];

            if (folderSubtreeLinksCache.has(normalizedId)) {

                return folderSubtreeLinksCache.get(normalizedId);

            }

            const gathered = [];

            (viewModel.folderLinks.get(normalizedId) || []).forEach((link) => gathered.push(link));

            (viewModel.childrenMap.get(normalizedId) || []).forEach((childFolder) => {

                getFolderBranchLinks(viewModel, childFolder?.id).forEach((link) => gathered.push(link));

            });

            folderSubtreeLinksCache.set(normalizedId, gathered);

            return gathered;

        }



        function addLinkNode(workspaceId, categoryName, parentNode, link, index, total, radius) {

            const position = placeOnRing(index, Math.max(total, 1), radius, parentNode.x, parentNode.y, 6);

            const linkNode = addNode(createNode({

                id: 'link_' + String(link.id),

                label: text(link?.title, 'Bookmark'),

                color: getLinkColor(link),

                radius: 4,

                kind: 'link',

                x: position.x,

                y: position.y,

                meta: getLinkMeta(workspaceId, categoryName, link),

                data: {

                    linkId: String(link.id),

                    workspaceId,

                    categoryName,

                    url: text(link?.url, ''),

                    anchorNodeId: parentNode?.id || ''

                }

            }));

            addEdge(linkNode, parentNode, 'hierarchy');

            addTagEdges(linkNode, link);

        }



        function addFolderBranch(workspaceId, categoryName, folderNodeModel, viewModel, parentNode, index, total, radius) {

            const position = placeOnRing(index, Math.max(total, 1), radius, parentNode.x, parentNode.y, 10);

            const folderBranchLinks = getFolderBranchLinks(viewModel, folderNodeModel?.id);

            const folderNode = addNode(createNode({

                id: 'folder_' + workspaceId + '_' + categoryName + '_' + String(folderNodeModel.id),

                label: text(folderNodeModel?.name, 'Folder'),

                color: '#b45eff',

                radius: 8,

                kind: 'folder',

                x: position.x,

                y: position.y,

                meta: getWorkspaceName(workspaceId) + ' / ' + text(categoryName, 'Unsorted') + ' / ' + text(folderNodeModel?.name, 'Folder'),

                data: {

                    workspaceId,

                    categoryName,

                    folderId: String(folderNodeModel.id),

                    coverCandidates: buildCoverCandidates(folderBranchLinks),

                    anchorNodeId: parentNode?.id || ''

                }

            }));

            addEdge(folderNode, parentNode, 'hierarchy');



            const directLinks = viewModel.folderLinks.get(String(folderNodeModel.id)) || [];

            directLinks.forEach((link, linkIndex) => {

                addLinkNode(workspaceId, categoryName, folderNode, link, linkIndex, directLinks.length, Math.max(40, radius - 20));

            });



            const childFolders = viewModel.childrenMap.get(String(folderNodeModel.id)) || [];

            childFolders.forEach((childFolder, childIndex) => {

                addFolderBranch(workspaceId, categoryName, childFolder, viewModel, folderNode, childIndex, childFolders.length, Math.max(54, radius - 6));

            });

        }



        function addCategoryBranch(workspaceId, categoryName, categoryCenter, parentNode) {

            const categoryLinks = scopedLinks.filter((link) => (

                String(link?.workspace || 'main') === String(workspaceId)

                && text(link?.category, 'Unsorted') === text(categoryName, 'Unsorted')

            ));

            const categoryNode = addNode(createNode({

                id: 'category_' + workspaceId + '_' + categoryName,

                label: text(categoryName, 'Unsorted'),

                color: '#ff4df1',

                radius: 12,

                kind: 'category',

                x: categoryCenter.x,

                y: categoryCenter.y,

                meta: getWorkspaceName(workspaceId) + ' / ' + categoryLinks.length + ' bookmark' + (categoryLinks.length === 1 ? '' : 's'),

                data: {

                    workspaceId,

                    categoryName,

                    coverCandidates: buildCoverCandidates(categoryLinks),

                    anchorNodeId: parentNode?.id || ''

                }

            }));

            if (parentNode) addEdge(categoryNode, parentNode, 'hierarchy');

            if (state.stableMainNodes && !parentNode) {

                categoryNode.manualAnchor = createManualAnchor(categoryNode);

            }



            const viewModel = getFolderView(workspaceId, categoryName, categoryLinks);

            (viewModel.topLevelFolders || []).forEach((folderNodeModel, index) => {

                addFolderBranch(workspaceId, categoryName, folderNodeModel, viewModel, categoryNode, index, viewModel.topLevelFolders.length, 78);

            });

            (viewModel.rootLinks || []).forEach((link, index) => {

                addLinkNode(workspaceId, categoryName, categoryNode, link, index, viewModel.rootLinks.length, 66);

            });

        }



        if (scope.scope === 'all') {

            const workspaceIds = getAllWorkspaceIds(scopedLinks);

            workspaceIds.forEach((workspaceId, workspaceIndex) => {

                const workspaceLinks = scopedLinks.filter((link) => String(link?.workspace || 'main') === String(workspaceId));

                const workspacePosition = placeOnRing(workspaceIndex, workspaceIds.length, Math.min(width, height) * 0.22, centerX, centerY, 18);

                const workspaceNode = addNode(createNode({

                    id: 'workspace_' + workspaceId,

                    label: getWorkspaceName(workspaceId),

                    color: '#ffd166',

                    radius: 15,

                    kind: 'workspace',

                    x: workspacePosition.x,

                    y: workspacePosition.y,

                    meta: workspaceLinks.length + ' bookmark' + (workspaceLinks.length === 1 ? '' : 's'),

                    data: {

                        workspaceId,

                        coverCandidates: buildCoverCandidates(workspaceLinks)

                    }

                }));

                const categories = getCategoryNames(workspaceId, workspaceLinks);

                categories.forEach((categoryName, categoryIndex) => {

                    const categoryCenter = placeOnRing(categoryIndex, categories.length, 128 + ((categoryIndex % 4) * 12), workspaceNode.x, workspaceNode.y, 10);

                    addCategoryBranch(workspaceId, categoryName, categoryCenter, workspaceNode);

                });

            });

        } else if (scope.scope === 'card') {

            addCategoryBranch(

                scope.workspaceId,

                text(scope.categoryName, 'Unsorted'),

                { x: centerX, y: centerY },

                null

            );

        } else if (scope.scope === 'folder') {

            const folderView = getFolderView(scope.workspaceId, text(scope.categoryName, 'Unsorted'), scopedLinks);

            const subtree = collectFolderSubtree(folderView, scope.folderId);

            if (subtree) {

                const folderBranchLinks = getFolderBranchLinks(folderView, subtree.targetNode?.id);

                const folderNode = addNode(createNode({

                    id: 'folder_' + scope.workspaceId + '_' + text(scope.categoryName, 'Unsorted') + '_' + String(subtree.targetNode.id),

                    label: text(subtree.targetNode?.name, 'Folder'),

                    color: '#b45eff',

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

                    addLinkNode(scope.workspaceId, text(scope.categoryName, 'Unsorted'), folderNode, link, index, subtree.directLinks.length, 68);

                });

                subtree.childFolders.forEach((childFolder, index) => {

                    addFolderBranch(scope.workspaceId, text(scope.categoryName, 'Unsorted'), childFolder, folderView, folderNode, index, subtree.childFolders.length, 92);

                });

            }

        } else if (scope.scope === 'derived') {

            const derivedCategoryName = text(scope.categoryName, '');

            if (derivedCategoryName) {

                addCategoryBranch(

                    scope.workspaceId,

                    derivedCategoryName,

                    { x: centerX, y: centerY },

                    null

                );

            } else {

                const categories = getCategoryNames(scope.workspaceId, scopedLinks);

                categories.forEach((categoryName, categoryIndex) => {

                    const categoryCenter = placeOnRing(categoryIndex, categories.length, Math.min(width, height) * 0.24, centerX, centerY, 16);

                    addCategoryBranch(scope.workspaceId, categoryName, categoryCenter, null);

                });

            }

        } else {

            const categories = getCategoryNames(scope.workspaceId, scopedLinks);

            categories.forEach((categoryName, categoryIndex) => {

                const categoryCenter = placeOnRing(categoryIndex, categories.length, Math.min(width, height) * 0.24, centerX, centerY, 16);

                addCategoryBranch(scope.workspaceId, categoryName, categoryCenter, null);

            });

        }



        tagBuckets.forEach((bucketNodes) => {

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



    function initializeWorldField(centerX, centerY) {

        const bounds = getGraphBounds();

        const viewport = state.canvas

            ? { width: state.canvas.width, height: state.canvas.height }

            : getViewportSize();

        const anchorX = Number.isFinite(centerX) ? centerX : ((bounds.minX + bounds.maxX) / 2);

        const anchorY = Number.isFinite(centerY) ? centerY : ((bounds.minY + bounds.maxY) / 2);

        const spreadBoost = Math.max(320, Math.sqrt(Math.max(state.nodes.length, 1)) * 44);

        const radius = Math.max(

            viewport.width * 2.9,

            viewport.height * 2.9,

            (Math.max(bounds.width, bounds.height) * 1.75) + spreadBoost

        );



        state.worldAnchor = { x: anchorX, y: anchorY };

        state.worldRadius = radius;

        state.worldBounds = {

            minX: anchorX - radius,

            maxX: anchorX + radius,

            minY: anchorY - radius,

            maxY: anchorY + radius

        };

    }



    function getGraphBounds() {

        if (!state.nodes.length) {

            const { width, height } = getViewportSize();

            return {

                minX: width / 2 - 40,

                minY: height / 2 - 40,

                maxX: width / 2 + 40,

                maxY: height / 2 + 40,

                width: 80,

                height: 80

            };

        }



        let minX = Infinity;

        let minY = Infinity;

        let maxX = -Infinity;

        let maxY = -Infinity;

        state.nodes.forEach((node) => {

            minX = Math.min(minX, node.x - node.radius);

            minY = Math.min(minY, node.y - node.radius);

            maxX = Math.max(maxX, node.x + node.radius);

            maxY = Math.max(maxY, node.y + node.radius);

        });



        return {

            minX,

            minY,

            maxX,

            maxY,

            width: Math.max(1, maxX - minX),

            height: Math.max(1, maxY - minY)

        };

    }



    const graph = ns._graph = ns._graph || {};

    Object.assign(graph, { buildGraphData, initializeWorldField, getGraphBounds });

})(window.EveConstellationMap);


