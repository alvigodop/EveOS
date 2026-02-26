/**
 * Unified State Store
 * Captures the current bookmark + library data into a single JSON object and
 * rehydrates the UI from the same structure. This is the canonical schema that
 * drives exports/imports going forward.
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
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

    function getWorkspaceName(workspaceId) {
        const ws = (getConfig().workspaces || []).find(w => w.id === workspaceId);
        return ws ? ws.name : workspaceId;
    }

    function setLinks(newLinks) {
        const sanitized = newLinks.map(entry => ({ ...entry }));
        if (typeof links !== 'undefined') {
            links = sanitized;
        } else {
            window.links = sanitized;
        }
        if (typeof saveData === 'function') saveData();
    }

    function setConfig(newConfig) {
        const baseConfig = getConfig();
        const merged = { ...baseConfig, ...newConfig };
        if (typeof config !== 'undefined') {
            config = merged;
        } else {
            window.config = merged;
        }
        if (typeof saveConfig === 'function') saveConfig();
    }

    function applyLibraryCategories(categories) {
        if (!categories || typeof categories !== 'object') return;
        const stateModule = getLibraryStateModule();
        if (!stateModule) return;
        Object.entries(categories).forEach(([categoryName, data]) => {
            if (typeof data === 'object') {
                stateModule.setCategoryLibrary(categoryName, data);
            }
        });
        const storageModule = getLibraryStorageModule();
        if (storageModule?.saveLibrary) storageModule.saveLibrary();
    }

    function applyConnections(workspaceId, connections) {
        if (!Array.isArray(connections)) return;
        const existing = cloneConnections();
        const linkIds = new Set(connections.map(conn => conn.linkId).filter(Boolean));
        const filtered = existing.filter(conn => conn.workspace !== workspaceId && !linkIds.has(conn.linkId));
        const annotated = connections.map(conn => ({ ...conn, workspace: workspaceId }));
        const next = filtered.concat(annotated);
        if (window.EveLibrary?.ConnectionsAPI?.setAll) {
            window.EveLibrary.ConnectionsAPI.setAll(next);
        } else {
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = next;
        }
    }

    function applyState(state) {
        if (!state || typeof state !== 'object') return false;

        if (state.bookmarks) {
            if (Array.isArray(state.bookmarks.links)) {
                setLinks(state.bookmarks.links);
            }
            if (state.bookmarks.config && typeof state.bookmarks.config === 'object') {
                setConfig(state.bookmarks.config);
            }
        }

        if (state.library) {
            applyLibraryCategories(state.library.categories);
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
            setLinks(remaining.concat(state.bookmarks.links.map(entry => ({ ...entry, workspace: workspaceId }))));
        }

        if (state.bookmarks?.config) {
            // Tab restore should only change active tab context, not overwrite all app settings.
            setConfig({ activeWorkspace: workspaceId });
        }

        if (state.library) {
            applyLibraryCategories(state.library.categories);
            applyConnections(workspaceId, state.library.connections || []);
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
            setLinks(remaining.concat(incoming));
        }

        setConfig({ activeWorkspace: workspaceId });

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

    window.EveDataStore.Store = {
        captureState,
        captureWorkspace,
        captureCard,
        applyState,
        applyWorkspaceState,
        applyCardState
    };
})();
