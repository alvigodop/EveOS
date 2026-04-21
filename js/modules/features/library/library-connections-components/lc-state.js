window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCore = window.EveLibrary.ConnectionsCore || {
    STORAGE_KEY: 'eveLibraryConnections',
    connections: []
};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;

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

    function invalidateConnectionIndex() {
        _connectionsByLinkId = null;
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

    function getLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined') return links;
        return [];
    }

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function saveLinks() {
        if (typeof saveData === 'function') saveData();
    }

    function saveConnections() {
        invalidateConnectionIndex();
        window.EveLibrary.Connections = Core.connections.map(item => ({ ...item }));
        void persistConnections(window.EveLibrary.Connections);
        window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'library-connections-save' } }));
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

    function loadConnections() {
        const legacyConnections = readLegacyConnections();
        applyConnections(legacyConnections);

        const storage = getCoreStorage();
        if (storage && typeof storage.loadJson === 'function') {
            void storage.loadJson(Core.STORAGE_KEY, legacyConnections, { legacyKeys: [Core.STORAGE_KEY] })
                .then((persistedConnections) => {
                    applyConnections(Array.isArray(persistedConnections) ? persistedConnections : []);
                })
                .catch((error) => {
                    console.error('Failed to hydrate library connections:', error);
                });
        }
    }

    function setAll(nextConnections) {
        applyConnections(Array.isArray(nextConnections) ? nextConnections.map(item => ({ ...item })) : []);
        saveConnections();
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

    function findLinkById(linkId) {
        return getLinks().find(item => String(item.id) === String(linkId)) || null;
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
        findLinkById,
        normalizeWorkspaceId,
        normalizeCategoryName,
        invalidateConnectionIndex
    });
})();
