window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    const shared = ns._shared || {};
    const {
        buildScopedKey,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeParentId,
        dedupeNodes,
        normalizeTreeSettings,
        getScopedNodes,
        setScopedNodes,
        buildChildrenMap,
        cloneStore,
        writeStore
    } = shared;

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

        if (folderId === targetParentId) return false; // Cannot move into itself



        const nodes = getScopedNodes(workspaceId, categoryName);



        // Cycle detection: ensure targetParentId is not a descendant of folderId

        let currentParent = targetParentId;

        while (currentParent) {

            if (currentParent === folderId) return false; // Cycle detected

            const pNode = nodes.find(n => n.id === currentParent);

            if (!pNode) break;

            currentParent = pNode.parentId;

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



            // If it's the same card, just use the local moveFolder logic

            if (sWs === tWs && sCat === tCat) {

                return moveFolder(sWs, sCat, fId, tpId, options);

            }



            const nextStore = cloneStore();

            const sKey = buildScopedKey(sWs, sCat);

            const tKey = buildScopedKey(tWs, tCat);



            const sourceTree = nextStore[sKey];

            if (!sourceTree || !sourceTree.nodes || sourceTree.nodes.length === 0) {

                console.warn('[EveBookmarkFolders] Transfer Aborted: Source tree empty or missing', sKey);

                return false;

            }



            const targetTree = nextStore[tKey] || { nodes: [], settings: normalizeTreeSettings({}) };



            // Find the folder and all its descendants in the source

            const childrenMap = buildChildrenMap(sourceTree.nodes);



            const toMoveIds = new Set();

            function collect(id) {

                toMoveIds.add(id);

                (childrenMap.get(id) || []).forEach(child => collect(child.id));

            }



            const rootNodeId = fId;

            // Check if rootNode exists in source

            if (!sourceTree.nodes.some(n => normalizeFolderId(n.id) === rootNodeId)) {

                return false;

            }



            collect(rootNodeId);



            // 1. Prepare moved nodes

            const movedNodes = sourceTree.nodes.filter(n => toMoveIds.has(n.id)).map(n => {

                const newNode = { ...n };

                if (normalizeFolderId(n.id) === rootNodeId) {

                    newNode.parentId = tpId;

                    newNode.updatedAt = Date.now();

                }

                return newNode;

            });



            console.log('[EveBookmarkFolders] Nodes captured:', movedNodes.length);

            if (movedNodes.length === 0) return false;



            // 2. Add to target

            targetTree.nodes = [...targetTree.nodes, ...movedNodes];

            nextStore[tKey] = targetTree;



            // 3. Remove from source

            sourceTree.nodes = sourceTree.nodes.filter(n => !toMoveIds.has(n.id));

            if (sourceTree.nodes.length === 0 && sourceTree.settings.clickBehaviorMode === 'inherit') {

                delete nextStore[sKey];

            } else {

                nextStore[sKey] = sourceTree;

            }



            // 4. Update all bookmarks in these folders to the new category/workspace

            if (Array.isArray(window.eveState?.links)) {

                window.eveState.links.forEach(link => {

                    if (toMoveIds.has(normalizeFolderId(link.folderId))) {

                        link.workspace = tWs;

                        link.category = tCat;

                        if (typeof window.EveLibrary?.ConnectionsAPI?.syncFromLink === 'function') {

                            window.EveLibrary.ConnectionsAPI.syncFromLink(link.id);

                        }

                    }

                });

            }



            // 5. Final Atomic Write

            writeStore(nextStore, true);

            return true;

        } catch (err) {

            return false;

        }

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
        createFolder,
        renameFolder,
        moveFolder,
        transferFolderToCategory,
        deleteFolder,
        clearLinkFolderAssignment,
        renameCategoryEverywhere,
        deleteCategoryEverywhere,
        moveWorkspaceTrees
    });
})(window.EveBookmarkFolders);
