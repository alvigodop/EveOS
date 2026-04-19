// --- Data Transfer Shared Remap ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.sharedRemapReady) return;

    function cloneStructuredData(value, fallbackValue = null) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return fallbackValue;
        }
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        if (window.EveBookmarkFolders?.buildScopedKey) {
            return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
        }
        if (window.EveLibrary?.State?.buildScopedCategoryKey) {
            return window.EveLibrary.State.buildScopedCategoryKey(categoryName, workspaceId);
        }
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function parseScopedCategoryKey(value) {
        const raw = String(value || '').trim();
        if (!raw) return { workspaceId: 'main', categoryName: 'Unsorted' };
        const pivot = raw.indexOf('::');
        if (pivot < 0) {
            return {
                workspaceId: 'main',
                categoryName: raw || 'Unsorted'
            };
        }
        return {
            workspaceId: String(raw.slice(0, pivot) || 'main').trim() || 'main',
            categoryName: String(raw.slice(pivot + 2) || 'Unsorted').trim() || 'Unsorted'
        };
    }

    function buildCardTargetId(workspaceId, categoryName) {
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function parseCardTargetId(value) {
        return parseScopedCategoryKey(value);
    }

    function buildFolderTargetId(workspaceId, categoryName, folderId) {
        const base = buildCardTargetId(workspaceId, categoryName);
        const normalizedFolderId = String(folderId || '').trim();
        return normalizedFolderId ? `${base}::${normalizedFolderId}` : base;
    }

    function parseFolderTargetId(value) {
        const raw = String(value || '').trim();
        if (!raw) {
            return {
                workspaceId: 'main',
                categoryName: 'Unsorted',
                folderId: ''
            };
        }
        const firstPivot = raw.indexOf('::');
        if (firstPivot < 0) {
            return {
                workspaceId: 'main',
                categoryName: 'Unsorted',
                folderId: raw
            };
        }
        const workspaceId = String(raw.slice(0, firstPivot) || 'main').trim() || 'main';
        const remainder = raw.slice(firstPivot + 2);
        const secondPivot = remainder.indexOf('::');
        if (secondPivot < 0) {
            return {
                workspaceId,
                categoryName: String(remainder || 'Unsorted').trim() || 'Unsorted',
                folderId: ''
            };
        }
        return {
            workspaceId,
            categoryName: String(remainder.slice(0, secondPivot) || 'Unsorted').trim() || 'Unsorted',
            folderId: String(remainder.slice(secondPivot + 2) || '').trim()
        };
    }

    function getStateBookmarks(state) {
        return state?.bookmarks && typeof state.bookmarks === 'object'
            ? state.bookmarks
            : {};
    }

    function getStateLibrary(state) {
        return state?.library && typeof state.library === 'object'
            ? state.library
            : {};
    }

    function getFirstStoreEntry(store) {
        const entries = store && typeof store === 'object' ? Object.entries(store) : [];
        return entries.length > 0 ? entries[0] : [null, null];
    }

    function inferRestoreScope(state) {
        const metadata = state?.metadata && typeof state.metadata === 'object' ? state.metadata : {};
        const bookmarks = getStateBookmarks(state);
        const library = getStateLibrary(state);
        const links = Array.isArray(bookmarks.links) ? bookmarks.links : [];
        const firstLink = links[0] || null;
        const workspaceId = String(
            metadata.workspaceId
            || bookmarks.config?.activeWorkspace
            || firstLink?.workspace
            || ''
        ).trim();
        const categoryName = String(
            metadata.categoryName
            || firstLink?.category
            || ''
        ).trim();
        if (workspaceId || categoryName) {
            return {
                workspaceId: workspaceId || 'main',
                categoryName: categoryName || 'Unsorted'
            };
        }
        const [folderKey] = getFirstStoreEntry(bookmarks.folders);
        if (folderKey) return parseScopedCategoryKey(folderKey);
        const [libraryKey] = getFirstStoreEntry(library.categories);
        if (libraryKey) return parseScopedCategoryKey(libraryKey);
        return { workspaceId: 'main', categoryName: 'Unsorted' };
    }

    function getTreeNodes(tree) {
        if (Array.isArray(tree?.nodes)) {
            return tree.nodes.map((node) => ({ ...(node || {}) }));
        }
        if (Array.isArray(tree)) {
            return tree.map((node) => ({ ...(node || {}) }));
        }
        return [];
    }

    function getRootFolderIdFromTree(tree) {
        const nodes = getTreeNodes(tree);
        const rootNode = nodes.find((node) => !String(node?.parentId || '').trim()) || nodes[0] || null;
        return String(rootNode?.id || '').trim();
    }

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
            const links = window.links || window.eveState?.links || [];
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
