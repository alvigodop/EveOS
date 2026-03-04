window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCore = window.EveLibrary.ConnectionsCore || {
    STORAGE_KEY: 'eveLibraryConnections',
    connections: []
};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;

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
        window.EveLibrary.Connections = Core.connections.map(item => ({ ...item }));
        localStorage.setItem(Core.STORAGE_KEY, JSON.stringify(window.EveLibrary.Connections));
        window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'library-connections-save' } }));
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
        const stored = localStorage.getItem(Core.STORAGE_KEY);
        if (!stored) {
            Core.connections = [];
            window.EveLibrary.Connections = [];
            return;
        }
        try {
            const parsed = JSON.parse(stored);
            Core.connections = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            Core.connections = [];
        }
        Core.repairScopedLibraryEntries?.();
        window.EveLibrary.Connections = Core.connections.map(item => ({ ...item }));
    }

    function setAll(nextConnections) {
        Core.connections = Array.isArray(nextConnections) ? nextConnections.map(item => ({ ...item })) : [];
        Core.repairScopedLibraryEntries?.();
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
        return Core.connections.find(item => String(item.linkId) === String(linkId)) || null;
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
        normalizeCategoryName
    });
})();
