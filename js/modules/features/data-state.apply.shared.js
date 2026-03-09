/**
 * Unified State Store Apply Shared Helpers
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applySharedReady) return;
    if (!ns.captureReady) {
        console.warn('[EveDataStore] Capture helpers missing; apply shared helpers not initialized.');
        return;
    }

    const getLibraryStateModule = ns.getLibraryStateModule;
    const getLibraryStorageModule = ns.getLibraryStorageModule;
    const getConfig = ns.getConfig;
    const getBookmarkFolders = ns.getBookmarkFolders;
    const cloneQuickPins = ns.cloneQuickPins;
    const cloneConnections = ns.cloneConnections;

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

    function setBookmarkFolders(newBookmarkFolders) {
        const sanitized = (newBookmarkFolders && typeof newBookmarkFolders === 'object')
            ? JSON.parse(JSON.stringify(newBookmarkFolders))
            : {};
        if (typeof bookmarkFolders !== 'undefined') {
            bookmarkFolders = sanitized;
        } else {
            window.bookmarkFolders = sanitized;
        }
        if (typeof saveData === 'function') saveData();
    }

    function setQuickPins(newQuickPins) {
        const sanitized = Array.isArray(newQuickPins)
            ? JSON.parse(JSON.stringify(newQuickPins))
            : [];
        if (window.EveQuickPins?.writeStore) {
            window.EveQuickPins.writeStore(sanitized, { persist: false });
        } else if (typeof quickPins !== 'undefined') {
            quickPins = sanitized;
        } else {
            window.quickPins = sanitized;
        }
        if (typeof saveData === 'function') saveData();
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

    Object.assign(ns, {
        setLinks,
        setConfig,
        setBookmarkFolders,
        setQuickPins,
        applyLibraryCategories,
        applyConnections,
        getBookmarkFolders,
        cloneQuickPins
    });

    ns.applySharedReady = true;
})();
