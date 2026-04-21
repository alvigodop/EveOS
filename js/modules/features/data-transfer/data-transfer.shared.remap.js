// --- Data Transfer Shared Remap ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.sharedRemapReady) return;
    const helpers = ns._sharedRemapHelpers || {};
    const {
        buildCardTargetId,
        buildFolderTargetId,
        buildScopedCategoryKey,
        cloneStructuredData,
        getFirstStoreEntry,
        getRootFolderIdFromTree,
        getStateBookmarks,
        getStateLibrary,
        getTreeNodes,
        inferRestoreScope,
        parseCardTargetId,
        parseFolderTargetId,
        parseScopedCategoryKey
    } = helpers;

    function remapCategoryOrderByWorkspace(orderStore, sourceWorkspaceId, targetWorkspaceId) {
        if (!orderStore || typeof orderStore !== 'object') return {};
        const nextOrderStore = cloneStructuredData(orderStore, {});
        if (!sourceWorkspaceId || sourceWorkspaceId === targetWorkspaceId) return nextOrderStore;
        if (Object.prototype.hasOwnProperty.call(nextOrderStore, sourceWorkspaceId)) {
            nextOrderStore[targetWorkspaceId] = cloneStructuredData(nextOrderStore[sourceWorkspaceId], nextOrderStore[sourceWorkspaceId]);
            delete nextOrderStore[sourceWorkspaceId];
        }
        return nextOrderStore;
    }

    function remapScopedBuckets(store, options = {}) {
        const sourceWorkspaceId = String(options.sourceWorkspaceId || '').trim() || 'main';
        const targetWorkspaceId = String(options.targetWorkspaceId || '').trim() || sourceWorkspaceId;
        const sourceCategoryName = String(options.sourceCategoryName || '').trim();
        const targetCategoryName = String(options.targetCategoryName || '').trim() || sourceCategoryName || 'Unsorted';
        const nextStore = {};
        Object.entries(store && typeof store === 'object' ? store : {}).forEach(([key, value]) => {
            const parsed = parseScopedCategoryKey(key);
            const nextWorkspaceId = parsed.workspaceId === sourceWorkspaceId ? targetWorkspaceId : parsed.workspaceId;
            const nextCategoryName = sourceCategoryName && parsed.categoryName === sourceCategoryName
                ? targetCategoryName
                : parsed.categoryName;
            nextStore[buildScopedCategoryKey(nextWorkspaceId, nextCategoryName)] = cloneStructuredData(value, value);
        });
        return nextStore;
    }

    function remapQuickPinsForRestore(pins, options = {}) {
        const sourceWorkspaceId = String(options.sourceWorkspaceId || '').trim();
        const targetWorkspaceId = String(options.targetWorkspaceId || '').trim() || sourceWorkspaceId || 'main';
        const sourceCategoryName = String(options.sourceCategoryName || '').trim();
        const targetCategoryName = String(options.targetCategoryName || '').trim() || sourceCategoryName || 'Unsorted';
        const sourceRootFolderId = String(options.sourceRootFolderId || '').trim();
        const targetRootFolderId = String(options.targetRootFolderId || '').trim() || sourceRootFolderId;
        return (Array.isArray(pins) ? pins : []).map((rawPin) => {
            const pin = { ...(rawPin || {}) };
            const targetType = String(pin?.targetType || '').trim().toLowerCase();
            if (targetType === 'card') {
                const parsedTarget = parseCardTargetId(pin.targetId);
                if (
                    (!sourceWorkspaceId || parsedTarget.workspaceId === sourceWorkspaceId)
                    && (!sourceCategoryName || parsedTarget.categoryName === sourceCategoryName)
                ) {
                    pin.targetId = buildCardTargetId(targetWorkspaceId, targetCategoryName);
                }
                return pin;
            }
            if (targetType === 'folder') {
                const parsedTarget = parseFolderTargetId(pin.targetId);
                if (
                    (!sourceWorkspaceId || parsedTarget.workspaceId === sourceWorkspaceId)
                    && (!sourceCategoryName || parsedTarget.categoryName === sourceCategoryName)
                ) {
                    const nextFolderId = sourceRootFolderId && targetRootFolderId && parsedTarget.folderId === sourceRootFolderId
                        ? targetRootFolderId
                        : parsedTarget.folderId;
                    pin.targetId = buildFolderTargetId(targetWorkspaceId, targetCategoryName, nextFolderId);
                }
                return pin;
            }
            return pin;
        });
    }

    function remapWorkspaceStateForRestore(state, targetWorkspaceId) {
        const nextState = cloneStructuredData(state, null);
        if (!nextState || typeof nextState !== 'object') return null;
        const sourceScope = inferRestoreScope(nextState);
        const sourceWorkspaceId = String(sourceScope.workspaceId || 'main').trim() || 'main';
        const nextWorkspaceId = String(targetWorkspaceId || sourceWorkspaceId).trim() || sourceWorkspaceId;
        const bookmarks = getStateBookmarks(nextState);
        const library = getStateLibrary(nextState);

        nextState.metadata = {
            ...(nextState.metadata || {}),
            workspaceId: nextWorkspaceId,
            type: 'workspace'
        };
        nextState.bookmarks = {
            ...bookmarks,
            links: (Array.isArray(bookmarks.links) ? bookmarks.links : []).map((link) => ({
                ...(link || {}),
                workspace: nextWorkspaceId
            })),
            config: {
                ...(bookmarks.config || {}),
                activeWorkspace: nextWorkspaceId
            },
            folders: remapScopedBuckets(bookmarks.folders, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId
            }),
            pins: remapQuickPinsForRestore(bookmarks.pins, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId
            })
        };
        if (bookmarks.config?.categoryOrderByWorkspace && typeof bookmarks.config.categoryOrderByWorkspace === 'object') {
            nextState.bookmarks.config.categoryOrderByWorkspace = remapCategoryOrderByWorkspace(
                bookmarks.config.categoryOrderByWorkspace,
                sourceWorkspaceId,
                nextWorkspaceId
            );
        }
        nextState.library = {
            ...library,
            categories: remapScopedBuckets(library.categories, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId
            }),
            connections: (Array.isArray(library.connections) ? library.connections : []).map((connection) => ({
                ...(connection || {}),
                workspace: nextWorkspaceId
            }))
        };
        return nextState;
    }

    function remapCardStateForRestore(state, options = {}) {
        const nextState = cloneStructuredData(state, null);
        if (!nextState || typeof nextState !== 'object') return null;
        const sourceScope = inferRestoreScope(nextState);
        const sourceWorkspaceId = String(sourceScope.workspaceId || 'main').trim() || 'main';
        const sourceCategoryName = String(sourceScope.categoryName || 'Unsorted').trim() || 'Unsorted';
        const nextWorkspaceId = String(options.workspaceId || sourceWorkspaceId).trim() || sourceWorkspaceId;
        const requestedCategoryName = String(options.categoryName || '').trim();
        const shouldCreateUniqueCategory = !!options.createUniqueCategory && (!requestedCategoryName || requestedCategoryName === 'Unsorted');
        const nextCategoryName = shouldCreateUniqueCategory
            ? getUniqueCategoryName(nextWorkspaceId, sourceCategoryName || 'Restored Card')
            : (requestedCategoryName || sourceCategoryName || 'Unsorted');
        const bookmarks = getStateBookmarks(nextState);
        const library = getStateLibrary(nextState);

        nextState.metadata = {
            ...(nextState.metadata || {}),
            workspaceId: nextWorkspaceId,
            categoryName: nextCategoryName,
            type: 'card'
        };
        nextState.bookmarks = {
            ...bookmarks,
            links: (Array.isArray(bookmarks.links) ? bookmarks.links : []).map((link) => ({
                ...(link || {}),
                workspace: nextWorkspaceId,
                category: nextCategoryName
            })),
            config: {
                ...(bookmarks.config || {}),
                activeWorkspace: nextWorkspaceId
            },
            folders: remapScopedBuckets(bookmarks.folders, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName
            }),
            pins: remapQuickPinsForRestore(bookmarks.pins, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName
            })
        };
        nextState.library = {
            ...library,
            categories: remapScopedBuckets(library.categories, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName
            }),
            connections: (Array.isArray(library.connections) ? library.connections : []).map((connection) => ({
                ...(connection || {}),
                workspace: nextWorkspaceId,
                categoryName: nextCategoryName
            }))
        };
        return nextState;
    }

    function remapFolderStateForRestore(state, options = {}) {
        const sourceScope = inferRestoreScope(state);
        const sourceWorkspaceId = String(sourceScope.workspaceId || 'main').trim() || 'main';
        const sourceCategoryName = String(sourceScope.categoryName || 'Unsorted').trim() || 'Unsorted';
        const sourceScopedKey = buildScopedCategoryKey(sourceWorkspaceId, sourceCategoryName);
        const sourceTree = getStateBookmarks(state).folders?.[sourceScopedKey] || getFirstStoreEntry(getStateBookmarks(state).folders)[1];
        const sourceRootFolderId = String(
            state?.metadata?.folderId
            || getRootFolderIdFromTree(sourceTree)
            || ''
        ).trim();
        const nextState = remapCardStateForRestore(state, {
            workspaceId: options.workspaceId,
            categoryName: options.categoryName,
            createUniqueCategory: false
        });
        if (!nextState) return null;

        const nextWorkspaceId = String(nextState.metadata?.workspaceId || sourceWorkspaceId).trim() || sourceWorkspaceId;
        const nextCategoryName = String(nextState.metadata?.categoryName || sourceCategoryName).trim() || sourceCategoryName;
        const nextScopedKey = buildScopedCategoryKey(nextWorkspaceId, nextCategoryName);
        const nextRootFolderId = String(options.folderId || sourceRootFolderId).trim() || sourceRootFolderId;
        const nextTreeStore = cloneStructuredData(nextState.bookmarks?.folders, {});
        const nextTree = nextTreeStore?.[nextScopedKey];
        const nextTreeNodes = getTreeNodes(nextTree);

        if (sourceRootFolderId && nextRootFolderId && sourceRootFolderId !== nextRootFolderId) {
            nextTreeNodes.forEach((node) => {
                if (String(node?.id || '').trim() === sourceRootFolderId) {
                    node.id = nextRootFolderId;
                }
                if (String(node?.parentId || '').trim() === sourceRootFolderId) {
                    node.parentId = nextRootFolderId;
                }
            });
        }

        if (nextTree && typeof nextTree === 'object' && !Array.isArray(nextTree)) {
            nextTreeStore[nextScopedKey] = { ...nextTree, nodes: nextTreeNodes };
        } else if (nextTreeNodes.length > 0) {
            nextTreeStore[nextScopedKey] = { nodes: nextTreeNodes };
        }

        nextState.metadata = {
            ...(nextState.metadata || {}),
            workspaceId: nextWorkspaceId,
            categoryName: nextCategoryName,
            folderId: nextRootFolderId,
            type: 'folder'
        };
        nextState.bookmarks = {
            ...(nextState.bookmarks || {}),
            folders: nextTreeStore,
            links: (Array.isArray(nextState.bookmarks?.links) ? nextState.bookmarks.links : []).map((link) => ({
                ...(link || {}),
                workspace: nextWorkspaceId,
                category: nextCategoryName,
                folderId: sourceRootFolderId && nextRootFolderId && String(link?.folderId || '').trim() === sourceRootFolderId
                    ? nextRootFolderId
                    : link?.folderId
            })),
            pins: remapQuickPinsForRestore(nextState.bookmarks?.pins, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName,
                sourceRootFolderId,
                targetRootFolderId: nextRootFolderId
            })
        };
        nextState.library = {
            ...(nextState.library || {}),
            connections: (Array.isArray(nextState.library?.connections) ? nextState.library.connections : []).map((connection) => ({
                ...(connection || {}),
                workspace: nextWorkspaceId,
                categoryName: nextCategoryName
            }))
        };
        return nextState;
    }

    function getUniqueCategoryName(workspaceId, baseName) {
        const wsId = String(workspaceId || 'main').trim() || 'main';
        const name = String(baseName || 'Restored Card').trim() || 'Restored Card';
        const order = window.EveCategoryOrder?.getOrder?.(wsId) || [];
        if (order.length === 0) {
            const links = typeof window.getLiveLinks === 'function'
                ? window.getLiveLinks()
                : (window.links || window.eveState?.links || []);
            links.forEach((link) => {
                if (String(link.workspace) === wsId && link.category && !order.includes(link.category)) {
                    order.push(link.category);
                }
            });
        }

        if (!order.includes(name)) return name;

        let counter = 1;
        while (order.includes(`${name} (${counter})`)) {
            counter += 1;
        }
        return `${name} (${counter})`;
    }

    Object.assign(ns, {
        cloneStructuredData,
        buildScopedCategoryKey,
        parseScopedCategoryKey,
        buildCardTargetId,
        parseCardTargetId,
        buildFolderTargetId,
        parseFolderTargetId,
        remapWorkspaceStateForRestore,
        remapCardStateForRestore,
        remapFolderStateForRestore,
        getUniqueCategoryName
    });

    ns.sharedRemapReady = true;
})();
