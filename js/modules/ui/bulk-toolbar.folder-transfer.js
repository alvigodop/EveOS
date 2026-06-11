window.EveBulkToolbar = window.EveBulkToolbar || {};

(function (ns) {
    if (ns.FolderTransfer) return;

    function text(value, fallback = '') {
        const normalized = value == null ? '' : String(value).trim();
        return normalized || fallback;
    }

    function buildChildrenMap(nodes) {
        const children = new Map();
        (Array.isArray(nodes) ? nodes : []).forEach((node) => {
            const parentId = text(node?.parentId);
            if (!children.has(parentId)) children.set(parentId, []);
            children.get(parentId).push(text(node?.id));
        });
        return children;
    }

    function collectBranchIds(folderId, childrenMap) {
        const ids = new Set();
        function visit(id) {
            if (!id || ids.has(id)) return;
            ids.add(id);
            (childrenMap.get(id) || []).forEach(visit);
        }
        visit(folderId);
        return ids;
    }

    function collectTransferRoots(tree, scopedLinks, selectedIds) {
        const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
        if (!nodes.length) return [];
        const childrenMap = buildChildrenMap(nodes);
        const nodeById = new Map(nodes.map((node) => [text(node?.id), node]));
        const candidates = new Map();

        nodes.forEach((node) => {
            const folderId = text(node?.id);
            if (!folderId) return;
            const branchIds = collectBranchIds(folderId, childrenMap);
            const branchLinks = scopedLinks.filter((link) => branchIds.has(text(link?.folderId)));
            if (!branchLinks.length || branchLinks.some((link) => !selectedIds.has(text(link?.id)))) return;
            candidates.set(folderId, {
                folderId,
                branchIds,
                linkIds: branchLinks.map((link) => text(link?.id)).filter(Boolean)
            });
        });

        return Array.from(candidates.values()).filter((candidate) => {
            let parentId = text(nodeById.get(candidate.folderId)?.parentId);
            while (parentId) {
                if (candidates.has(parentId)) return false;
                parentId = text(nodeById.get(parentId)?.parentId);
            }
            return true;
        });
    }

    function transferFullySelectedBranches(options = {}) {
        const folderApi = window.EveBookmarkFolders;
        const allLinks = Array.isArray(options.allLinks) ? options.allLinks : [];
        const selectedIds = options.selectedIds instanceof Set ? options.selectedIds : new Set();
        const targetCategoryName = text(options.targetCategoryName, 'Unsorted');
        const targetFolderId = text(options.targetFolderId);
        const resolveTargetWorkspaceId = typeof options.resolveTargetWorkspaceId === 'function'
            ? options.resolveTargetWorkspaceId
            : (scope) => scope.workspaceId;
        const result = {
            transferredLinkIds: [],
            transferredFolders: [],
            touchedScopes: []
        };

        if (targetFolderId
            || !selectedIds.size
            || typeof folderApi?.getScopedTree !== 'function'
            || typeof folderApi?.transferFolderToCategory !== 'function') {
            return result;
        }

        const sourceScopes = new Map();
        allLinks.forEach((link) => {
            const linkId = text(link?.id);
            if (!selectedIds.has(linkId)) return;
            const workspaceId = text(link?.workspace, 'main');
            const categoryName = text(link?.category, 'Unsorted');
            const key = workspaceId + '::' + categoryName;
            if (!sourceScopes.has(key)) sourceScopes.set(key, { workspaceId, categoryName });
        });

        sourceScopes.forEach((scope) => {
            const targetWorkspaceId = text(resolveTargetWorkspaceId(scope), 'main');
            if (targetWorkspaceId === scope.workspaceId && targetCategoryName === scope.categoryName) return;
            const scopedLinks = allLinks.filter((link) => (
                text(link?.workspace, 'main') === scope.workspaceId
                && text(link?.category, 'Unsorted') === scope.categoryName
            ));
            const roots = collectTransferRoots(
                folderApi.getScopedTree(scope.workspaceId, scope.categoryName),
                scopedLinks,
                selectedIds
            );

            roots.forEach((root) => {
                const transferred = folderApi.transferFolderToCategory(
                    root.folderId,
                    scope.workspaceId,
                    scope.categoryName,
                    targetWorkspaceId,
                    targetCategoryName,
                    '',
                    { persist: false, source: 'bulk-fully-selected-folder-transfer' }
                );
                if (!transferred) return;
                result.transferredLinkIds.push(...root.linkIds);
                result.transferredFolders.push({
                    folderId: root.folderId,
                    sourceWorkspaceId: scope.workspaceId,
                    sourceCategoryName: scope.categoryName,
                    targetWorkspaceId,
                    targetCategoryName
                });
                result.touchedScopes.push(scope, {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName
                });
            });
        });

        result.transferredLinkIds = Array.from(new Set(result.transferredLinkIds));
        return result;
    }

    ns.FolderTransfer = {
        collectTransferRoots,
        transferFullySelectedBranches
    };
})(window.EveBulkToolbar);
