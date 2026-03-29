window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const {
        state,
        getWorkspaceName,
        text,
        placeOnRing,
        createNode,
        getFolderView,
        addNode,
        addEdge,
        createManualAnchor,
        getLinkColor,
        getLinkMeta,
        getResolvedLinkCover,
        getResolvedMapThemeColorValue
    } = shared;

    const MAX_NODE_COVER_CANDIDATES = 96;

    function createBuildContext(scope, scopedLinks) {
        return {
            scope,
            scopedLinks,
            tagBuckets: new Map(),
            folderSubtreeLinksCache: new Map()
        };
    }

    function addTagEdges(context, linkNode, link) {
        if (!Array.isArray(link?.tags)) return;
        link.tags
            .map((tag) => text(tag, ''))
            .filter(Boolean)
            .forEach((tag) => {
                const key = tag.toLowerCase();
                if (!context.tagBuckets.has(key)) context.tagBuckets.set(key, []);
                context.tagBuckets.get(key).push(linkNode);
            });
    }

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

    function getFolderBranchLinks(context, viewModel, folderId) {
        const normalizedId = text(folderId, '');
        if (!normalizedId) return [];
        if (context.folderSubtreeLinksCache.has(normalizedId)) {
            return context.folderSubtreeLinksCache.get(normalizedId);
        }
        const gathered = [];
        (viewModel.folderLinks.get(normalizedId) || []).forEach((link) => gathered.push(link));
        (viewModel.childrenMap.get(normalizedId) || []).forEach((childFolder) => {
            getFolderBranchLinks(context, viewModel, childFolder?.id).forEach((link) => gathered.push(link));
        });
        context.folderSubtreeLinksCache.set(normalizedId, gathered);
        return gathered;
    }

    function addLinkNode(context, workspaceId, categoryName, parentNode, link, index, total, radius, depth) {
        const position = placeOnRing(index, Math.max(total, 1), radius, parentNode.x, parentNode.y, 6);
        const linkNode = addNode(createNode({
            id: 'link_' + String(link.id),
            chainId: 'chain_' + workspaceId + '_' + categoryName,
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
                anchorNodeId: parentNode?.id || '',
                depth: typeof depth === 'number' ? depth : 0
            }
        }));
        addEdge(linkNode, parentNode, 'hierarchy');
        addTagEdges(context, linkNode, link);
    }

    function addFolderBranch(context, workspaceId, categoryName, folderNodeModel, viewModel, parentNode, index, total, radius, depth = 0) {
        const position = placeOnRing(index, Math.max(total, 1), radius, parentNode.x, parentNode.y, 10);
        const folderBranchLinks = getFolderBranchLinks(context, viewModel, folderNodeModel?.id);
        const folderNode = addNode(createNode({
            id: 'folder_' + workspaceId + '_' + categoryName + '_' + String(folderNodeModel.id),
            chainId: 'chain_' + workspaceId + '_' + categoryName,
            label: text(folderNodeModel?.name, 'Folder'),
            color: getResolvedMapThemeColorValue('folderNodeColor'),
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
                anchorNodeId: parentNode?.id || '',
                depth
            }
        }));
        addEdge(folderNode, parentNode, 'hierarchy');

        const directLinks = viewModel.folderLinks.get(String(folderNodeModel.id)) || [];
        directLinks.forEach((link, linkIndex) => {
            addLinkNode(context, workspaceId, categoryName, folderNode, link, linkIndex, directLinks.length, Math.max(40, radius - 20), depth + 1);
        });

        const childFolders = viewModel.childrenMap.get(String(folderNodeModel.id)) || [];
        childFolders.forEach((childFolder, childIndex) => {
            addFolderBranch(context, workspaceId, categoryName, childFolder, viewModel, folderNode, childIndex, childFolders.length, Math.max(54, radius - 6), depth + 1);
        });
    }

    function addCategoryBranch(context, workspaceId, categoryName, categoryCenter, parentNode) {
        const categoryLinks = context.scopedLinks.filter((link) => (
            String(link?.workspace || 'main') === String(workspaceId)
            && text(link?.category, 'Unsorted') === text(categoryName, 'Unsorted')
        ));

        const categoryNode = addNode(createNode({
            id: 'category_' + workspaceId + '_' + categoryName,
            chainId: 'chain_' + workspaceId + '_' + categoryName,
            label: text(categoryName, 'Unsorted'),
            color: getResolvedMapThemeColorValue('categoryNodeColor'),
            radius: 12,
            kind: 'category',
            x: categoryCenter.x,
            y: categoryCenter.y,
            meta: getWorkspaceName(workspaceId) + ' / ' + categoryLinks.length + ' bookmark' + (categoryLinks.length === 1 ? '' : 's'),
            data: {
                workspaceId,
                categoryName,
                coverCandidates: buildCoverCandidates(categoryLinks),
                anchorNodeId: parentNode?.id || '',
                depth: -1
            }
        }));

        if (parentNode) addEdge(categoryNode, parentNode, 'hierarchy');
        if (state.stableMainNodes && !parentNode) {
            categoryNode.manualAnchor = createManualAnchor(categoryNode);
        }

        const viewModel = getFolderView(workspaceId, categoryName, categoryLinks);
        (viewModel.topLevelFolders || []).forEach((folderNodeModel, childIndex) => {
            addFolderBranch(context, workspaceId, categoryName, folderNodeModel, viewModel, categoryNode, childIndex, viewModel.topLevelFolders.length, 78);
        });
        (viewModel.rootLinks || []).forEach((link, linkIndex) => {
            addLinkNode(context, workspaceId, categoryName, categoryNode, link, linkIndex, viewModel.rootLinks.length, 66);
        });
    }

    ns._graphBuilders = Object.assign(ns._graphBuilders || {}, {
        MAX_NODE_COVER_CANDIDATES,
        createBuildContext,
        addTagEdges,
        buildCoverCandidates,
        getFolderBranchLinks,
        addLinkNode,
        addFolderBranch,
        addCategoryBranch
    });
})(window.EveConstellationMap);
