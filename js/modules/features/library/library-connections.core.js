/**
 * Library Connections Module
 * Maintains optional bookmark -> library entry links.
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const STORAGE_KEY = 'eveLibraryConnections';
    const Ratings = window.EveLibrary?.Ratings;
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
        window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'library-connections-save' } }));
    }

    function emitLinkedEntryUpdated(linkId, categoryName, entry, workspaceId) {
        const safeEntry = entry ? JSON.parse(JSON.stringify(entry)) : null;
        window.dispatchEvent(new CustomEvent('eve:library-link-updated', {
            detail: {
                linkId: String(linkId),
                categoryName,
                workspaceId: String(workspaceId || findConnectionByLinkId(linkId)?.workspace || ''),
                entry: safeEntry
            }
        }));
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
        repairScopedLibraryEntries();
        window.EveLibrary.Connections = connections.map(item => ({ ...item }));
    }

    function setAll(nextConnections) {
        connections = Array.isArray(nextConnections) ? nextConnections.map(item => ({ ...item })) : [];
        repairScopedLibraryEntries();
        saveConnections();
    }

    function getAll() {
        return connections.map(item => ({ ...item }));
    }

    function deepClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    function findEntryAcrossLibraries(entryId) {
        const state = window.EveLibrary.State;
        if (!state || !entryId) return null;
        const libraries = state.getAllLibraries();
        for (const lib of Object.values(libraries)) {
            const matched = (lib?.entries || []).find(item => String(item?.id) === String(entryId));
            if (matched) return matched;
        }
        return null;
    }

    function repairScopedLibraryEntries() {
        const state = window.EveLibrary.State;
        if (!state || !Array.isArray(connections) || connections.length === 0) return;

        let changedConnections = false;
        let changedLibraries = false;

        // Keep only the latest connection per linkId and normalize link id shape.
        const seenLinkIds = new Set();
        const deduped = [];
        for (let index = connections.length - 1; index >= 0; index -= 1) {
            const conn = connections[index];
            if (!conn || typeof conn !== 'object') {
                changedConnections = true;
                continue;
            }
            const linkId = String(conn.linkId || '').trim();
            if (!linkId || seenLinkIds.has(linkId)) {
                changedConnections = true;
                continue;
            }
            conn.linkId = linkId;
            seenLinkIds.add(linkId);
            deduped.push(conn);
        }
        connections = deduped.reverse();

        connections.forEach(conn => {
            if (!conn || typeof conn !== 'object') return;
            const link = findLinkById(conn.linkId);
            const workspaceId = link
                ? normalizeWorkspaceId(link.workspace || conn.workspace)
                : normalizeWorkspaceId(conn.workspace);
            const categoryName = link
                ? normalizeCategoryName(link.category || conn.categoryName)
                : normalizeCategoryName(conn.categoryName);

            if (!conn.id) {
                conn.id = generateId();
                changedConnections = true;
            }

            if (conn.workspace !== workspaceId) {
                conn.workspace = workspaceId;
                changedConnections = true;
            }
            if (conn.categoryName !== categoryName) {
                conn.categoryName = categoryName;
                changedConnections = true;
            }

            const targetLib = state.getCategoryLibrary(categoryName, workspaceId);
            if (!Array.isArray(targetLib.entries)) {
                targetLib.entries = [];
                changedLibraries = true;
            }

            const exists = targetLib.entries.some(entry => String(entry?.id) === String(conn.libraryEntryId));
            if (exists) return;

            const sourceEntry = findEntryAcrossLibraries(conn.libraryEntryId);
            if (!sourceEntry) return;

            targetLib.entries.push(deepClone(sourceEntry));
            changedLibraries = true;
        });

        if (changedConnections) {
            window.EveLibrary.Connections = connections.map(item => ({ ...item }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(window.EveLibrary.Connections));
        }
        if (changedLibraries) {
            window.EveLibrary.Storage?.saveLibrary?.();
        }
    }

    function generateId() {
        return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function findConnectionByLinkId(linkId) {
        return connections.find(item => String(item.linkId) === String(linkId)) || null;
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

    function findEntry(categoryName, entryId, workspaceId) {
        const state = window.EveLibrary.State;
        if (!state) return null;
        const lib = state.getCategoryLibrary(categoryName, workspaceId);
        return (lib.entries || []).find(entry => String(entry.id) === String(entryId)) || null;
    }

    function findEntryByConnection(conn) {
        if (!conn) return null;
        const scopedWorkspace = normalizeWorkspaceId(conn.workspace);
        const scopedCategory = normalizeCategoryName(conn.categoryName);
        let entry = findEntry(scopedCategory, conn.libraryEntryId, scopedWorkspace);
        if (entry) return { entry, categoryName: scopedCategory, workspaceId: scopedWorkspace };

        const state = window.EveLibrary.State;
        if (!state) return null;
        const parseScoped = state.parseScopedCategoryKey;
        const libs = state.getAllLibraries();
        for (const [libraryKey, lib] of Object.entries(libs)) {
            const parsed = typeof parseScoped === 'function'
                ? parseScoped(libraryKey)
                : { categoryName: libraryKey, workspaceId: '', scoped: false };
            const keyCategory = parsed.categoryName;
            const keyWorkspace = normalizeWorkspaceId(parsed.workspaceId || scopedWorkspace);
            if (keyCategory !== scopedCategory) continue;
            if (keyWorkspace !== scopedWorkspace) continue;

            const matched = (lib.entries || []).find(item => String(item.id) === String(conn.libraryEntryId));
            if (matched) return { entry: matched, categoryName: keyCategory, workspaceId: keyWorkspace };
        }

        // Final fallback for legacy data: find by entry id only.
        for (const [libraryKey, lib] of Object.entries(libs)) {
            const parsed = typeof parseScoped === 'function'
                ? parseScoped(libraryKey)
                : { categoryName: libraryKey, workspaceId: '', scoped: false };
            if (parsed.workspaceId && normalizeWorkspaceId(parsed.workspaceId) !== scopedWorkspace) continue;
            const matched = (lib.entries || []).find(item => String(item.id) === String(conn.libraryEntryId));
            if (matched) {
                return {
                    entry: matched,
                    categoryName: parsed.categoryName,
                    workspaceId: normalizeWorkspaceId(parsed.workspaceId || scopedWorkspace)
                };
            }
        }

        return null;
    }

    function getDefaultStatus(categoryName, workspaceId) {
        const state = window.EveLibrary.State;
        if (!state) return '';
        const dataType = state.getCategoryDataType(categoryName, workspaceId);
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
        const workspaceId = normalizeWorkspaceId(link.workspace);
        const state = window.EveLibrary.State;
        const storage = window.EveLibrary.Storage;
        if (!state || !storage) return null;

        const lib = state.getCategoryLibrary(categoryName, workspaceId);
        const newEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: link.title || 'Untitled',
            mediaTypes: ['graphicNovels'],
            author: '',
            authorAltNames: [],
            artist: '',
            genre: '',
            status: getDefaultStatus(categoryName, workspaceId),
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
            id: generateId(),
            linkId: String(link.id),
            libraryEntryId: newEntry.id,
            categoryName,
            workspace: workspaceId,
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
                const lib = state.getCategoryLibrary(found.categoryName, found.workspaceId || conn.workspace);
                lib.entries = (lib.entries || []).filter(item => item.id !== found.entry.id);
                window.EveLibrary.Storage?.saveLibrary?.();
            }
        }

        connections = connections.filter(item => String(item.linkId) !== String(linkId));
        saveConnections();
        return true;
    }

    function removeByLinkId(linkId) {
        const before = connections.length;
        connections = connections.filter(item => String(item.linkId) !== String(linkId));
        if (connections.length !== before) {
            saveConnections();
        }
    }

    function removeByLibraryEntry(categoryName, entryId, workspaceId) {
        const before = connections.length;
        const normalizedCategory = normalizeCategoryName(categoryName);
        const normalizedEntryId = String(entryId);
        const normalizedWorkspace = String(workspaceId || '').trim();
        connections = connections.filter(item => {
            if (normalizeCategoryName(item.categoryName) !== normalizedCategory) return true;
            if (String(item.libraryEntryId) !== normalizedEntryId) return true;
            if (!normalizedWorkspace) return false;
            return normalizeWorkspaceId(item.workspace) !== normalizeWorkspaceId(normalizedWorkspace);
        });
        if (connections.length !== before) {
            saveConnections();
        }
    }

    function syncFromLibraryEntry(categoryName, entry, workspaceId) {
        if (!entry) return;
        const normalizedCategory = normalizeCategoryName(categoryName);
        const normalizedEntryId = String(entry.id);
        const normalizedWorkspace = String(workspaceId || '').trim();
        const linked = connections.filter(item => {
            if (normalizeCategoryName(item.categoryName) !== normalizedCategory) return false;
            if (String(item.libraryEntryId) !== normalizedEntryId) return false;
            if (!normalizedWorkspace) return true;
            return normalizeWorkspaceId(item.workspace) === normalizeWorkspaceId(normalizedWorkspace);
        });
        if (linked.length === 0) return;

        const allLinks = getLinks();
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
            saveLinks();
        }
        linked.forEach(conn => emitLinkedEntryUpdated(conn.linkId, normalizedCategory, entry, conn.workspace));
    }

    function syncFromLink(linkId) {
        let conn = findConnectionByLinkId(linkId);
        if (!conn) return;
        const link = findLinkById(linkId);
        if (!link) return;

        const currentWorkspace = normalizeWorkspaceId(conn.workspace);
        const currentCategory = normalizeCategoryName(conn.categoryName);
        const nextWorkspace = normalizeWorkspaceId(link.workspace || getConfig().activeWorkspace || currentWorkspace);
        const nextCategory = normalizeCategoryName(link.category || currentCategory);
        if (nextCategory !== currentCategory || nextWorkspace !== currentWorkspace) {
            moveLinkedEntryToScope(linkId, nextCategory, nextWorkspace);
            conn = findConnectionByLinkId(linkId);
            if (!conn) return;
        }

        const found = findEntryByConnection(conn);
        if (!found?.entry) return;
        const entry = found.entry;
        entry.title = link.title || entry.title;
        if (link.url) entry.sourceUrl = link.url;
        entry.lastEdited = new Date().toISOString();
        window.EveLibrary.Storage?.saveLibrary?.();
        emitLinkedEntryUpdated(linkId, found.categoryName, entry, conn.workspace);
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
        if (Ratings?.applyDerivedRatings) {
            Ratings.applyDerivedRatings(found.entry);
        }
        found.entry.lastEdited = new Date().toISOString();
        window.EveLibrary.Storage?.saveLibrary?.();
        syncFromLibraryEntry(found.categoryName, found.entry, conn.workspace);
        return true;
    }

    function moveLinkedEntryToScope(linkId, nextCategoryName, nextWorkspaceId) {
        const conn = findConnectionByLinkId(linkId);
        if (!conn) return false;
        const categoryName = normalizeCategoryName(nextCategoryName);
        const workspaceId = normalizeWorkspaceId(nextWorkspaceId || conn.workspace);
        const currentCategory = normalizeCategoryName(conn.categoryName);
        const currentWorkspace = normalizeWorkspaceId(conn.workspace);
        if (currentCategory === categoryName && currentWorkspace === workspaceId) return true;

        const state = window.EveLibrary.State;
        if (!state) return false;

        const source = state.getCategoryLibrary(currentCategory, currentWorkspace);
        let entry = (source.entries || []).find(item => String(item?.id) === String(conn.libraryEntryId)) || null;
        if (!entry) {
            entry = findEntryAcrossLibraries(conn.libraryEntryId);
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
        saveConnections();
        if (entry) window.EveLibrary.Storage?.saveLibrary?.();
        return true;
    }

    function moveLinkedEntryToCategory(linkId, nextCategoryName) {
        const conn = findConnectionByLinkId(linkId);
        if (!conn) return false;
        return moveLinkedEntryToScope(linkId, nextCategoryName, conn.workspace);
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
        moveLinkedEntryToScope,
        moveLinkedEntryToCategory
    };
})();
