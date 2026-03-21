window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const detached = ns._detached = ns._detached || {};
    const text = detached.text || (ns._shared || {}).text;

    function parkLink(link) {
        const liveLinks = detached.getAllLinksRef();
        const linkId = text(link?.id, '');
        const linkIndex = liveLinks.findIndex((entry) => text(entry?.id, '') === linkId);
        if (linkIndex === -1) return null;

        const clonedLink = detached.cloneValue(liveLinks[linkIndex]);
        const workspaceId = text(clonedLink.workspace, 'main');
        const categoryName = text(clonedLink.category, 'Unsorted');
        const bucket = detached.ensureWorkspaceBucket(workspaceId);
        const entry = {
            id: detached.buildDetachedId('link'),
            kind: 'link',
            workspaceId,
            originCategoryName: categoryName,
            parkingCategoryName: detached.PARKING_CATEGORY_NAME,
            parkedAt: Date.now(),
            label: text(clonedLink.title, 'Bookmark'),
            link: clonedLink
        };

        liveLinks.splice(linkIndex, 1);
        bucket.push(entry);
        detached.persistDetachedStore();
        return entry;
    }

    function parkFolderSubtree(workspaceId, categoryName, folderId) {
        const folderHelpers = detached.getFolderHelpers();
        const {
            normalizeWorkspaceId,
            normalizeCategoryName,
            normalizeFolderId,
            normalizeTreeSettings,
            buildScopedKey,
            buildChildrenMap,
            cloneStore,
            writeStore
        } = folderHelpers;

        const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const resolvedCategoryName = normalizeCategoryName(categoryName);
        const resolvedFolderId = normalizeFolderId(folderId);
        if (!resolvedFolderId) return null;

        const nextStore = cloneStore();
        const scopedKey = buildScopedKey(resolvedWorkspaceId, resolvedCategoryName);
        const sourceTree = nextStore[scopedKey];
        if (!sourceTree || !Array.isArray(sourceTree.nodes)) return null;

        const rootNode = sourceTree.nodes.find((node) => normalizeFolderId(node?.id) === resolvedFolderId);
        if (!rootNode) return null;

        const childrenMap = buildChildrenMap(sourceTree.nodes);
        const subtreeIds = new Set();
        function collectSubtree(nodeId) {
            subtreeIds.add(nodeId);
            (childrenMap.get(nodeId) || []).forEach((childNode) => collectSubtree(normalizeFolderId(childNode?.id)));
        }
        collectSubtree(resolvedFolderId);

        const movedNodes = sourceTree.nodes
            .filter((node) => subtreeIds.has(normalizeFolderId(node?.id)))
            .map((node) => {
                const clonedNode = detached.cloneValue(node);
                if (normalizeFolderId(clonedNode?.id) === resolvedFolderId) {
                    clonedNode.parentId = null;
                }
                return clonedNode;
            });
        if (!movedNodes.length) return null;

        const liveLinks = detached.getAllLinksRef();
        const movedLinks = [];
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const link = liveLinks[index];
            if (!subtreeIds.has(normalizeFolderId(link?.folderId))) continue;
            movedLinks.unshift(detached.cloneValue(link));
            liveLinks.splice(index, 1);
        }

        sourceTree.nodes = sourceTree.nodes.filter((node) => !subtreeIds.has(normalizeFolderId(node?.id)));
        if (!sourceTree.nodes.length && normalizeTreeSettings(sourceTree.settings).clickBehaviorMode === 'inherit') {
            delete nextStore[scopedKey];
        } else {
            nextStore[scopedKey] = {
                nodes: sourceTree.nodes,
                settings: normalizeTreeSettings(sourceTree.settings)
            };
        }

        writeStore(nextStore, false);

        const bucket = detached.ensureWorkspaceBucket(resolvedWorkspaceId);
        const entry = {
            id: detached.buildDetachedId('folder'),
            kind: 'folder',
            workspaceId: resolvedWorkspaceId,
            originCategoryName: resolvedCategoryName,
            parkingCategoryName: detached.PARKING_CATEGORY_NAME,
            parkedAt: Date.now(),
            label: text(rootNode?.name, 'Detached Folder'),
            folder: {
                rootId: resolvedFolderId,
                nodes: movedNodes,
                links: movedLinks
            }
        };

        bucket.push(entry);
        detached.persistDetachedStore();
        return entry;
    }

    function parkLinksByIds(linkIds) {
        const liveLinks = detached.getAllLinksRef();
        const linkIdSet = new Set((Array.isArray(linkIds) ? linkIds : []).map((id) => text(id, '')).filter(Boolean));
        if (!linkIdSet.size || !Array.isArray(liveLinks)) return [];

        const movedLinks = [];
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const liveLink = liveLinks[index];
            if (!linkIdSet.has(text(liveLink?.id, ''))) continue;
            movedLinks.unshift(detached.cloneValue(liveLink));
            liveLinks.splice(index, 1);
        }

        if (!movedLinks.length) return [];

        movedLinks.forEach((clonedLink) => {
            const workspaceId = text(clonedLink?.workspace, 'main');
            const categoryName = text(clonedLink?.category, 'Unsorted');
            const bucket = detached.ensureWorkspaceBucket(workspaceId);
            bucket.push({
                id: detached.buildDetachedId('link'),
                kind: 'link',
                workspaceId,
                originCategoryName: categoryName,
                parkingCategoryName: detached.PARKING_CATEGORY_NAME,
                parkedAt: Date.now(),
                label: text(clonedLink?.title, 'Bookmark'),
                link: clonedLink
            });
        });

        detached.persistDetachedStore();
        return movedLinks;
    }

    Object.assign(detached, {
        parkLink,
        parkFolderSubtree,
        parkLinksByIds
    });
})(window.EveConstellationMap);
