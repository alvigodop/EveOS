window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.SearchModules = window.EveLibrary.SearchModules || {};

(function (modules) {
    if (modules.helpers) return;

    const State = window.EveLibrary.State;

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function parseUniqueCsvList(value) {
        const seen = new Set();
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function isEntryVisibleForDataType(entry, dataType) {
        const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : null;
        if (!mediaTypes || mediaTypes.length === 0) return true;
        return mediaTypes.includes(dataType);
    }

    function getTypeScopedEntries(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const entries = lib.entries || [];
        return entries.filter(entry => isEntryVisibleForDataType(entry, dataType));
    }

    function getBookmarkLinks() {
        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        if (indexApi && typeof indexApi.getScopedBookmarkLinkIds === 'function' && typeof indexApi.resolveBookmarkLink === 'function') {
            const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
            const hasUsableSnapshot = typeof indexApi.hasUsableSnapshot === 'function'
                ? indexApi.hasUsableSnapshot()
                : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
            if (hasUsableSnapshot) {
                return indexApi.getScopedBookmarkLinkIds(null)
                    .map((linkId) => indexApi.resolveBookmarkLink(linkId))
                    .filter(Boolean);
            }
        }
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined') return links;
        return [];
    }

    function getBookmarkLinkById(linkId) {
        const normalizedId = String(linkId || '').trim();
        if (!normalizedId) return null;
        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            const resolved = indexApi.resolveBookmarkLink(normalizedId);
            if (resolved) return resolved;
        }
        const scopedLinks = getBookmarkLinks();
        return scopedLinks.find((link) => String(link?.id || '').trim() === normalizedId) || null;
    }

    function getScopedConnections(categoryName, workspaceId, entryId) {
        const connectionsApi = window.EveLibrary?.ConnectionsAPI;
        const allConnections = typeof connectionsApi?.getAll === 'function' ? connectionsApi.getAll() : [];
        return allConnections.filter((conn) => {
            if (String(conn?.libraryEntryId || conn?.entryId || '').trim() !== String(entryId || '').trim()) return false;
            if (String(conn?.workspace || '').trim() !== String(workspaceId || '').trim()) return false;
            return String(conn?.categoryName || conn?.category || 'Unsorted').trim() === String(categoryName || 'Unsorted').trim();
        });
    }

    function buildFolderIndexes(categoryName, workspaceId) {
        const nodes = typeof State.getBookmarkFolderNodes === 'function'
            ? State.getBookmarkFolderNodes(categoryName, workspaceId)
            : [];
        const nodeMap = new Map();
        const childrenMap = new Map();
        (Array.isArray(nodes) ? nodes : []).forEach((rawNode) => {
            const node = { ...(rawNode || {}) };
            const nodeId = String(node.id || '').trim();
            if (!nodeId || nodeMap.has(nodeId)) return;
            const parentId = String(node.parentId || '').trim() || null;
            node.parentId = parentId;
            nodeMap.set(nodeId, node);
            const parentKey = parentId || '__root__';
            if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
            childrenMap.get(parentKey).push(node);
        });
        childrenMap.forEach((childNodes) => {
            childNodes.sort((a, b) => {
                const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : 0;
                const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : 0;
                if (orderA !== orderB) return orderA - orderB;
                return String(a?.name || '').localeCompare(String(b?.name || ''));
            });
        });
        return { nodeMap, childrenMap };
    }

    function collectDescendantFolderIds(folderId, childrenMap, includeSelf = true) {
        const collected = new Set();
        const visit = (currentId, addSelf) => {
            if (addSelf) collected.add(currentId);
            const children = childrenMap.get(currentId) || [];
            children.forEach((child) => {
                const childId = String(child?.id || '').trim();
                if (!childId || collected.has(childId)) return;
                visit(childId, true);
            });
        };
        const targetId = String(folderId || '').trim();
        if (!targetId) return collected;
        visit(targetId, includeSelf);
        if (!includeSelf) collected.delete(targetId);
        return collected;
    }

    function resolveFolderSelection(categoryName) {
        const workspaceId = typeof State.getCurrentWorkspaceId === 'function'
            ? State.getCurrentWorkspaceId()
            : String(window.eveState?.config?.activeWorkspace || 'main');
        const folderView = typeof State.getCategoryFolderView === 'function'
            ? State.getCategoryFolderView(categoryName, workspaceId)
            : { root: 'all', chain: [], expanded: false };
        const rootSelection = String(folderView?.root || 'all').trim() || 'all';
        if (rootSelection === 'all') return { mode: 'all', workspaceId, folderView };
        if (rootSelection === 'root') return { mode: 'root', workspaceId, folderView };

        const { nodeMap, childrenMap } = buildFolderIndexes(categoryName, workspaceId);
        if (!rootSelection.startsWith('folder:')) {
            return { mode: 'all', workspaceId, folderView, nodeMap, childrenMap };
        }
        let currentFolderId = String(rootSelection.slice('folder:'.length) || '').trim();
        if (!currentFolderId || !nodeMap.has(currentFolderId)) {
            return { mode: 'all', workspaceId, folderView, nodeMap, childrenMap };
        }

        const chain = Array.isArray(folderView?.chain) ? folderView.chain : [];
        for (let index = 0; index < chain.length; index += 1) {
            const selection = String(chain[index]?.selection || '').trim();
            if (!selection || selection === 'self') {
                return { mode: 'self', folderId: currentFolderId, workspaceId, folderView, nodeMap, childrenMap };
            }
            if (selection === 'self_and_descendants') {
                return {
                    mode: 'folder_set',
                    folderId: currentFolderId,
                    workspaceId,
                    folderView,
                    nodeMap,
                    childrenMap,
                    allowedFolderIds: collectDescendantFolderIds(currentFolderId, childrenMap, true)
                };
            }
            if (selection === 'descendants_only') {
                return {
                    mode: 'folder_set',
                    folderId: currentFolderId,
                    workspaceId,
                    folderView,
                    nodeMap,
                    childrenMap,
                    allowedFolderIds: collectDescendantFolderIds(currentFolderId, childrenMap, false)
                };
            }
            if (selection.startsWith('child:')) {
                const childId = String(selection.slice('child:'.length) || '').trim();
                if (!childId || !nodeMap.has(childId)) {
                    return { mode: 'self', folderId: currentFolderId, workspaceId, folderView, nodeMap, childrenMap };
                }
                currentFolderId = childId;
                continue;
            }
            return { mode: 'self', folderId: currentFolderId, workspaceId, folderView, nodeMap, childrenMap };
        }

        return { mode: 'self', folderId: currentFolderId, workspaceId, folderView, nodeMap, childrenMap };
    }

    function matchesEntryFolderSelection(entry, categoryName) {
        const selection = resolveFolderSelection(categoryName);
        if (selection.mode === 'all') return true;

        const entryId = String(entry?.id || '').trim();
        if (!entryId) return false;

        const connections = getScopedConnections(categoryName, selection.workspaceId, entryId);
        if (!connections.length) return false;

        return connections.some((conn) => {
            const link = getBookmarkLinkById(conn?.linkId);
            if (!link) return false;
            if (String(link?.workspace || '').trim() !== String(selection.workspaceId || '').trim()) return false;
            if (String(link?.category || 'Unsorted').trim() !== String(categoryName || 'Unsorted').trim()) return false;
            const folderId = String(link?.folderId || '').trim();
            if (selection.mode === 'root') return !folderId;
            if (!folderId) return false;
            if (selection.mode === 'self') return folderId === String(selection.folderId || '').trim();
            if (selection.mode === 'folder_set') return selection.allowedFolderIds instanceof Set && selection.allowedFolderIds.has(folderId);
            return false;
        });
    }

    function getFolderScopedEntries(categoryName) {
        return getTypeScopedEntries(categoryName).filter((entry) => matchesEntryFolderSelection(entry, categoryName));
    }

    modules.helpers = {
        toArray,
        parseUniqueCsvList,
        isEntryVisibleForDataType,
        getTypeScopedEntries,
        getFolderScopedEntries,
        getBookmarkLinkById,
        resolveFolderSelection,
        buildFolderIndexes,
        collectDescendantFolderIds,
        matchesEntryFolderSelection
    };
})(window.EveLibrary.SearchModules);
