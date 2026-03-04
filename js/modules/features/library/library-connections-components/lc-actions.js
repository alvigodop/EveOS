window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCore = window.EveLibrary.ConnectionsCore || {};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;

    if (!Core.findEntryByConnection || !Core.saveConnections || !Core.getDefaultStatus) {
        console.warn('[EveLibrary.ConnectionsCore] lc-state.js and lc-entry-lookup.js must load before lc-actions.js.');
        return;
    }

    function getRatings() {
        return window.EveLibrary?.Ratings;
    }

    function promoteLink(linkId) {
        const link = Core.findLinkById(linkId);
        if (!link) {
            showToast?.("Link not found", "error");
            return null;
        }

        const existing = Core.findConnectionByLinkId(linkId);
        if (existing) {
            showToast?.("This bookmark is already linked to library", "info");
            return existing;
        }

        const categoryName = link.category || 'Unsorted';
        const workspaceId = Core.normalizeWorkspaceId(link.workspace);
        const state = window.EveLibrary.State;
        const storage = window.EveLibrary.Storage;
        if (!state || !storage) return null;

        const lib = state.getCategoryLibrary(categoryName, workspaceId);
        const Ratings = getRatings();
        const newEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: link.title || 'Untitled',
            mediaTypes: ['graphicNovels'],
            author: '',
            authorAltNames: [],
            artist: '',
            genre: '',
            status: Core.getDefaultStatus(categoryName, workspaceId),
            chapter: 0,
            season: 0,
            episode: 0,
            sourceUrl: link.url || '',
            summary: '',
            rating: '',
            apiRatings: {
                anilist: null,
                myanimelist: null,
                mangadex: null
            },
            sourceStatus: '',
            sourceSignals: Ratings?.createEmptySourceSignals
                ? Ratings.createEmptySourceSignals()
                : null,
            derivedRatings: null,
            language: '',
            tags: [],
            dateAdded: new Date().toISOString(),
            lastEdited: new Date().toISOString(),
            favorite: false,
            image: ''
        };
        if (Ratings?.applyDerivedRatings) {
            Ratings.applyDerivedRatings(newEntry);
        }

        lib.entries.push(newEntry);
        storage.saveLibrary();

        const connection = {
            id: Core.generateId(),
            linkId: String(link.id),
            libraryEntryId: newEntry.id,
            categoryName,
            workspace: workspaceId,
            createdAt: new Date().toISOString()
        };

        Core.connections.push(connection);
        Core.saveConnections();
        showToast?.("Bookmark added to library", "success");
        return connection;
    }

    function unlinkLink(linkId, removeEntry) {
        const conn = Core.findConnectionByLinkId(linkId);
        if (!conn) return false;

        if (removeEntry) {
            const found = Core.findEntryByConnection(conn);
            if (found?.entry) {
                const state = window.EveLibrary.State;
                const lib = state.getCategoryLibrary(found.categoryName, found.workspaceId || conn.workspace);
                lib.entries = (lib.entries || []).filter(item => item.id !== found.entry.id);
                window.EveLibrary.Storage?.saveLibrary?.();
            }
        }

        Core.connections = Core.connections.filter(item => String(item.linkId) !== String(linkId));
        Core.saveConnections();
        return true;
    }

    function removeByLinkId(linkId) {
        const before = Core.connections.length;
        Core.connections = Core.connections.filter(item => String(item.linkId) !== String(linkId));
        if (Core.connections.length !== before) {
            Core.saveConnections();
        }
    }

    function removeByLibraryEntry(categoryName, entryId, workspaceId) {
        const before = Core.connections.length;
        const normalizedCategory = Core.normalizeCategoryName(categoryName);
        const normalizedEntryId = String(entryId);
        const normalizedWorkspace = String(workspaceId || '').trim();
        Core.connections = Core.connections.filter(item => {
            if (Core.normalizeCategoryName(item.categoryName) !== normalizedCategory) return true;
            if (String(item.libraryEntryId) !== normalizedEntryId) return true;
            if (!normalizedWorkspace) return false;
            return Core.normalizeWorkspaceId(item.workspace) !== Core.normalizeWorkspaceId(normalizedWorkspace);
        });
        if (Core.connections.length !== before) {
            Core.saveConnections();
        }
    }

    function syncFromLibraryEntry(categoryName, entry, workspaceId) {
        if (!entry) return;
        const normalizedCategory = Core.normalizeCategoryName(categoryName);
        const normalizedEntryId = String(entry.id);
        const normalizedWorkspace = String(workspaceId || '').trim();
        const linked = Core.connections.filter(item => {
            if (Core.normalizeCategoryName(item.categoryName) !== normalizedCategory) return false;
            if (String(item.libraryEntryId) !== normalizedEntryId) return false;
            if (!normalizedWorkspace) return true;
            return Core.normalizeWorkspaceId(item.workspace) === Core.normalizeWorkspaceId(normalizedWorkspace);
        });
        if (linked.length === 0) return;

        const allLinks = Core.getLinks();
        let changed = false;
        linked.forEach(conn => {
            const l = allLinks.find(item => String(item.id) === String(conn.linkId));
            if (!l) return;
            if (l.title !== entry.title) {
                l.title = entry.title;
                changed = true;
            }
            const sourceUrl = (entry.sourceUrl || '').trim();
            if (sourceUrl && l.url !== sourceUrl) {
                l.url = sourceUrl;
                changed = true;
            }
        });
        if (changed) {
            Core.saveLinks();
        }
        linked.forEach(conn => Core.emitLinkedEntryUpdated(conn.linkId, normalizedCategory, entry, conn.workspace));
    }

    function syncFromLink(linkId) {
        let conn = Core.findConnectionByLinkId(linkId);
        if (!conn) return;
        const link = Core.findLinkById(linkId);
        if (!link) return;

        const currentWorkspace = Core.normalizeWorkspaceId(conn.workspace);
        const currentCategory = Core.normalizeCategoryName(conn.categoryName);
        const nextWorkspace = Core.normalizeWorkspaceId(link.workspace || Core.getConfig().activeWorkspace || currentWorkspace);
        const nextCategory = Core.normalizeCategoryName(link.category || currentCategory);
        if (nextCategory !== currentCategory || nextWorkspace !== currentWorkspace) {
            moveLinkedEntryToScope(linkId, nextCategory, nextWorkspace);
            conn = Core.findConnectionByLinkId(linkId);
            if (!conn) return;
        }

        const found = Core.findEntryByConnection(conn);
        if (!found?.entry) return;
        const entry = found.entry;
        entry.title = link.title || entry.title;
        if (link.url) entry.sourceUrl = link.url;
        entry.lastEdited = new Date().toISOString();
        window.EveLibrary.Storage?.saveLibrary?.();
        Core.emitLinkedEntryUpdated(linkId, found.categoryName, entry, conn.workspace);
    }

    function getLinkedEntry(linkId) {
        const conn = Core.findConnectionByLinkId(linkId);
        if (!conn) return null;
        const found = Core.findEntryByConnection(conn);
        if (!found?.entry) return null;
        return {
            connection: { ...conn, categoryName: found.categoryName },
            entry: JSON.parse(JSON.stringify(found.entry))
        };
    }

    function updateLinkedEntry(linkId, patch) {
        const conn = Core.findConnectionByLinkId(linkId);
        if (!conn || !patch || typeof patch !== 'object') return false;
        const found = Core.findEntryByConnection(conn);
        if (!found?.entry) return false;
        Object.assign(found.entry, patch);
        const Ratings = getRatings();
        if (Ratings?.applyDerivedRatings) {
            Ratings.applyDerivedRatings(found.entry);
        }
        found.entry.lastEdited = new Date().toISOString();
        window.EveLibrary.Storage?.saveLibrary?.();
        syncFromLibraryEntry(found.categoryName, found.entry, conn.workspace);
        return true;
    }

    function moveLinkedEntryToScope(linkId, nextCategoryName, nextWorkspaceId) {
        const conn = Core.findConnectionByLinkId(linkId);
        if (!conn) return false;
        const categoryName = Core.normalizeCategoryName(nextCategoryName);
        const workspaceId = Core.normalizeWorkspaceId(nextWorkspaceId || conn.workspace);
        const currentCategory = Core.normalizeCategoryName(conn.categoryName);
        const currentWorkspace = Core.normalizeWorkspaceId(conn.workspace);
        if (currentCategory === categoryName && currentWorkspace === workspaceId) return true;

        const state = window.EveLibrary.State;
        if (!state) return false;

        const source = state.getCategoryLibrary(currentCategory, currentWorkspace);
        let entry = (source.entries || []).find(item => String(item?.id) === String(conn.libraryEntryId)) || null;
        if (!entry) {
            entry = Core.findEntryAcrossLibraries(conn.libraryEntryId);
        }

        const target = state.getCategoryLibrary(categoryName, workspaceId);
        if (entry) {
            source.entries = (source.entries || []).filter(item => String(item?.id) !== String(entry.id));
            if (!Array.isArray(target.entries)) target.entries = [];
            const alreadyInTarget = target.entries.some(item => String(item?.id) === String(entry.id));
            if (!alreadyInTarget) target.entries.push(entry);
        }

        conn.categoryName = categoryName;
        conn.workspace = workspaceId;
        Core.saveConnections();
        if (entry) window.EveLibrary.Storage?.saveLibrary?.();
        return true;
    }

    function moveLinkedEntryToCategory(linkId, nextCategoryName) {
        const conn = Core.findConnectionByLinkId(linkId);
        if (!conn) return false;
        return moveLinkedEntryToScope(linkId, nextCategoryName, conn.workspace);
    }

    Object.assign(Core, {
        promoteLink,
        unlinkLink,
        removeByLinkId,
        removeByLibraryEntry,
        syncFromLibraryEntry,
        syncFromLink,
        getLinkedEntry,
        updateLinkedEntry,
        moveLinkedEntryToScope,
        moveLinkedEntryToCategory
    });
})();
