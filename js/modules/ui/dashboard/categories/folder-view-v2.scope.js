window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    function escapeCardHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeCardJs(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function buildScopedFolderViewKey(workspaceId, categoryName) {
        return `${String(workspaceId || 'main').trim() || 'main'}::${String(categoryName || '').trim() || 'Unsorted'}`;
    }

    function cloneGhostFilterChain(chain) {
        if (!Array.isArray(chain)) return null;
        const normalized = chain
            .map((item) => ({
                dimension: String(item?.dimension || '').trim(),
                valueKey: String(item?.valueKey || '').trim().toLowerCase(),
                label: String(item?.label || '').trim()
            }))
            .filter((item) => item.dimension && item.valueKey);
        return normalized.length ? normalized : null;
    }

    window.EveFolderViewV2._viewModelCache = window.EveFolderViewV2._viewModelCache || {};
    window.EveFolderViewV2._headerActionState = window.EveFolderViewV2._headerActionState || {};

    window.EveFolderViewV2.setCachedViewModel = function(workspaceId, categoryName, viewModel) {
        window.EveFolderViewV2._viewModelCache[buildScopedFolderViewKey(workspaceId, categoryName)] = viewModel || null;
    };

    window.EveFolderViewV2.getCachedViewModel = function(workspaceId, categoryName) {
        return window.EveFolderViewV2._viewModelCache[buildScopedFolderViewKey(workspaceId, categoryName)] || null;
    };

    function buildHeaderActionKey(workspaceId, categoryName, folderId) {
        return `${buildScopedFolderViewKey(workspaceId, categoryName)}::${String(folderId || '').trim() || '__root__'}`;
    }

    window.EveFolderViewV2.isHeaderActionsExpanded = function (workspaceId, categoryName, folderId) {
        return !!window.EveFolderViewV2._headerActionState[buildHeaderActionKey(workspaceId, categoryName, folderId)];
    };

    function rerenderActiveFolderView(workspaceId, categoryName) {
        const scopedKey = `${workspaceId}::${categoryName}`;
        const activeFolderId = String(window.eveState?.config?.activeManhwaFolders?.[scopedKey] || '').trim();
        if (activeFolderId) {
            window.EveFolderViewV2.enterFolder(null, categoryName, activeFolderId, workspaceId);
            return;
        }
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }

    window.EveFolderViewV2.toggleHeaderActions = function (workspaceId, categoryName, folderId) {
        const key = buildHeaderActionKey(workspaceId, categoryName, folderId);
        window.EveFolderViewV2._headerActionState[key] = !window.EveFolderViewV2._headerActionState[key];
        rerenderActiveFolderView(workspaceId, categoryName);
    };

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

    function getCategoryLinks(workspaceId, categoryName) {
        const sourceLinks = typeof window.getModalLinks === 'function'
            ? window.getModalLinks()
            : (Array.isArray(window.eveState?.links)
                ? window.eveState.links
                : (Array.isArray(window.links) ? window.links : []));
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
        if (!normalizedFolderId || !folderApi?.getScopedNodes) {
            return { targetNode: null, links: [] };
        }

        const nodes = folderApi.getScopedNodes(workspaceId, categoryName);
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

        const cachedViewModel = window.EveFolderViewV2.getCachedViewModel(workspaceId, categoryName);
        if (cachedViewModel?.nodes?.length) {
            const cachedNode = cachedViewModel.nodes.find((node) => String(node?.id || '') === String(folderId || ''));
            if (cachedNode) return cachedNode;
        }
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return null;
        const categoryLinks = getCategoryLinks(workspaceId, categoryName);
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks);
        viewModel.scopedLinks = categoryLinks;
        window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);
        return viewModel.nodes.find((node) => String(node?.id || '') === String(folderId || '')) || null;
    }

    window.EveFolderViewV2.getFolderScopedLinkIds = function (workspaceId, categoryName, folderId) {
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
        window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);
        const { links } = getNodeScopedLinks(viewModel, folderId);
        return links
            .map((link) => String(link?.id || '').trim())
            .filter(Boolean);
    };

    window.EveFolderViewV2.openFolderScopedMap = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        if (window.EveConstellationMap?.openFolderMap) {
            if (targetNode.isGhost && window.EveConstellationMap?.openDerivedMap) {
                const linkIds = window.EveFolderViewV2.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
                window.EveConstellationMap.openDerivedMap({
                    workspaceId,
                    categoryName,
                    linkIds,
                    scopeLabel: targetNode.name
                });
                return;
            }
            window.EveConstellationMap.openFolderMap(workspaceId, categoryName, folderId, targetNode.name);
        }
    };

    window.EveFolderViewV2.openFolderBulkTitle = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        const linkIds = window.EveFolderViewV2.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
        if (!linkIds.length) {
            if (typeof window.showToast === 'function') window.showToast('No bookmarks in this folder subtree.', 'warning');
            return;
        }
        if (typeof window.openBulkTitleModal === 'function') {
            window.openBulkTitleModal({
                categoryName,
                linkIds,
                title: `Auto-Title Links :: ${targetNode.name}`,
                hint: 'Only bookmarks inside this folder and its nested subfolders are included.'
            });
        }
    };

    window.EveFolderViewV2.openFolderBulkLibraryAuto = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        const linkIds = window.EveFolderViewV2.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
        if (!linkIds.length) {
            if (typeof window.showToast === 'function') window.showToast('No bookmarks in this folder subtree.', 'warning');
            return;
        }
        if (typeof window.openBulkLibraryAutoModal === 'function') {
            window.openBulkLibraryAutoModal({
                categoryName,
                linkIds,
                title: `Auto-Add Library Entries :: ${targetNode.name}`,
                hint: 'Strict mode: sources are accepted only when API title/synonym matches the bookmark title exactly (case-sensitive). Only this folder subtree is included.'
            });
        }
    };

    // State Management

    const shared = window.EveFolderViewV2._shared = window.EveFolderViewV2._shared || {};
    Object.assign(shared, {
        escapeCardHtml,
        escapeCardJs,
        buildScopedFolderViewKey,
        cloneGhostFilterChain,
        rerenderActiveFolderView,
        getNodeScopedLinks,
        getCategoryLinks,
        collectFolderSubtreeLinkIds,
        getRealFolderScope,
        getTargetFolderNode
    });
})();
