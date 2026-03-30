window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    if (api.mutationsBasicReady) return;

    const shared = ns._shared || {};
    const {
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeParentId,
        dedupeNodes,
        getScopedNodes,
        setScopedNodes
    } = shared;

    if (!normalizeWorkspaceId || !normalizeCategoryName || !normalizeFolderId || !normalizeParentId || !getScopedNodes || !setScopedNodes) {
        console.warn('[EveBookmarkFolders] Mutation helpers missing; basic mutations not initialized.');
        return;
    }

    function generateFolderId() {
        const randomSuffix = Math.random().toString(36).slice(2, 8);
        return `bf_${Date.now().toString(36)}_${randomSuffix}`;
    }

    function getNextSiblingOrder(nodes, parentId) {
        const normalizedParentId = normalizeParentId(parentId);
        const siblings = dedupeNodes(nodes).filter((node) => normalizeParentId(node.parentId) === normalizedParentId);
        if (!siblings.length) return 0;
        return Math.max(...siblings.map((node) => Number(node.order) || 0)) + 1;
    }

    function createFolder(options = {}) {
        const workspaceId = normalizeWorkspaceId(options.workspaceId);
        const categoryName = normalizeCategoryName(options.categoryName);
        const name = String(options.name || '').trim();
        const parentId = normalizeParentId(options.parentId);
        if (!name) return null;

        const nodes = getScopedNodes(workspaceId, categoryName);
        const now = Date.now();
        const folder = {
            id: generateFolderId(),
            parentId,
            name,
            order: getNextSiblingOrder(nodes, parentId),
            createdAt: now,
            updatedAt: now,
            clickBehaviorMode: 'inherit',
            taskMode: 'inherit'
        };
        nodes.push(folder);
        setScopedNodes(workspaceId, categoryName, nodes, { persist: options.persist !== false });
        return folder;
    }

    function renameFolder(options = {}) {
        const workspaceId = normalizeWorkspaceId(options.workspaceId);
        const categoryName = normalizeCategoryName(options.categoryName);
        const folderId = normalizeFolderId(options.folderId);
        const nextName = String(options.name || '').trim();
        if (!folderId || !nextName) return false;

        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === folderId);
        if (!target) return false;
        target.name = nextName;
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes, { persist: false });
        if (options.persist !== false && typeof saveData === 'function') {
            saveData({
                skipRender: !!options.skipRender,
                skipSuggestions: !!options.skipSuggestions
            });
        }
        return true;
    }

    function moveFolder(workspaceId, categoryName, folderId, targetParentId, options = {}) {
        workspaceId = normalizeWorkspaceId(workspaceId);
        categoryName = normalizeCategoryName(categoryName);
        folderId = normalizeFolderId(folderId);
        targetParentId = normalizeParentId(targetParentId);

        if (!folderId) return false;
        if (folderId === targetParentId) return false;

        const nodes = getScopedNodes(workspaceId, categoryName);
        let currentParent = targetParentId;
        while (currentParent) {
            if (currentParent === folderId) return false;
            const parentNode = nodes.find((node) => node.id === currentParent);
            if (!parentNode) break;
            currentParent = parentNode.parentId;
        }

        const target = nodes.find((node) => node.id === folderId);
        if (!target) return false;

        target.parentId = targetParentId;
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes, { persist: false });
        if (options.persist !== false && typeof saveData === 'function') {
            saveData({
                skipRender: !!options.skipRender,
                skipSuggestions: !!options.skipSuggestions
            });
        }
        return true;
    }

    function clearLinkFolderAssignment(link) {
        if (!link || typeof link !== 'object') return false;
        if (!normalizeFolderId(link.folderId)) {
            delete link.folderId;
            return false;
        }
        delete link.folderId;
        return true;
    }

    function deleteFolder(options = {}) {
        const workspaceId = normalizeWorkspaceId(options.workspaceId);
        const categoryName = normalizeCategoryName(options.categoryName);
        const folderId = normalizeFolderId(options.folderId);
        if (!folderId) return false;

        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === folderId);
        if (!target) return false;

        const nextParentId = normalizeParentId(target.parentId);
        const filteredNodes = nodes.filter((node) => node.id !== folderId);
        filteredNodes.forEach((node) => {
            if (normalizeParentId(node.parentId) === folderId) {
                node.parentId = nextParentId;
                node.updatedAt = Date.now();
            }
        });

        if (Array.isArray(window.eveState?.links)) {
            window.eveState.links.forEach((link) => {
                const sameWorkspace = normalizeWorkspaceId(link?.workspace) === workspaceId;
                const sameCategory = normalizeCategoryName(link?.category) === categoryName;
                if (!sameWorkspace || !sameCategory) return;
                if (normalizeFolderId(link?.folderId) !== folderId) return;
                if (nextParentId) link.folderId = nextParentId;
                else delete link.folderId;
            });
        }

        setScopedNodes(workspaceId, categoryName, filteredNodes, { persist: false });
        if (typeof saveData === 'function') saveData();
        return true;
    }

    Object.assign(api, {
        createFolder,
        renameFolder,
        moveFolder,
        clearLinkFolderAssignment,
        deleteFolder
    });

    api.mutationsBasicReady = true;
})(window.EveBookmarkFolders);
