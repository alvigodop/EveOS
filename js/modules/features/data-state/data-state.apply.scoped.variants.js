/**
 * Unified State Store Apply Scoped Variants
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applyScopedVariantsReady) return;
    if (!ns.captureReady || !ns.applySharedReady || !ns.applyScopedHelpersReady) {
        console.warn('[EveDataStore] Scoped apply dependencies missing; scoped variants not initialized.');
        return;
    }

    const getLinks = ns.getLinks;
    const getBookmarkFolders = ns.getBookmarkFolders;
    const cloneConnections = ns.cloneConnections;
    const getConnectionCategoryName = ns.getConnectionCategoryName;
    const parseLibraryKey = ns.parseLibraryKey;
    const findCategoryLibraryData = ns.findCategoryLibraryData;
    const stripLegacyPinnedFlag = ns.stripLegacyPinnedFlag;
    const mergeLibraryEntries = ns.mergeLibraryEntries;
    const deriveLegacyPinsFromLinks = ns.deriveLegacyPinsFromLinks;
    const replaceQuickPinsForWorkspace = ns.replaceQuickPinsForWorkspace;
    const replaceQuickPinsForCard = ns.replaceQuickPinsForCard;
    const replaceQuickPinsForBookmark = ns.replaceQuickPinsForBookmark;
    const replaceQuickPinsForFolder = ns.replaceQuickPinsForFolder;
    const getFolderTreesObject = ns.getFolderTreesObject;
    const buildScopedCategoryKey = ns.buildScopedCategoryKey;
    const filterFolderTreesByWorkspace = ns.filterFolderTreesByWorkspace;
    const getFolderNodes = ns.getFolderNodes;
    const normalizeFolderTreeSettings = ns.normalizeFolderTreeSettings;
    const buildFolderMaps = ns.buildFolderMaps;
    const collectFolderSubtreeIds = ns.collectFolderSubtreeIds;
    const mergeFolderSubtree = ns.mergeFolderSubtree;
    const setLinks = ns.setLinks;
    const setConfig = ns.setConfig;
    const setBookmarkFolders = ns.setBookmarkFolders;
    const setQuickPins = ns.setQuickPins;
    const applyLibraryCategories = ns.applyLibraryCategories;
    const applyConnections = ns.applyConnections;
    const applyKnowledgeState = ns.applyKnowledgeState;

    function applyState(state) {
        if (!state || typeof state !== 'object') return false;
        const hasIncomingPins = !!(state.bookmarks && Object.prototype.hasOwnProperty.call(state.bookmarks, 'pins'));

        if (state.bookmarks) {
            if (Array.isArray(state.bookmarks.links)) {
                setLinks(state.bookmarks.links.map(stripLegacyPinnedFlag));
            }
            if (state.bookmarks.config && typeof state.bookmarks.config === 'object') {
                setConfig(state.bookmarks.config);
            }
            setBookmarkFolders(getFolderTreesObject(state.bookmarks.folders));
            if (hasIncomingPins) {
                setQuickPins(Array.isArray(state.bookmarks.pins) ? state.bookmarks.pins : []);
            } else if (window.EveQuickPins?.migrateLegacyPins) {
                window.EveQuickPins.migrateLegacyPins();
            }
        }

        if (state.library) {
            applyLibraryCategories(state.library.categories);
            if (Array.isArray(state.library.connections)) {
                if (window.EveLibrary?.ConnectionsAPI?.setAll) {
                    window.EveLibrary.ConnectionsAPI.setAll(state.library.connections);
                } else {
                    window.EveLibrary = window.EveLibrary || {};
                    window.EveLibrary.Connections = state.library.connections.map((entry) => ({ ...entry }));
                }
            }
        }

        applyKnowledgeState(state.knowledge);

        return true;
    }

    function applyWorkspaceState(state) {
        if (!state || typeof state !== 'object') return false;
        const workspaceId = state.metadata?.workspaceId || state.bookmarks?.config?.activeWorkspace;
        if (!workspaceId) return false;

        if (Array.isArray(state.bookmarks?.links)) {
            const remaining = getLinks().filter((entry) => entry.workspace !== workspaceId);
            setLinks(remaining.concat(state.bookmarks.links.map((entry) => ({ ...stripLegacyPinnedFlag(entry), workspace: workspaceId }))));
        }

        if (state.bookmarks?.config) {
            setConfig({ activeWorkspace: workspaceId });
        }
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const incomingFolderTrees = filterFolderTreesByWorkspace(state.bookmarks?.folders, workspaceId);
        const remainingFolderTrees = Object.fromEntries(
            Object.entries(existingFolderTrees).filter(([key]) => String(key || '').split('::', 1)[0] !== String(workspaceId))
        );
        setBookmarkFolders({ ...remainingFolderTrees, ...incomingFolderTrees });
        if (state.bookmarks && Object.prototype.hasOwnProperty.call(state.bookmarks, 'pins')) {
            replaceQuickPinsForWorkspace(workspaceId, Array.isArray(state.bookmarks?.pins) ? state.bookmarks.pins : []);
        } else if (Array.isArray(state.bookmarks?.links)) {
            replaceQuickPinsForWorkspace(workspaceId, deriveLegacyPinsFromLinks(state.bookmarks.links));
        }

        if (state.library) {
            applyLibraryCategories(state.library.categories);
            applyConnections(workspaceId, state.library.connections || []);
        }

        const workspaceCategoryNames = Array.from(new Set(
            (state.bookmarks?.links || [])
                .map((entry) => String(entry?.category || 'Unsorted').trim() || 'Unsorted')
                .concat(Object.keys(state.library?.categories || {}).map((key) => String(parseLibraryKey(key)?.categoryName || '').trim()).filter(Boolean))
        ));
        applyKnowledgeState(state.knowledge, workspaceCategoryNames);

        return true;
    }

    function applyCardState(state) {
        if (!state || typeof state !== 'object') return false;
        const workspaceId = state.metadata?.workspaceId || state.bookmarks?.config?.activeWorkspace;
        const categoryName = state.metadata?.categoryName;
        if (!workspaceId || !categoryName) return false;

        if (Array.isArray(state.bookmarks?.links)) {
            const remaining = getLinks().filter((entry) => !(entry.workspace === workspaceId && (entry.category || 'Unsorted') === categoryName));
            const incoming = state.bookmarks.links.map((entry) => ({
                ...stripLegacyPinnedFlag(entry),
                workspace: workspaceId,
                category: categoryName
            }));
            setLinks(remaining.concat(incoming));
        }

        setConfig({ activeWorkspace: workspaceId });
        const targetScopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const nextFolderTrees = { ...existingFolderTrees };
        delete nextFolderTrees[targetScopedKey];
        if (Object.prototype.hasOwnProperty.call(getFolderTreesObject(state.bookmarks?.folders), targetScopedKey)) {
            nextFolderTrees[targetScopedKey] = state.bookmarks.folders[targetScopedKey];
        }
        setBookmarkFolders(nextFolderTrees);
        if (state.bookmarks && Object.prototype.hasOwnProperty.call(state.bookmarks, 'pins')) {
            replaceQuickPinsForCard(workspaceId, categoryName, Array.isArray(state.bookmarks?.pins) ? state.bookmarks.pins : []);
        } else if (Array.isArray(state.bookmarks?.links)) {
            replaceQuickPinsForCard(workspaceId, categoryName, deriveLegacyPinsFromLinks(state.bookmarks.links));
        }

        if (state.library?.categories && typeof state.library.categories === 'object') {
            const selectedCategory = findCategoryLibraryData(state.library.categories, workspaceId, categoryName);
            if (selectedCategory) {
                applyLibraryCategories({ [categoryName]: selectedCategory });
            } else {
                applyLibraryCategories(state.library.categories);
            }
        }

        if (Array.isArray(state.library?.connections)) {
            const existing = cloneConnections();
            const incoming = state.library.connections.map((conn) => ({
                ...conn,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }));
            const incomingLinkIds = new Set(incoming.map((conn) => conn.linkId).filter(Boolean));
            const filtered = existing.filter((conn) => {
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

        applyKnowledgeState(state.knowledge, [categoryName]);

        return true;
    }

    function applyBookmarkState(state) {
        if (!state || typeof state !== 'object') return false;
        const incomingLinks = Array.isArray(state.bookmarks?.links) ? state.bookmarks.links : [];
        if (!incomingLinks.length) return false;

        const incomingLink = stripLegacyPinnedFlag(incomingLinks[0]);
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

        const remaining = getLinks().filter((entry) => String(entry.id) !== normalizedLinkId);
        setLinks(remaining.concat(incomingLink));
        setConfig({ activeWorkspace: workspaceId });
        const targetScopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const incomingFolderTrees = getFolderTreesObject(state.bookmarks?.folders);
        if (Object.prototype.hasOwnProperty.call(incomingFolderTrees, targetScopedKey)) {
            const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
            setBookmarkFolders({
                ...existingFolderTrees,
                [targetScopedKey]: incomingFolderTrees[targetScopedKey]
            });
        }
        if (state.bookmarks && Object.prototype.hasOwnProperty.call(state.bookmarks, 'pins')) {
            replaceQuickPinsForBookmark(normalizedLinkId, Array.isArray(state.bookmarks?.pins) ? state.bookmarks.pins : []);
        } else if (Array.isArray(state.bookmarks?.links)) {
            replaceQuickPinsForBookmark(normalizedLinkId, deriveLegacyPinsFromLinks(state.bookmarks.links));
        }

        if (state.library?.categories && typeof state.library.categories === 'object') {
            applyLibraryCategories(state.library.categories);
        }

        const existing = cloneConnections();
        const incomingConnections = Array.isArray(state.library?.connections)
            ? state.library.connections.map((conn) => ({
                ...conn,
                linkId: normalizedLinkId,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }))
            : [];
        const filtered = existing.filter((conn) => String(conn.linkId) !== normalizedLinkId);
        const next = filtered.concat(incomingConnections);
        if (window.EveLibrary?.ConnectionsAPI?.setAll) {
            window.EveLibrary.ConnectionsAPI.setAll(next);
        } else {
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = next;
        }

        applyKnowledgeState(state.knowledge, [categoryName]);

        return true;
    }

    function applyFolderState(state) {
        if (!state || typeof state !== 'object') return false;

        const workspaceId = String(
            state.metadata?.workspaceId
            || state.bookmarks?.config?.activeWorkspace
            || ''
        ).trim();
        const categoryName = String(state.metadata?.categoryName || '').trim() || 'Unsorted';
        const targetFolderId = String(state.metadata?.folderId || '').trim();
        if (!workspaceId || !categoryName || !targetFolderId) return false;

        const scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const existingTree = existingFolderTrees[scopedKey] || { nodes: [] };
        const incomingTree = getFolderTreesObject(state.bookmarks?.folders)[scopedKey];
        if (!incomingTree) return false;

        const { childrenByParent } = buildFolderMaps(getFolderNodes(existingTree));
        const removedFolderIds = collectFolderSubtreeIds(targetFolderId, childrenByParent);
        const removedLinkIds = new Set(
            getLinks()
                .filter((entry) => (
                    String(entry?.workspace || '') === workspaceId
                    && String(entry?.category || 'Unsorted') === categoryName
                    && removedFolderIds.has(String(entry?.folderId || '').trim())
                ))
                .map((entry) => String(entry?.id || '').trim())
                .filter(Boolean)
        );

        const incomingLinks = Array.isArray(state.bookmarks?.links)
            ? state.bookmarks.links.map((entry) => ({
                ...stripLegacyPinnedFlag(entry),
                workspace: workspaceId,
                category: categoryName
            }))
            : [];
        const incomingLinkIds = new Set(incomingLinks.map((entry) => String(entry?.id || '').trim()).filter(Boolean));

        const remainingLinks = getLinks().filter((entry) => {
            const entryId = String(entry?.id || '').trim();
            if (incomingLinkIds.has(entryId)) return false;
            if (
                String(entry?.workspace || '') === workspaceId
                && String(entry?.category || 'Unsorted') === categoryName
                && removedFolderIds.has(String(entry?.folderId || '').trim())
            ) {
                return false;
            }
            return true;
        });
        setLinks(remainingLinks.concat(incomingLinks));
        setConfig({ activeWorkspace: workspaceId });

        const mergedNodes = mergeFolderSubtree(existingTree, incomingTree, targetFolderId);
        setBookmarkFolders({
            ...existingFolderTrees,
            [scopedKey]: {
                nodes: mergedNodes,
                settings: normalizeFolderTreeSettings(existingTree?.settings)
            }
        });
        if (state.bookmarks && Object.prototype.hasOwnProperty.call(state.bookmarks, 'pins')) {
            replaceQuickPinsForFolder(workspaceId, categoryName, targetFolderId, Array.isArray(state.bookmarks?.pins) ? state.bookmarks.pins : []);
        } else if (Array.isArray(state.bookmarks?.links)) {
            replaceQuickPinsForFolder(workspaceId, categoryName, targetFolderId, deriveLegacyPinsFromLinks(state.bookmarks.links));
        }

        const existingConnections = cloneConnections();
        const incomingConnections = Array.isArray(state.library?.connections)
            ? state.library.connections.map((conn) => ({
                ...conn,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }))
            : [];
        const nextConnections = existingConnections
            .filter((conn) => {
                const linkId = String(conn?.linkId || '').trim();
                return !removedLinkIds.has(linkId) && !incomingLinkIds.has(linkId);
            })
            .concat(incomingConnections);
        if (window.EveLibrary?.ConnectionsAPI?.setAll) {
            window.EveLibrary.ConnectionsAPI.setAll(nextConnections);
        } else {
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = nextConnections;
        }

        const incomingCategory = findCategoryLibraryData(state.library?.categories, workspaceId, categoryName);
        if (incomingCategory) {
            const stateModule = window.EveLibrary?.State;
            const storageModule = window.EveDataStore?.getLibraryStorageModule ? window.EveDataStore.getLibraryStorageModule() : null;
            const existingCategory = stateModule?.getCategoryLibrary
                ? stateModule.getCategoryLibrary(categoryName, workspaceId)
                : { entries: [], dataType: 'graphicNovels', folderView: {} };
            const mergedCategory = {
                ...existingCategory,
                dataType: existingCategory?.dataType || incomingCategory?.dataType || 'graphicNovels',
                entries: mergeLibraryEntries(existingCategory?.entries, incomingCategory?.entries),
                folderView: existingCategory?.folderView || incomingCategory?.folderView || { root: 'all', chain: [], expanded: false }
            };
            if (stateModule?.setCategoryLibrary) {
                stateModule.setCategoryLibrary(categoryName, mergedCategory, workspaceId);
                if (storageModule?.saveLibrary) storageModule.saveLibrary();
            } else {
                applyLibraryCategories({ [scopedKey]: mergedCategory });
            }
        }

        applyKnowledgeState(state.knowledge, [categoryName]);

        return true;
    }

    Object.assign(ns, {
        applyState,
        applyWorkspaceState,
        applyCardState,
        applyFolderState,
        applyBookmarkState
    });

    ns.applyScopedVariantsReady = true;
})();
