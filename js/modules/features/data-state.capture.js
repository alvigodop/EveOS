/**
 * Unified State Store Capture Helpers
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.captureReady) return;
    const VERSION = 1;

    function getLibraryStateModule() {
        return window.EveLibrary?.State;
    }

    function getLibraryStorageModule() {
        return window.EveLibrary?.Storage;
    }

    function getLinks() {
        return window.eveState?.links || window.links || [];
    }

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return window.config || {};
    }

    function cloneLinks() {
        return getLinks().map(entry => ({ ...entry }));
    }

    function cloneConfig() {
        const current = getConfig();
        return { ...current };
    }

    function cloneLibraries() {
        const stateModule = getLibraryStateModule();
        if (!stateModule) return {};
        try {
            return JSON.parse(JSON.stringify(stateModule.getAllLibraries()));
        } catch {
            return {};
        }
    }

    function cloneConnections() {
        const apiConnections = window.EveLibrary?.ConnectionsAPI?.getAll?.();
        const connections = Array.isArray(apiConnections) ? apiConnections : (window.EveLibrary?.Connections || []);
        return connections.map(entry => ({ ...entry }));
    }

    function captureState() {
        return {
            metadata: {
                version: VERSION,
                date: new Date().toISOString(),
                generator: 'EveOS Unified Backup'
            },
            bookmarks: {
                links: cloneLinks(),
                config: cloneConfig()
            },
            library: {
                categories: cloneLibraries(),
                connections: cloneConnections()
            }
        };
    }

    function filterLinksForWorkspace(workspaceId) {
        if (!workspaceId) return [];
        return getLinks().filter(entry => entry.workspace === workspaceId);
    }

    function filterLinksForCard(workspaceId, categoryName) {
        if (!workspaceId || !categoryName) return [];
        return getLinks().filter(entry => entry.workspace === workspaceId && (entry.category || 'Unsorted') === categoryName);
    }

    function filterConnectionsForWorkspace(workspaceId, workspaceLinks) {
        const currentConnections = cloneConnections();
        const linkIds = new Set(workspaceLinks.map(entry => entry.id));
        return currentConnections.filter(conn => conn.workspace === workspaceId || linkIds.has(conn.linkId));
    }

    function getConnectionCategoryName(conn) {
        return conn?.categoryName || conn?.category || conn?.libraryCategory || null;
    }

    function getConnectionEntryId(conn) {
        return conn?.libraryEntryId || conn?.entryId || null;
    }

    function parseLibraryKey(key) {
        const stateModule = getLibraryStateModule();
        if (stateModule?.parseScopedCategoryKey) {
            return stateModule.parseScopedCategoryKey(key);
        }
        return {
            key,
            categoryName: key,
            workspaceId: '',
            scoped: false
        };
    }

    function filterCategoriesForConnections(categories, workspaceConnections) {
        if (!categories || typeof categories !== 'object') return {};
        if (!Array.isArray(workspaceConnections) || workspaceConnections.length === 0) return {};

        const entryIds = new Set();
        const normalizedConnections = workspaceConnections.map(conn => ({
            categoryName: getConnectionCategoryName(conn),
            workspaceId: conn?.workspace ? String(conn.workspace) : '',
            entryId: getConnectionEntryId(conn)
        }));
        normalizedConnections.forEach(conn => {
            if (conn.entryId) entryIds.add(conn.entryId);
        });

        const filtered = {};
        Object.entries(categories).forEach(([libraryKey, categoryData]) => {
            if (!categoryData || typeof categoryData !== 'object') return;
            const entries = Array.isArray(categoryData.entries) ? categoryData.entries : [];
            const parsedKey = parseLibraryKey(libraryKey);

            const hasMatchingConnection = normalizedConnections.some(conn => {
                if (!conn.categoryName) return false;
                if (String(conn.categoryName) !== String(parsedKey.categoryName)) return false;
                if (!parsedKey.workspaceId || !conn.workspaceId) return true;
                return String(conn.workspaceId) === String(parsedKey.workspaceId);
            });

            if (hasMatchingConnection) {
                filtered[libraryKey] = {
                    ...categoryData,
                    entries: entries.filter(entry => entryIds.size === 0 || entryIds.has(entry.id))
                };
                return;
            }

            if (entryIds.size > 0) {
                const matched = entries.filter(entry => entryIds.has(entry.id));
                if (matched.length > 0) {
                    filtered[libraryKey] = { ...categoryData, entries: matched };
                }
            }
        });

        return filtered;
    }

    function getWorkspaceName(workspaceId) {
        const ws = (getConfig().workspaces || []).find(w => w.id === workspaceId);
        return ws ? ws.name : workspaceId;
    }

    function captureWorkspace(workspaceId) {
        const state = captureState();
        const workspaceLinks = filterLinksForWorkspace(workspaceId);
        const workspaceConnections = filterConnectionsForWorkspace(workspaceId, workspaceLinks);
        state.metadata.workspaceId = workspaceId;
        state.metadata.workspaceName = getWorkspaceName(workspaceId);
        state.metadata.type = 'workspace';
        state.bookmarks.links = workspaceLinks;
        state.bookmarks.config = {
            ...state.bookmarks.config,
            activeWorkspace: workspaceId
        };
        state.library.connections = workspaceConnections;
        state.library.categories = filterCategoriesForConnections(state.library.categories, workspaceConnections);
        return state;
    }

    function captureCard(workspaceId, categoryName) {
        const state = captureWorkspace(workspaceId);
        const cardLinks = filterLinksForCard(workspaceId, categoryName);
        const linkIds = new Set(cardLinks.map(entry => entry.id));
        const cardConnections = (state.library.connections || []).filter(conn => {
            const connCategory = getConnectionCategoryName(conn);
            return connCategory === categoryName || linkIds.has(conn.linkId);
        });

        state.metadata.workspaceId = workspaceId;
        state.metadata.workspaceName = getWorkspaceName(workspaceId);
        state.metadata.categoryName = categoryName;
        state.metadata.type = 'card';
        state.bookmarks.links = cardLinks;
        state.bookmarks.config = {
            ...state.bookmarks.config,
            activeWorkspace: workspaceId
        };
        state.library.connections = cardConnections;
        state.library.categories = filterCategoriesForConnections(state.library.categories, cardConnections);
        return state;
    }

    function captureBookmark(workspaceId, categoryName, linkId) {
        const normalizedWorkspace = String(workspaceId || '').trim();
        const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        const normalizedLinkId = String(linkId || '').trim();
        if (!normalizedWorkspace || !normalizedLinkId) return null;

        const state = captureWorkspace(normalizedWorkspace);
        const selectedLink = (state.bookmarks.links || []).find(entry => String(entry.id) === normalizedLinkId);
        if (!selectedLink) return null;

        const bookmarkCategory = String(selectedLink.category || normalizedCategory || 'Unsorted');
        const bookmarkConnections = (state.library.connections || []).filter(conn => String(conn.linkId) === normalizedLinkId);

        state.metadata.workspaceId = normalizedWorkspace;
        state.metadata.workspaceName = getWorkspaceName(normalizedWorkspace);
        state.metadata.categoryName = bookmarkCategory;
        state.metadata.bookmarkId = normalizedLinkId;
        state.metadata.type = 'bookmark';
        state.bookmarks.links = [{ ...selectedLink, workspace: normalizedWorkspace, category: bookmarkCategory }];
        state.bookmarks.config = {
            ...state.bookmarks.config,
            activeWorkspace: normalizedWorkspace
        };
        state.library.connections = bookmarkConnections;
        state.library.categories = filterCategoriesForConnections(state.library.categories, bookmarkConnections);
        return state;
    }

    function findCategoryLibraryData(categories, workspaceId, categoryName) {
        if (!categories || typeof categories !== 'object') return null;
        if (Object.prototype.hasOwnProperty.call(categories, categoryName)) {
            return categories[categoryName];
        }

        const normalizedWorkspace = String(workspaceId || '');
        for (const [libraryKey, data] of Object.entries(categories)) {
            const parsed = parseLibraryKey(libraryKey);
            if (String(parsed.categoryName) !== String(categoryName)) continue;
            if (!normalizedWorkspace || !parsed.workspaceId || String(parsed.workspaceId) === normalizedWorkspace) {
                return data;
            }
        }
        return null;
    }

    Object.assign(ns, {
        getLibraryStateModule,
        getLibraryStorageModule,
        getLinks,
        getConfig,
        cloneConnections,
        getConnectionCategoryName,
        captureState,
        captureWorkspace,
        captureCard,
        captureBookmark,
        getWorkspaceName,
        findCategoryLibraryData
    });
    ns.captureReady = true;
})();
