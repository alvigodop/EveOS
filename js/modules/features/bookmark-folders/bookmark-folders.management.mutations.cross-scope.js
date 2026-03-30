window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    if (api.mutationsCrossScopeReady) return;

    const shared = ns._shared || {};
    const {
        buildScopedKey,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeParentId,
        dedupeNodes,
        normalizeTreeSettings,
        cloneStore,
        writeStore,
        buildChildrenMap
    } = shared;
    const { moveFolder } = api;

    if (!buildScopedKey || !normalizeWorkspaceId || !normalizeCategoryName || !normalizeFolderId || !normalizeParentId || !cloneStore || !writeStore || !buildChildrenMap) {
        console.warn('[EveBookmarkFolders] Cross-scope mutation helpers missing; cross-scope mutations not initialized.');
        return;
    }

    function transferFolderToCategory(folderId, sourceWs, sourceCat, targetWs, targetCat, targetParentId, options = {}) {
        try {
            const sWs = normalizeWorkspaceId(sourceWs);
            const sCat = normalizeCategoryName(sourceCat);
            const tWs = normalizeWorkspaceId(targetWs);
            const tCat = normalizeCategoryName(targetCat);
            const fId = normalizeFolderId(folderId);
            const tpId = normalizeParentId(targetParentId);

            if (!fId) {
                console.warn('[EveBookmarkFolders] Transfer Aborted: Missing Folder ID');
                return false;
            }

            if (sWs === tWs && sCat === tCat) {
                return moveFolder(sWs, sCat, fId, tpId, options);
            }

            const nextStore = cloneStore();
            const sourceKey = buildScopedKey(sWs, sCat);
            const targetKey = buildScopedKey(tWs, tCat);
            const sourceTree = nextStore[sourceKey];
            if (!sourceTree || !sourceTree.nodes || sourceTree.nodes.length === 0) {
                console.warn('[EveBookmarkFolders] Transfer Aborted: Source tree empty or missing', sourceKey);
                return false;
            }

            const targetTree = nextStore[targetKey] || { nodes: [], settings: normalizeTreeSettings({}) };
            const childrenMap = buildChildrenMap(sourceTree.nodes);
            const toMoveIds = new Set();

            function collect(id) {
                toMoveIds.add(id);
                (childrenMap.get(id) || []).forEach((child) => collect(child.id));
            }

            const rootNodeId = fId;
            if (!sourceTree.nodes.some((node) => normalizeFolderId(node.id) === rootNodeId)) {
                return false;
            }

            collect(rootNodeId);

            const movedNodes = sourceTree.nodes.filter((node) => toMoveIds.has(node.id)).map((node) => {
                const nextNode = { ...node };
                if (normalizeFolderId(node.id) === rootNodeId) {
                    nextNode.parentId = tpId;
                    nextNode.updatedAt = Date.now();
                }
                return nextNode;
            });
            if (movedNodes.length === 0) return false;

            targetTree.nodes = [...targetTree.nodes, ...movedNodes];
            nextStore[targetKey] = targetTree;

            sourceTree.nodes = sourceTree.nodes.filter((node) => !toMoveIds.has(node.id));
            if (sourceTree.nodes.length === 0 && sourceTree.settings.clickBehaviorMode === 'inherit') {
                delete nextStore[sourceKey];
            } else {
                nextStore[sourceKey] = sourceTree;
            }

            if (Array.isArray(window.eveState?.links)) {
                window.eveState.links.forEach((link) => {
                    if (toMoveIds.has(normalizeFolderId(link.folderId))) {
                        link.workspace = tWs;
                        link.category = tCat;
                        if (typeof window.EveLibrary?.ConnectionsAPI?.syncFromLink === 'function') {
                            window.EveLibrary.ConnectionsAPI.syncFromLink(link.id);
                        }
                    }
                });
            }

            writeStore(nextStore, true);
            return true;
        } catch (error) {
            return false;
        }
    }

    function renameCategoryEverywhere(oldCategoryName, nextCategoryName) {
        const previous = normalizeCategoryName(oldCategoryName);
        const next = normalizeCategoryName(nextCategoryName);
        if (!previous || !next || previous === next) return;

        const nextStore = cloneStore();
        Object.keys(nextStore).forEach((key) => {
            const parts = String(key).split('::');
            const workspaceId = parts.shift() || 'main';
            const categoryName = parts.join('::') || 'Unsorted';
            if (normalizeCategoryName(categoryName) !== previous) return;
            const nextKey = buildScopedKey(workspaceId, next);
            if (!nextStore[nextKey]) {
                nextStore[nextKey] = nextStore[key];
            } else {
                const mergedSettings = normalizeTreeSettings({
                    clickBehaviorMode: nextStore[key]?.settings?.clickBehaviorMode !== 'inherit'
                        ? nextStore[key]?.settings?.clickBehaviorMode
                        : nextStore[nextKey]?.settings?.clickBehaviorMode
                });
                nextStore[nextKey] = {
                    nodes: dedupeNodes([...(nextStore[nextKey]?.nodes || []), ...(nextStore[key]?.nodes || [])]),
                    settings: mergedSettings
                };
            }
            if (nextKey !== key) delete nextStore[key];
        });
        writeStore(nextStore, false);
    }

    function deleteCategoryEverywhere(categoryName) {
        const targetCategory = normalizeCategoryName(categoryName);
        const nextStore = cloneStore();
        Object.keys(nextStore).forEach((key) => {
            const parts = String(key).split('::');
            parts.shift();
            const scopedCategory = normalizeCategoryName(parts.join('::'));
            if (scopedCategory === targetCategory) {
                delete nextStore[key];
            }
        });
        writeStore(nextStore, false);
    }

    function moveWorkspaceTrees(sourceWorkspaceId, targetWorkspaceId) {
        const sourceWorkspace = normalizeWorkspaceId(sourceWorkspaceId);
        const targetWorkspace = normalizeWorkspaceId(targetWorkspaceId);
        if (!sourceWorkspace || !targetWorkspace || sourceWorkspace === targetWorkspace) return;

        const nextStore = cloneStore();
        Object.keys(nextStore).forEach((key) => {
            const parts = String(key).split('::');
            const workspaceId = parts.shift() || 'main';
            const categoryName = normalizeCategoryName(parts.join('::'));
            if (workspaceId !== sourceWorkspace) return;
            const nextKey = buildScopedKey(targetWorkspace, categoryName);
            if (!nextStore[nextKey]) {
                nextStore[nextKey] = nextStore[key];
            } else {
                const mergedSettings = normalizeTreeSettings({
                    clickBehaviorMode: nextStore[key]?.settings?.clickBehaviorMode !== 'inherit'
                        ? nextStore[key]?.settings?.clickBehaviorMode
                        : nextStore[nextKey]?.settings?.clickBehaviorMode
                });
                nextStore[nextKey] = {
                    nodes: dedupeNodes([...(nextStore[nextKey]?.nodes || []), ...(nextStore[key]?.nodes || [])]),
                    settings: mergedSettings
                };
            }
            if (nextKey !== key) delete nextStore[key];
        });
        writeStore(nextStore, false);
    }

    Object.assign(api, {
        transferFolderToCategory,
        renameCategoryEverywhere,
        deleteCategoryEverywhere,
        moveWorkspaceTrees
    });

    api.mutationsCrossScopeReady = true;
})(window.EveBookmarkFolders);
