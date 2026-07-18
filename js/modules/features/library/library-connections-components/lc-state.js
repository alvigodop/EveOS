window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCore = window.EveLibrary.ConnectionsCore || {
    STORAGE_KEY: 'eveLibraryConnections',
    connections: []
};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;
    let _saveConnectionsTimer = 0;
    let _connectionStateRevision = 0;
    let _loadConnectionsGeneration = 0;
    let _connectionsHydrated = false;
    let _connectionsLoadPromise = null;

    function getCoreStorage() {
        return window.EveCoreStorage || window.EveStorageRuntime?.coreStorage || null;
    }

    function readLegacyConnections() {
        try {
            const stored = localStorage.getItem(Core.STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function persistConnections(nextConnections) {
        const payload = Array.isArray(nextConnections) ? nextConnections.map(item => ({ ...item })) : [];
        const storage = getCoreStorage();
        if (storage && typeof storage.saveJson === 'function') {
            return storage.saveJson(Core.STORAGE_KEY, payload, {
                localFallbackKey: Core.STORAGE_KEY,
                cleanupLocalKeys: [Core.STORAGE_KEY]
            }).catch((error) => {
                console.error('Failed to persist library connections:', error);
                return false;
            });
        }

        try {
            localStorage.setItem(Core.STORAGE_KEY, JSON.stringify(payload));
            return Promise.resolve(true);
        } catch (error) {
            console.error('Failed to persist library connections:', error);
            return Promise.resolve(false);
        }
    }

    function applyConnections(nextConnections) {
        invalidateConnectionIndex();
        Core.connections = Array.isArray(nextConnections) ? nextConnections : [];
        Core.repairScopedLibraryEntries?.();
        window.EveLibrary.Connections = Core.connections.map(item => ({ ...item }));
        return Core.connections;
    }

    // Lazy Map<linkId, connection> index — O(1) lookups instead of O(n) scans
    let _connectionsByLinkId = null;
    let _connectionsByLibraryEntryId = null;

    function invalidateConnectionIndex() {
        _connectionsByLinkId = null;
        _connectionsByLibraryEntryId = null;
    }

    function getConnectionIndex() {
        if (_connectionsByLinkId) return _connectionsByLinkId;
        _connectionsByLinkId = new Map();
        for (let i = 0; i < Core.connections.length; i++) {
            const conn = Core.connections[i];
            if (conn && conn.linkId != null) {
                _connectionsByLinkId.set(String(conn.linkId), conn);
            }
        }
        return _connectionsByLinkId;
    }

    function getLibraryEntryConnectionIndex() {
        if (_connectionsByLibraryEntryId) return _connectionsByLibraryEntryId;
        _connectionsByLibraryEntryId = new Map();
        for (let i = 0; i < Core.connections.length; i++) {
            const conn = Core.connections[i];
            if (conn && conn.libraryEntryId != null) {
                _connectionsByLibraryEntryId.set(String(conn.libraryEntryId), conn);
            }
        }
        return _connectionsByLibraryEntryId;
    }

    function getLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function saveLinks(options = {}) {
        if (typeof saveData === 'function') {
            saveData({
                skipSuggestions: !!options.skipSuggestions,
                source: String(options.source || 'library-linked-bookmark-updated').trim() || 'library-linked-bookmark-updated',
                meta: options.meta && typeof options.meta === 'object' ? options.meta : null
            });
        }
    }

    function flushConnectionsSave() {
        invalidateConnectionIndex();
        window.EveLibrary.Connections = Core.connections.map(item => ({ ...item }));
        const persisted = persistConnections(window.EveLibrary.Connections);
        window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'library-connections-save' } }));
        return persisted;
    }

    function saveConnections(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        _connectionStateRevision += 1;
        if (_saveConnectionsTimer) {
            clearTimeout(_saveConnectionsTimer);
            _saveConnectionsTimer = 0;
        }
        if (opts.immediate) {
            return flushConnectionsSave();
        }
        _saveConnectionsTimer = setTimeout(function () {
            _saveConnectionsTimer = 0;
            flushConnectionsSave();
        }, 60);
        return true;
    }

    function emitLinkedEntryUpdated(linkId, categoryName, entry, workspaceId) {
        const safeEntry = entry ? JSON.parse(JSON.stringify(entry)) : null;
        window.dispatchEvent(new CustomEvent('eve:library-link-updated', {
            detail: {
                linkId: String(linkId),
                categoryName,
                workspaceId: String(workspaceId || Core.findConnectionByLinkId?.(linkId)?.workspace || ''),
                entry: safeEntry
            }
        }));
    }

    function loadConnections(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        if (opts.initialOnly && (_connectionsHydrated || _connectionStateRevision > 0)) {
            return Promise.resolve(getAll());
        }
        if (!opts.force && _connectionsLoadPromise) return _connectionsLoadPromise;

        const loadGeneration = ++_loadConnectionsGeneration;
        const revisionAtStart = _connectionStateRevision;
        const legacyConnections = readLegacyConnections();
        applyConnections(legacyConnections);

        const storage = getCoreStorage();
        if (storage && typeof storage.loadJson === 'function') {
            const loadPromise = storage.loadJson(Core.STORAGE_KEY, legacyConnections, { legacyKeys: [Core.STORAGE_KEY] })
                .then((persistedConnections) => {
                    if (loadGeneration !== _loadConnectionsGeneration
                        || revisionAtStart !== _connectionStateRevision) {
                        return getAll();
                    }
                    applyConnections(Array.isArray(persistedConnections) ? persistedConnections : []);
                    return getAll();
                })
                .catch((error) => {
                    console.error('Failed to hydrate library connections:', error);
                    return getAll();
                })
                .finally(() => {
                    _connectionsHydrated = true;
                    if (_connectionsLoadPromise === loadPromise) {
                        _connectionsLoadPromise = null;
                    }
                });
            _connectionsLoadPromise = loadPromise;
            return loadPromise;
        }
        _connectionsHydrated = true;
        return Promise.resolve(getAll());
    }

    function setAll(nextConnections, options = {}) {
        applyConnections(Array.isArray(nextConnections) ? nextConnections.map(item => ({ ...item })) : []);
        return saveConnections(options);
    }

    function getAll() {
        return Core.connections.map(item => ({ ...item }));
    }

    function deepClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    function generateId() {
        return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function findConnectionByLinkId(linkId) {
        return getConnectionIndex().get(String(linkId)) || null;
    }

    function findConnectionByLibraryEntryId(libraryEntryId) {
        return getLibraryEntryConnectionIndex().get(String(libraryEntryId)) || null;
    }

    function findLinkById(linkId) {
        const normalizedId = String(linkId || '').trim();
        if (!normalizedId) return null;
        const liveLink = getLinks().find(item => String(item?.id) === normalizedId) || null;
        if (liveLink) return liveLink;

        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            return indexApi.resolveBookmarkLink(normalizedId) || null;
        }

        return null;
    }

    function normalizeWorkspaceId(value) {
        return String(value || '').trim() || String(getConfig().activeWorkspace || 'main');
    }

    function normalizeCategoryName(value) {
        const normalized = String(value || '').trim();
        return normalized || 'Unsorted';
    }

    Object.assign(Core, {
        getLinks,
        getConfig,
        saveLinks,
        saveConnections,
        emitLinkedEntryUpdated,
        loadConnections,
        setAll,
        getAll,
        deepClone,
        generateId,
        findConnectionByLinkId,
        findConnectionByLibraryEntryId,
        findLinkById,
        normalizeWorkspaceId,
        normalizeCategoryName,
        invalidateConnectionIndex
    });
})();
