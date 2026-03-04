window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCore = window.EveLibrary.ConnectionsCore || {};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;

    if (!Core.normalizeWorkspaceId || !Core.normalizeCategoryName) {
        console.warn('[EveLibrary.ConnectionsCore] lc-state.js must load before lc-entry-lookup.js.');
        return;
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
        if (!state || !Array.isArray(Core.connections) || Core.connections.length === 0) return;

        let changedConnections = false;
        let changedLibraries = false;

        // Keep only the latest connection per linkId and normalize link id shape.
        const seenLinkIds = new Set();
        const deduped = [];
        for (let index = Core.connections.length - 1; index >= 0; index -= 1) {
            const conn = Core.connections[index];
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
        Core.connections = deduped.reverse();

        Core.connections.forEach(conn => {
            if (!conn || typeof conn !== 'object') return;
            const link = Core.findLinkById(conn.linkId);
            const workspaceId = link
                ? Core.normalizeWorkspaceId(link.workspace || conn.workspace)
                : Core.normalizeWorkspaceId(conn.workspace);
            const categoryName = link
                ? Core.normalizeCategoryName(link.category || conn.categoryName)
                : Core.normalizeCategoryName(conn.categoryName);

            if (!conn.id) {
                conn.id = Core.generateId();
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

            targetLib.entries.push(Core.deepClone(sourceEntry));
            changedLibraries = true;
        });

        if (changedConnections) {
            window.EveLibrary.Connections = Core.connections.map(item => ({ ...item }));
            localStorage.setItem(Core.STORAGE_KEY, JSON.stringify(window.EveLibrary.Connections));
        }
        if (changedLibraries) {
            window.EveLibrary.Storage?.saveLibrary?.();
        }
    }

    function findEntry(categoryName, entryId, workspaceId) {
        const state = window.EveLibrary.State;
        if (!state) return null;
        const lib = state.getCategoryLibrary(categoryName, workspaceId);
        return (lib.entries || []).find(entry => String(entry.id) === String(entryId)) || null;
    }

    function findEntryByConnection(conn) {
        if (!conn) return null;
        const scopedWorkspace = Core.normalizeWorkspaceId(conn.workspace);
        const scopedCategory = Core.normalizeCategoryName(conn.categoryName);
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
            const keyWorkspace = Core.normalizeWorkspaceId(parsed.workspaceId || scopedWorkspace);
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
            if (parsed.workspaceId && Core.normalizeWorkspaceId(parsed.workspaceId) !== scopedWorkspace) continue;
            const matched = (lib.entries || []).find(item => String(item.id) === String(conn.libraryEntryId));
            if (matched) {
                return {
                    entry: matched,
                    categoryName: parsed.categoryName,
                    workspaceId: Core.normalizeWorkspaceId(parsed.workspaceId || scopedWorkspace)
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

    Object.assign(Core, {
        findEntryAcrossLibraries,
        repairScopedLibraryEntries,
        findEntry,
        findEntryByConnection,
        getDefaultStatus
    });
})();
