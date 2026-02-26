/**
 * Library Connections Module
 * Maintains optional bookmark -> library entry links.
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const STORAGE_KEY = 'eveLibraryConnections';
    let connections = [];

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
        window.EveLibrary.Connections = connections.map(item => ({ ...item }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(window.EveLibrary.Connections));
    }

    function loadConnections() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            connections = [];
            window.EveLibrary.Connections = [];
            return;
        }
        try {
            const parsed = JSON.parse(stored);
            connections = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            connections = [];
        }
        window.EveLibrary.Connections = connections.map(item => ({ ...item }));
    }

    function setAll(nextConnections) {
        connections = Array.isArray(nextConnections) ? nextConnections.map(item => ({ ...item })) : [];
        saveConnections();
    }

    function getAll() {
        return connections.map(item => ({ ...item }));
    }

    function generateId() {
        return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function findConnectionByLinkId(linkId) {
        return connections.find(item => item.linkId === linkId) || null;
    }

    function findLinkById(linkId) {
        return getLinks().find(item => item.id === linkId) || null;
    }

    function findEntry(categoryName, entryId) {
        const state = window.EveLibrary.State;
        if (!state) return null;
        const lib = state.getCategoryLibrary(categoryName);
        return (lib.entries || []).find(entry => entry.id === entryId) || null;
    }

    function findEntryByConnection(conn) {
        if (!conn) return null;
        let entry = findEntry(conn.categoryName, conn.libraryEntryId);
        if (entry) return { entry, categoryName: conn.categoryName };
        const state = window.EveLibrary.State;
        if (!state) return null;
        const libs = state.getAllLibraries();
        for (const [categoryName, lib] of Object.entries(libs)) {
            const matched = (lib.entries || []).find(item => item.id === conn.libraryEntryId);
            if (matched) return { entry: matched, categoryName };
        }
        return null;
    }

    function getDefaultStatus(categoryName) {
        const state = window.EveLibrary.State;
        if (!state) return '';
        const dataType = state.getCategoryDataType(categoryName);
        const type = state.getDataType(dataType);
        return type?.statuses?.[0] || '';
    }

    function promoteLink(linkId) {
        const link = findLinkById(linkId);
        if (!link) {
            showToast?.("Link not found", "error");
            return null;
        }

        const existing = findConnectionByLinkId(linkId);
        if (existing) {
            showToast?.("This bookmark is already linked to library", "info");
            return existing;
        }

        const categoryName = link.category || 'Unsorted';
        const state = window.EveLibrary.State;
        const storage = window.EveLibrary.Storage;
        if (!state || !storage) return null;

        const lib = state.getCategoryLibrary(categoryName);
        const newEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: link.title || 'Untitled',
            mediaTypes: ['graphicNovels'],
            author: '',
            genre: '',
            status: getDefaultStatus(categoryName),
            chapter: 0,
            season: 0,
            episode: 0,
            summary: link.url ? `Source: ${link.url}` : '',
            rating: '',
            language: '',
            tags: [],
            dateAdded: new Date().toISOString(),
            favorite: false,
            image: ''
        };

        lib.entries.push(newEntry);
        storage.saveLibrary();

        const connection = {
            id: generateId(),
            linkId: link.id,
            libraryEntryId: newEntry.id,
            categoryName,
            workspace: link.workspace || getConfig().activeWorkspace || 'main',
            createdAt: new Date().toISOString()
        };

        connections.push(connection);
        saveConnections();
        showToast?.("Bookmark added to library", "success");
        return connection;
    }

    function unlinkLink(linkId, removeEntry) {
        const conn = findConnectionByLinkId(linkId);
        if (!conn) return false;

        if (removeEntry) {
            const found = findEntryByConnection(conn);
            if (found?.entry) {
                const state = window.EveLibrary.State;
                const lib = state.getCategoryLibrary(found.categoryName);
                lib.entries = (lib.entries || []).filter(item => item.id !== found.entry.id);
                window.EveLibrary.Storage?.saveLibrary?.();
            }
        }

        connections = connections.filter(item => item.linkId !== linkId);
        saveConnections();
        return true;
    }

    function removeByLinkId(linkId) {
        const before = connections.length;
        connections = connections.filter(item => item.linkId !== linkId);
        if (connections.length !== before) {
            saveConnections();
        }
    }

    function removeByLibraryEntry(categoryName, entryId) {
        const before = connections.length;
        connections = connections.filter(item => !(item.categoryName === categoryName && item.libraryEntryId === entryId));
        if (connections.length !== before) {
            saveConnections();
        }
    }

    function syncFromLibraryEntry(categoryName, entry) {
        if (!entry) return;
        const linked = connections.filter(item => item.categoryName === categoryName && item.libraryEntryId === entry.id);
        if (linked.length === 0) return;

        const allLinks = getLinks();
        let changed = false;
        linked.forEach(conn => {
            const l = allLinks.find(item => item.id === conn.linkId);
            if (!l) return;
            if (l.title !== entry.title) {
                l.title = entry.title;
                changed = true;
            }
        });
        if (changed) {
            saveLinks();
        }
    }

    function syncFromLink(linkId) {
        const conn = findConnectionByLinkId(linkId);
        if (!conn) return;
        const link = findLinkById(linkId);
        if (!link) return;
        const found = findEntryByConnection(conn);
        if (!found?.entry) return;
        const entry = found.entry;
        entry.title = link.title || entry.title;
        if (link.url && (!entry.summary || entry.summary.startsWith('Source: '))) {
            entry.summary = `Source: ${link.url}`;
        }
        window.EveLibrary.Storage?.saveLibrary?.();
    }

    function getLinkedEntry(linkId) {
        const conn = findConnectionByLinkId(linkId);
        if (!conn) return null;
        const found = findEntryByConnection(conn);
        if (!found?.entry) return null;
        return {
            connection: { ...conn, categoryName: found.categoryName },
            entry: JSON.parse(JSON.stringify(found.entry))
        };
    }

    function updateLinkedEntry(linkId, patch) {
        const conn = findConnectionByLinkId(linkId);
        if (!conn || !patch || typeof patch !== 'object') return false;
        const found = findEntryByConnection(conn);
        if (!found?.entry) return false;
        Object.assign(found.entry, patch);
        window.EveLibrary.Storage?.saveLibrary?.();
        syncFromLibraryEntry(found.categoryName, found.entry);
        return true;
    }

    function moveLinkedEntryToCategory(linkId, nextCategoryName) {
        const conn = findConnectionByLinkId(linkId);
        const categoryName = (nextCategoryName || '').trim();
        if (!conn || !categoryName) return false;
        if (conn.categoryName === categoryName) return true;

        const found = findEntryByConnection(conn);
        if (!found?.entry) return false;

        const state = window.EveLibrary.State;
        if (!state) return false;
        const source = state.getCategoryLibrary(found.categoryName);
        source.entries = (source.entries || []).filter(item => item.id !== found.entry.id);

        const target = state.getCategoryLibrary(categoryName);
        target.entries.push(found.entry);

        conn.categoryName = categoryName;
        saveConnections();
        window.EveLibrary.Storage?.saveLibrary?.();
        return true;
    }

    window.EveLibrary.ConnectionsAPI = {
        loadConnections,
        setAll,
        getAll,
        findConnectionByLinkId,
        promoteLink,
        unlinkLink,
        removeByLinkId,
        removeByLibraryEntry,
        syncFromLibraryEntry,
        syncFromLink,
        getLinkedEntry,
        updateLinkedEntry,
        moveLinkedEntryToCategory
    };
})();
