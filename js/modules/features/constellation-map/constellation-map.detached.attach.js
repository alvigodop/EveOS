window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const detached = ns._detached = ns._detached || {};
    const text = detached.text || (ns._shared || {}).text;

    function extractDetachedLinks(entry, linkIds) {
        const linkIdSet = new Set((Array.isArray(linkIds) ? linkIds : []).map((id) => text(id, '')).filter(Boolean));
        if (!entry || !linkIdSet.size) return [];

        if (entry.kind === 'link') {
            const detachedLink = detached.cloneValue(entry.link || {});
            const detachedLinkId = text(detachedLink?.id, '');
            if (!detachedLinkId || !linkIdSet.has(detachedLinkId)) return [];
            detached.removeDetachedEntry(text(entry.id, ''));
            return [detachedLink];
        }

        if (entry.kind !== 'folder') return [];

        const nextLinks = [];
        const movedLinks = [];
        (Array.isArray(entry.folder?.links) ? entry.folder.links : []).forEach((link) => {
            const linkId = text(link?.id, '');
            if (linkIdSet.has(linkId)) {
                movedLinks.push(detached.cloneValue(link));
                return;
            }
            nextLinks.push(link);
        });

        if (!movedLinks.length) return [];

        entry.folder = entry.folder || { rootId: '', nodes: [], links: [] };
        entry.folder.links = nextLinks;
        return movedLinks;
    }

    function attachLiveLinksToEntry(entryId, linkIds, targetFolderId) {
        const entry = detached.getDetachedEntry(entryId);
        if (!entry || entry.kind !== 'folder') return null;

        const normalizedTargetFolderId = text(targetFolderId, '');
        const liveLinks = detached.getAllLinksRef();
        const linkIdSet = new Set((Array.isArray(linkIds) ? linkIds : []).map((id) => text(id, '')).filter(Boolean));
        if (!linkIdSet.size) return null;

        if (normalizedTargetFolderId) {
            const targetExists = (Array.isArray(entry.folder?.nodes) ? entry.folder.nodes : [])
                .some((node) => text(node?.id, '') === normalizedTargetFolderId);
            if (!targetExists) return null;
        }

        const movedLinks = [];
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const link = liveLinks[index];
            if (!linkIdSet.has(text(link?.id, ''))) continue;
            const clonedLink = detached.cloneValue(link);
            clonedLink.folderId = normalizedTargetFolderId;
            movedLinks.unshift(clonedLink);
            liveLinks.splice(index, 1);
        }

        if (!movedLinks.length) return null;

        entry.folder = entry.folder || { rootId: '', nodes: [], links: [] };
        entry.folder.links = [...(Array.isArray(entry.folder.links) ? entry.folder.links : []), ...movedLinks];
        detached.persistDetachedStore();

        return {
            selectionId: 'detached_link_' + text(entry.id, '') + '_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Moved ' + movedLinks.length + ' bookmarks into a detached chain.')
                : 'Bookmark moved into a detached chain.'
        };
    }

    function moveDetachedLinksToEntry(sourceEntryId, linkIds, targetEntryId, targetFolderId) {
        const sourceEntry = detached.getDetachedEntry(sourceEntryId);
        const targetEntry = detached.getDetachedEntry(targetEntryId);
        if (!sourceEntry || !targetEntry || targetEntry.kind !== 'folder') return null;

        const normalizedTargetFolderId = text(targetFolderId, '');
        if (normalizedTargetFolderId) {
            const targetExists = (Array.isArray(targetEntry.folder?.nodes) ? targetEntry.folder.nodes : [])
                .some((node) => text(node?.id, '') === normalizedTargetFolderId);
            if (!targetExists) return null;
        }

        const movedLinks = extractDetachedLinks(sourceEntry, linkIds);
        if (!movedLinks.length) return null;

        targetEntry.folder = targetEntry.folder || { rootId: '', nodes: [], links: [] };
        const targetLinks = Array.isArray(targetEntry.folder.links) ? targetEntry.folder.links : [];
        movedLinks.forEach((link) => {
            link.folderId = normalizedTargetFolderId;
            targetLinks.push(link);
        });
        targetEntry.folder.links = targetLinks;

        detached.persistDetachedStore();
        return {
            selectionId: 'detached_link_' + text(targetEntry.id, '') + '_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Moved ' + movedLinks.length + ' detached bookmarks.')
                : 'Detached bookmark moved.'
        };
    }

    function moveDetachedLinksToParking(sourceEntryId, linkIds) {
        const sourceEntry = detached.getDetachedEntry(sourceEntryId);
        if (!sourceEntry) return null;

        const movedLinks = extractDetachedLinks(sourceEntry, linkIds);
        if (!movedLinks.length) return null;

        const workspaceId = text(sourceEntry.workspaceId, 'main');
        const bucket = detached.ensureWorkspaceBucket(workspaceId);
        let firstEntryId = '';
        movedLinks.forEach((link) => {
            const entryId = detached.buildDetachedId('link');
            if (!firstEntryId) firstEntryId = entryId;
            bucket.push({
                id: entryId,
                kind: 'link',
                workspaceId,
                originCategoryName: text(link?.category, sourceEntry.originCategoryName || 'Unsorted'),
                parkingCategoryName: detached.PARKING_CATEGORY_NAME,
                parkedAt: Date.now(),
                label: text(link?.title, 'Bookmark'),
                link
            });
        });

        detached.persistDetachedStore();
        return {
            selectionId: 'detached_link_' + firstEntryId + '_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Moved ' + movedLinks.length + ' bookmarks to detached root.')
                : 'Bookmark moved to detached root.'
        };
    }

    function attachLiveFolderToEntry(entryId, workspaceId, categoryName, folderId, targetFolderId) {
        const entry = detached.getDetachedEntry(entryId);
        if (!entry || entry.kind !== 'folder') return null;

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
        const resolvedTargetFolderId = normalizeFolderId(targetFolderId);
        if (!resolvedFolderId) return null;

        if (resolvedTargetFolderId) {
            const targetExists = (Array.isArray(entry.folder?.nodes) ? entry.folder.nodes : [])
                .some((node) => normalizeFolderId(node?.id) === resolvedTargetFolderId);
            if (!targetExists) return null;
        }

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

        const movedFolderData = {
            rootId: resolvedFolderId,
            nodes: sourceTree.nodes.filter((node) => subtreeIds.has(normalizeFolderId(node?.id))).map((node) => detached.cloneValue(node)),
            links: []
        };
        if (!movedFolderData.nodes.length) return null;

        const liveLinks = detached.getAllLinksRef();
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const link = liveLinks[index];
            if (!subtreeIds.has(normalizeFolderId(link?.folderId))) continue;
            movedFolderData.links.unshift(detached.cloneValue(link));
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

        entry.folder = entry.folder || { rootId: '', nodes: [], links: [] };
        const existingIds = new Set((Array.isArray(entry.folder.nodes) ? entry.folder.nodes : []).map((node) => normalizeFolderId(node?.id)));
        const remapped = detached.remapDetachedFolderPayload(folderHelpers, movedFolderData, existingIds, resolvedTargetFolderId || null);
        entry.folder.nodes = [...(Array.isArray(entry.folder.nodes) ? entry.folder.nodes : []), ...remapped.nodes];
        entry.folder.links = [...(Array.isArray(entry.folder.links) ? entry.folder.links : []), ...remapped.links];
        detached.persistDetachedStore();

        return {
            selectionId: 'detached_folder_' + text(entry.id, '') + '_' + text(remapped.rootId, ''),
            message: resolvedTargetFolderId
                ? 'Folder branch moved into a detached folder chain.'
                : 'Folder branch moved into a detached chain.'
        };
    }

    function restoreDetachedLink(entry, targetSpec) {
        const liveLinks = detached.getAllLinksRef();
        const link = detached.cloneValue(entry?.link || {});
        if (!link || typeof link !== 'object') return null;

        link.workspace = text(targetSpec?.workspaceId, 'main');
        link.category = text(targetSpec?.categoryName, 'Unsorted');
        if (text(targetSpec?.folderId, '')) link.folderId = text(targetSpec.folderId, '');
        else delete link.folderId;

        liveLinks.push(link);
        detached.syncLinkToLibrary(link.id);
        return {
            selectionId: 'link_' + text(link.id, ''),
            message: text(targetSpec?.folderId, '')
                ? 'Detached bookmark attached to a folder chain.'
                : 'Detached bookmark attached to a card.'
        };
    }

    function restoreDetachedFolder(entry, targetSpec) {
        const folderHelpers = detached.getFolderHelpers();
        const {
            normalizeWorkspaceId,
            normalizeCategoryName,
            normalizeFolderId,
            normalizeParentId,
            normalizeTreeSettings,
            buildScopedKey,
            cloneStore,
            writeStore
        } = folderHelpers;

        const folderData = entry?.folder;
        if (!folderData?.rootId || !Array.isArray(folderData.nodes)) return null;

        const targetWorkspaceId = normalizeWorkspaceId(targetSpec?.workspaceId);
        const targetCategoryName = normalizeCategoryName(targetSpec?.categoryName);
        const targetParentId = normalizeParentId(targetSpec?.targetParentId || targetSpec?.folderId);

        const nextStore = cloneStore();
        const scopedKey = buildScopedKey(targetWorkspaceId, targetCategoryName);
        const targetTree = nextStore[scopedKey] || { nodes: [], settings: normalizeTreeSettings({}) };
        const existingIds = new Set((targetTree.nodes || []).map((node) => normalizeFolderId(node?.id)));
        const remapped = detached.remapDetachedFolderPayload(folderHelpers, folderData, existingIds, targetParentId);

        targetTree.nodes = [...(targetTree.nodes || []), ...remapped.nodes];
        nextStore[scopedKey] = {
            nodes: targetTree.nodes,
            settings: normalizeTreeSettings(targetTree.settings)
        };
        writeStore(nextStore, false);

        const liveLinks = detached.getAllLinksRef();
        remapped.links.forEach((link) => {
            const clonedLink = detached.cloneValue(link);
            clonedLink.workspace = targetWorkspaceId;
            clonedLink.category = targetCategoryName;
            liveLinks.push(clonedLink);
            detached.syncLinkToLibrary(clonedLink.id);
        });

        return {
            selectionId: 'folder_' + targetWorkspaceId + '_' + targetCategoryName + '_' + remapped.rootId,
            message: targetParentId
                ? 'Detached folder chain attached to a folder.'
                : 'Detached folder chain attached to a card.'
        };
    }

    function restoreDetachedEntry(entryId, targetSpec) {
        const entry = detached.getDetachedEntry(entryId);
        if (!entry || !targetSpec) return null;

        const result = entry.kind === 'folder'
            ? restoreDetachedFolder(entry, targetSpec)
            : restoreDetachedLink(entry, targetSpec);
        if (!result) return null;

        detached.removeDetachedEntry(entryId);
        detached.persistDetachedStore();
        return result;
    }

    function restoreDetachedLinks(entryId, linkIds, targetSpec) {
        const entry = detached.getDetachedEntry(entryId);
        if (!entry || !targetSpec) return null;

        const targetWorkspaceId = text(targetSpec?.workspaceId, 'main');
        const targetCategoryName = text(targetSpec?.categoryName, 'Unsorted');
        const targetFolderId = text(targetSpec?.folderId || targetSpec?.targetParentId, '');
        const movedLinks = extractDetachedLinks(entry, linkIds);
        if (!movedLinks.length) return null;

        const liveLinks = detached.getAllLinksRef();
        movedLinks.forEach((link) => {
            link.workspace = targetWorkspaceId;
            link.category = targetCategoryName;
            if (targetFolderId) link.folderId = targetFolderId;
            else delete link.folderId;
            liveLinks.push(link);
            detached.syncLinkToLibrary(link.id);
        });

        detached.persistDetachedStore();
        return {
            selectionId: 'link_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Restored ' + movedLinks.length + ' detached bookmarks.')
                : (targetFolderId ? 'Detached bookmark attached to a folder.' : 'Detached bookmark attached to a card.')
        };
    }

    Object.assign(detached, {
        attachLiveLinksToEntry,
        moveDetachedLinksToEntry,
        moveDetachedLinksToParking,
        attachLiveFolderToEntry,
        restoreDetachedEntry,
        restoreDetachedLinks
    });
})(window.EveConstellationMap);
