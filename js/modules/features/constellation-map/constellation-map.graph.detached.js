window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const detached = ns._detached || {};
    const builders = ns._graphBuilders || {};
    const {
        text,
        placeOnRing,
        createNode,
        addNode,
        addEdge,
        getLinkColor,
        getLinkMeta,
        getResolvedMapThemeColorValue
    } = shared;
    const { buildCoverCandidates } = builders;

    function addDetachedLinkNode(entry, position) {
        const link = entry?.link || {};
        const parkingCategoryName = text(entry?.parkingCategoryName, 'Detached Nodes');
        return addNode(createNode({
            id: 'detached_link_' + String(entry.id),
            chainId: 'detached_' + String(entry.id),
            label: text(link?.title, 'Detached Bookmark'),
            color: getLinkColor(link),
            radius: 5,
            kind: 'link',
            x: position.x,
            y: position.y,
            meta: parkingCategoryName + ' parking · from ' + text(entry?.originCategoryName, 'Card'),
            data: {
                detached: true,
                detachedEntryId: String(entry.id),
                detachedRoot: true,
                workspaceId: text(entry?.workspaceId, 'main'),
                categoryName: parkingCategoryName,
                originCategoryName: text(entry?.originCategoryName, ''),
                linkId: String(link.id || ''),
                url: text(link?.url, ''),
                anchorNodeId: '',
                depth: 0
            }
        }));
    }

    function addDetachedFolderBranch(entry, rootPosition) {
        const folderData = entry?.folder || {};
        const detachedNodes = Array.isArray(folderData.nodes) ? folderData.nodes : [];
        const detachedLinks = Array.isArray(folderData.links) ? folderData.links : [];
        const rootId = String(folderData.rootId || '');
        const parkingCategoryName = text(entry?.parkingCategoryName, 'Detached Nodes');
        if (!rootId || !detachedNodes.length) return;

        const childrenMap = new Map();
        detachedNodes.forEach((node) => {
            const parentId = text(node?.parentId, '') || null;
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
            childrenMap.get(parentId).push(node);
        });
        const folderLinks = new Map();
        detachedLinks.forEach((link) => {
            const folderId = text(link?.folderId, '');
            if (!folderLinks.has(folderId)) folderLinks.set(folderId, []);
            folderLinks.get(folderId).push(link);
        });
        const nodeMap = new Map(detachedNodes.map((node) => [String(node.id), node]));

        function addDetachedFolderNode(folderNodeModel, parentNode, index, total, radius, depth, positionOverride) {
            const position = positionOverride || placeOnRing(index, Math.max(total, 1), radius, parentNode.x, parentNode.y, 10);
            const descendantLinks = detachedLinks.filter((link) => text(link?.folderId, '') === text(folderNodeModel?.id, ''));
            const folderNode = addNode(createNode({
                id: 'detached_folder_' + String(entry.id) + '_' + String(folderNodeModel.id),
                chainId: 'detached_' + String(entry.id),
                label: text(folderNodeModel?.name, 'Detached Folder'),
                color: getResolvedMapThemeColorValue('folderNodeColor'),
                radius: depth === 0 ? 9 : 7,
                kind: 'folder',
                x: position.x,
                y: position.y,
                meta: parkingCategoryName + ' parking · from ' + text(entry?.originCategoryName, 'Card'),
                data: {
                    detached: true,
                    detachedEntryId: String(entry.id),
                    detachedRoot: depth === 0,
                    workspaceId: text(entry?.workspaceId, 'main'),
                    categoryName: parkingCategoryName,
                    originCategoryName: text(entry?.originCategoryName, ''),
                    folderId: String(folderNodeModel.id),
                    coverCandidates: buildCoverCandidates(descendantLinks),
                    anchorNodeId: parentNode?.id || '',
                    depth
                }
            }));
            if (parentNode) addEdge(folderNode, parentNode, 'hierarchy');

            const directLinks = folderLinks.get(String(folderNodeModel.id)) || [];
            directLinks.forEach((link, linkIndex) => {
                const linkPosition = placeOnRing(linkIndex, Math.max(directLinks.length, 1), Math.max(38, radius - 18), folderNode.x, folderNode.y, 8);
                const linkNode = addNode(createNode({
                    id: 'detached_link_' + String(entry.id) + '_' + String(link.id),
                    chainId: 'detached_' + String(entry.id),
                    label: text(link?.title, 'Detached Bookmark'),
                    color: getLinkColor(link),
                    radius: 4,
                    kind: 'link',
                    x: linkPosition.x,
                    y: linkPosition.y,
                    meta: getLinkMeta(text(entry?.workspaceId, 'main'), text(entry?.originCategoryName, 'Unsorted'), link),
                    data: {
                        detached: true,
                        detachedEntryId: String(entry.id),
                        detachedRoot: false,
                        workspaceId: text(entry?.workspaceId, 'main'),
                        categoryName: parkingCategoryName,
                        originCategoryName: text(entry?.originCategoryName, 'Unsorted'),
                        linkId: String(link.id || ''),
                        url: text(link?.url, ''),
                        anchorNodeId: folderNode.id,
                        depth: depth + 1
                    }
                }));
                addEdge(linkNode, folderNode, 'hierarchy');
            });

            const childFolders = childrenMap.get(String(folderNodeModel.id)) || [];
            childFolders.forEach((childFolder, childIndex) => {
                addDetachedFolderNode(childFolder, folderNode, childIndex, childFolders.length, Math.max(52, radius - 6), depth + 1);
            });
        }

        const rootNode = nodeMap.get(rootId);
        if (rootNode) {
            addDetachedFolderNode(rootNode, null, 0, 1, 92, 0, rootPosition);
        }
    }

    function addDetachedParking(scopeModel, centerX, centerY, width, height) {
        const entries = typeof detached.getDetachedEntriesForScope === 'function'
            ? detached.getDetachedEntriesForScope(scopeModel)
            : [];
        if (!entries.length) return;

        const parkingCenterX = centerX + (Math.min(width, height) * (scopeModel.scope === 'all' ? 0.34 : 0.28));
        const parkingCenterY = centerY - (Math.min(width, height) * 0.16);

        entries.forEach((entry, index) => {
            const ringRadius = 126 + (Math.floor(index / 6) * 72);
            const position = placeOnRing(index, Math.max(entries.length, 1), ringRadius, parkingCenterX, parkingCenterY, 8);
            if (entry?.kind === 'folder') {
                addDetachedFolderBranch(entry, position);
                return;
            }
            addDetachedLinkNode(entry, position);
        });
    }

    ns._graphDetached = Object.assign(ns._graphDetached || {}, {
        addDetachedLinkNode,
        addDetachedFolderBranch,
        addDetachedParking
    });
})(window.EveConstellationMap);
