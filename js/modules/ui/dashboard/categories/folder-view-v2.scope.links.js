window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const ns = window.EveFolderViewV2;
    const shared = ns._shared = ns._shared || {};
    if (shared.scopeLinksReady) return;
    if (!shared.scopeSharedReady) {
        console.warn('[EveFolderViewV2] Scope shared helpers missing; scope links not initialized.');
        return;
    }

    function getNodeScopedLinks(viewModel, folderId) {
        const targetNode = viewModel?.nodes?.find((node) => String(node?.id || '') === String(folderId || ''));
        if (!targetNode) return { targetNode: null, links: [] };
        if (targetNode.isGhost) {
            return {
                targetNode,
                links: Array.isArray(targetNode._ghostLinks) ? targetNode._ghostLinks.slice() : []
            };
        }
        const linkIds = collectFolderSubtreeLinkIds(viewModel, folderId);
        const scopedLinks = Array.isArray(viewModel?.scopedLinks)
            ? viewModel.scopedLinks.filter((link) => linkIds.includes(String(link?.id || '')))
            : [];
        return { targetNode, links: scopedLinks };
    }

    function getSourceLinks() {
        return typeof window.getModalLinks === 'function'
            ? window.getModalLinks()
            : (Array.isArray(window.eveState?.links)
                ? window.eveState.links
                : (Array.isArray(window.links) ? window.links : []));
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function filterLinksByIds(sourceLinks, linkIds) {
        if (!Array.isArray(sourceLinks) || !Array.isArray(linkIds)) return [];
        const idSet = new Set(linkIds.map((value) => String(value || '').trim()).filter(Boolean));
        if (!idSet.size) return [];
        return sourceLinks.filter((link) => idSet.has(String(link?.id || '').trim()));
    }

    function getIndexedScopedLinks(scope, sourceLinks) {
        const indexApi = getDatapackIndexApi();
        if (!indexApi || typeof indexApi.getExactBookmarkLinkIds !== 'function') return null;
        const hasUsableSnapshot = typeof indexApi.hasUsableSnapshot === 'function'
            ? indexApi.hasUsableSnapshot()
            : !!indexApi.getSnapshot?.();
        if (!hasUsableSnapshot) return null;
        return filterLinksByIds(sourceLinks, indexApi.getExactBookmarkLinkIds(scope || null));
    }

    function getCategoryLinks(workspaceId, categoryName) {
        const sourceLinks = getSourceLinks();
        const indexedLinks = getIndexedScopedLinks({
            workspaceId: workspaceId,
            categoryName: categoryName
        }, sourceLinks);
        if (indexedLinks) return indexedLinks;
        return sourceLinks.filter((link) => link.workspace === workspaceId && link.category === categoryName);
    }

    function collectFolderSubtreeLinkIds(viewModel, folderId) {
        const normalizedFolderId = String(folderId || '').trim();
        if (!normalizedFolderId || !viewModel?.childrenMap || !viewModel?.folderLinks) return [];
        const visited = new Set();
        const linkIds = new Set();
        const stack = [normalizedFolderId];
        while (stack.length > 0) {
            const currentId = String(stack.pop() || '').trim();
            if (!currentId || visited.has(currentId)) continue;
            visited.add(currentId);
            (viewModel.folderLinks.get(currentId) || []).forEach((link) => {
                const linkId = String(link?.id || '').trim();
                if (linkId) linkIds.add(linkId);
            });
            (viewModel.childrenMap.get(currentId) || []).forEach((childNode) => {
                const childId = String(childNode?.id || '').trim();
                if (childId && !visited.has(childId)) stack.push(childId);
            });
        }
        return Array.from(linkIds);
    }

    function getRealFolderScope(workspaceId, categoryName, folderId) {
        const normalizedFolderId = String(folderId || '').trim();
        const folderApi = window.EveBookmarkFolders;
        const folderStoreApi = folderApi?._shared || folderApi;
        const getScopedNodes = typeof folderStoreApi?.getScopedNodes === 'function'
            ? folderStoreApi.getScopedNodes
            : null;
        if (!normalizedFolderId || !getScopedNodes) {
            return { targetNode: null, links: [] };
        }

        const nodes = getScopedNodes(workspaceId, categoryName);
        if (!Array.isArray(nodes) || !nodes.length) {
            return { targetNode: null, links: [] };
        }

        const nodeMap = new Map();
        const childrenMap = new Map();
        nodes.forEach((node) => {
            const nodeId = String(node?.id || '').trim();
            if (!nodeId) return;
            nodeMap.set(nodeId, node);
            const parentId = String(node?.parentId || '').trim() || null;
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
            childrenMap.get(parentId).push(node);
        });

        const targetNode = nodeMap.get(normalizedFolderId) || null;
        if (!targetNode) {
            return { targetNode: null, links: [] };
        }

        const sourceLinks = getSourceLinks();
        const indexedLinks = getIndexedScopedLinks({
            scope: 'folder',
            workspaceId: workspaceId,
            categoryName: categoryName,
            folderId: normalizedFolderId
        }, sourceLinks);
        if (indexedLinks) {
            return { targetNode, links: indexedLinks };
        }

        const allowedFolderIds = new Set();
        const stack = [normalizedFolderId];
        while (stack.length > 0) {
            const currentId = String(stack.pop() || '').trim();
            if (!currentId || allowedFolderIds.has(currentId)) continue;
            allowedFolderIds.add(currentId);
            (childrenMap.get(currentId) || []).forEach((childNode) => {
                const childId = String(childNode?.id || '').trim();
                if (childId && !allowedFolderIds.has(childId)) stack.push(childId);
            });
        }

        const scopedLinks = getCategoryLinks(workspaceId, categoryName).filter((link) => {
            const currentFolderId = String(link?.folderId || '').trim();
            return !!currentFolderId && allowedFolderIds.has(currentFolderId);
        });
        return { targetNode, links: scopedLinks };
    }

    function getTargetFolderNode(workspaceId, categoryName, folderId) {
        const realScope = getRealFolderScope(workspaceId, categoryName, folderId);
        if (realScope.targetNode) return realScope.targetNode;

        const cachedViewModel = ns.getCachedViewModel(workspaceId, categoryName);
        if (cachedViewModel?.nodes?.length) {
            const cachedNode = cachedViewModel.nodes.find((node) => String(node?.id || '') === String(folderId || ''));
            if (cachedNode) return cachedNode;
        }
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return null;
        const categoryLinks = getCategoryLinks(workspaceId, categoryName);
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks);
        viewModel.scopedLinks = categoryLinks;
        ns.setCachedViewModel(workspaceId, categoryName, viewModel);
        return viewModel.nodes.find((node) => String(node?.id || '') === String(folderId || '')) || null;
    }

    ns.getFolderScopedLinkIds = function (workspaceId, categoryName, folderId) {
        const realScope = getRealFolderScope(workspaceId, categoryName, folderId);
        if (realScope.targetNode) {
            return realScope.links
                .map((link) => String(link?.id || '').trim())
                .filter(Boolean);
        }

        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return [];
        const categoryLinks = getCategoryLinks(workspaceId, categoryName);
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks);
        viewModel.scopedLinks = categoryLinks;
        ns.setCachedViewModel(workspaceId, categoryName, viewModel);
        const { links } = getNodeScopedLinks(viewModel, folderId);
        return links
            .map((link) => String(link?.id || '').trim())
            .filter(Boolean);
    };

    Object.assign(shared, {
        getNodeScopedLinks,
        getCategoryLinks,
        collectFolderSubtreeLinkIds,
        getRealFolderScope,
        getTargetFolderNode
    });

    shared.scopeLinksReady = true;
})();
