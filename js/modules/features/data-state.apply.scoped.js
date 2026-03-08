/**
 * Unified State Store Apply Scoped Helpers
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applyScopedReady) return;
    if (!ns.captureReady || !ns.applySharedReady) {
        console.warn('[EveDataStore] Capture/shared apply helpers missing; scoped apply helpers not initialized.');
        return;
    }

    const getLinks = ns.getLinks;
    const getBookmarkFolders = ns.getBookmarkFolders;
    const setBookmarkFolders = ns.setBookmarkFolders;
    const cloneConnections = ns.cloneConnections;
    const getConnectionCategoryName = ns.getConnectionCategoryName;
    const findCategoryLibraryData = ns.findCategoryLibraryData;

    function getFolderTreesObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        const stateModule = window.EveLibrary?.State;
        if (stateModule?.buildScopedCategoryKey) {
            return stateModule.buildScopedCategoryKey(categoryName, workspaceId);
        }
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function filterFolderTreesByWorkspace(folderTrees, workspaceId) {
        const trees = getFolderTreesObject(folderTrees);
        const filtered = {};
        Object.entries(trees).forEach(([key, value]) => {
            if (String(key || '').split('::', 1)[0] !== String(workspaceId || 'main')) return;
            filtered[key] = value;
        });
        return filtered;
    }

    function applyState(state) {
        if (!state || typeof state !== 'object') return false;

        if (state.bookmarks) {
            if (Array.isArray(state.bookmarks.links)) {
                ns.setLinks(state.bookmarks.links);
            }
            if (state.bookmarks.config && typeof state.bookmarks.config === 'object') {
                ns.setConfig(state.bookmarks.config);
            }
            setBookmarkFolders(getFolderTreesObject(state.bookmarks.folders));
        }

        if (state.library) {
            ns.applyLibraryCategories(state.library.categories);
            if (Array.isArray(state.library.connections)) {
                if (window.EveLibrary?.ConnectionsAPI?.setAll) {
                    window.EveLibrary.ConnectionsAPI.setAll(state.library.connections);
                } else {
                    window.EveLibrary = window.EveLibrary || {};
                    window.EveLibrary.Connections = state.library.connections.map(entry => ({ ...entry }));
                }
            }
        }

        return true;
    }

    function applyWorkspaceState(state) {
        if (!state || typeof state !== 'object') return false;
        const workspaceId = state.metadata?.workspaceId || state.bookmarks?.config?.activeWorkspace;
        if (!workspaceId) return false;

        if (Array.isArray(state.bookmarks?.links)) {
            const remaining = getLinks().filter(entry => entry.workspace !== workspaceId);
            ns.setLinks(remaining.concat(state.bookmarks.links.map(entry => ({ ...entry, workspace: workspaceId }))));
        }

        if (state.bookmarks?.config) {
            ns.setConfig({ activeWorkspace: workspaceId });
        }
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const incomingFolderTrees = filterFolderTreesByWorkspace(state.bookmarks?.folders, workspaceId);
        const remainingFolderTrees = Object.fromEntries(
            Object.entries(existingFolderTrees).filter(([key]) => String(key || '').split('::', 1)[0] !== String(workspaceId))
        );
        setBookmarkFolders({ ...remainingFolderTrees, ...incomingFolderTrees });

        if (state.library) {
            ns.applyLibraryCategories(state.library.categories);
            ns.applyConnections(workspaceId, state.library.connections || []);
        }

        return true;
    }

    function applyCardState(state) {
        if (!state || typeof state !== 'object') return false;
        const workspaceId = state.metadata?.workspaceId || state.bookmarks?.config?.activeWorkspace;
        const categoryName = state.metadata?.categoryName;
        if (!workspaceId || !categoryName) return false;

        if (Array.isArray(state.bookmarks?.links)) {
            const remaining = getLinks().filter(entry => !(entry.workspace === workspaceId && (entry.category || 'Unsorted') === categoryName));
            const incoming = state.bookmarks.links.map(entry => ({
                ...entry,
                workspace: workspaceId,
                category: categoryName
            }));
            ns.setLinks(remaining.concat(incoming));
        }

        ns.setConfig({ activeWorkspace: workspaceId });
        const targetScopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const nextFolderTrees = { ...existingFolderTrees };
        delete nextFolderTrees[targetScopedKey];
        if (Object.prototype.hasOwnProperty.call(getFolderTreesObject(state.bookmarks?.folders), targetScopedKey)) {
            nextFolderTrees[targetScopedKey] = state.bookmarks.folders[targetScopedKey];
        }
        setBookmarkFolders(nextFolderTrees);

        if (state.library?.categories && typeof state.library.categories === 'object') {
            const selectedCategory = findCategoryLibraryData(state.library.categories, workspaceId, categoryName);
            if (selectedCategory) {
                ns.applyLibraryCategories({ [categoryName]: selectedCategory });
            } else {
                ns.applyLibraryCategories(state.library.categories);
            }
        }

        if (Array.isArray(state.library?.connections)) {
            const existing = cloneConnections();
            const incoming = state.library.connections.map(conn => ({
                ...conn,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }));
            const incomingLinkIds = new Set(incoming.map(conn => conn.linkId).filter(Boolean));
            const filtered = existing.filter(conn => {
                const connCategory = getConnectionCategoryName(conn) || '';
                if (conn.workspace === workspaceId && connCategory === categoryName) return false;
                if (incomingLinkIds.has(conn.linkId)) return false;
                return true;
            });
            const next = filtered.concat(incoming);
            if (window.EveLibrary?.ConnectionsAPI?.setAll) {
                window.EveLibrary.ConnectionsAPI.setAll(next);
            } else {
                window.EveLibrary = window.EveLibrary || {};
                window.EveLibrary.Connections = next;
            }
        }

        return true;
    }

    function applyBookmarkState(state) {
        if (!state || typeof state !== 'object') return false;
        const incomingLinks = Array.isArray(state.bookmarks?.links) ? state.bookmarks.links : [];
        if (!incomingLinks.length) return false;

        const incomingLink = { ...incomingLinks[0] };
        const workspaceId = String(
            state.metadata?.workspaceId
            || incomingLink.workspace
            || state.bookmarks?.config?.activeWorkspace
            || ''
        ).trim();
        if (!workspaceId) return false;

        const categoryName = String(
            state.metadata?.categoryName
            || incomingLink.category
            || 'Unsorted'
        ).trim() || 'Unsorted';
        incomingLink.workspace = workspaceId;
        incomingLink.category = categoryName;

        if (!incomingLink.id) return false;
        const normalizedLinkId = String(incomingLink.id);

        const remaining = getLinks().filter(entry => String(entry.id) !== normalizedLinkId);
        ns.setLinks(remaining.concat(incomingLink));
        ns.setConfig({ activeWorkspace: workspaceId });
        const targetScopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const incomingFolderTrees = getFolderTreesObject(state.bookmarks?.folders);
        if (Object.prototype.hasOwnProperty.call(incomingFolderTrees, targetScopedKey)) {
            const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
            setBookmarkFolders({
                ...existingFolderTrees,
                [targetScopedKey]: incomingFolderTrees[targetScopedKey]
            });
        }

        if (state.library?.categories && typeof state.library.categories === 'object') {
            ns.applyLibraryCategories(state.library.categories);
        }

        const existing = cloneConnections();
        const incomingConnections = Array.isArray(state.library?.connections)
            ? state.library.connections.map(conn => ({
                ...conn,
                linkId: normalizedLinkId,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }))
            : [];
        const filtered = existing.filter(conn => String(conn.linkId) !== normalizedLinkId);
        const next = filtered.concat(incomingConnections);
        if (window.EveLibrary?.ConnectionsAPI?.setAll) {
            window.EveLibrary.ConnectionsAPI.setAll(next);
        } else {
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = next;
        }

        return true;
    }

    Object.assign(ns, {
        applyState,
        applyWorkspaceState,
        applyCardState,
        applyBookmarkState
    });

    ns.applyScopedReady = true;
})();
