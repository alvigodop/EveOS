window.EveDataTransfer = window.EveDataTransfer || {};

(function (ns) {
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

    ns._sharedRemapHelpers = Object.assign(ns._sharedRemapHelpers || {}, {
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
    });
})(window.EveDataTransfer);
