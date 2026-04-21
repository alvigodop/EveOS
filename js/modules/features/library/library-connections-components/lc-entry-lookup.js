window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.ConnectionsCore = window.EveLibrary.ConnectionsCore || {};

(function () {
    const Core = window.EveLibrary.ConnectionsCore;

    if (!Core.normalizeWorkspaceId || !Core.normalizeCategoryName) {
        console.warn('[EveLibrary.ConnectionsCore] lc-state.js must load before lc-entry-lookup.js.');
        return;
    }

    // Lazy Map<entryId, {entry, categoryName, workspaceId}> index
    let _entryIndex = null;

    function invalidateEntryIndex() {
        _entryIndex = null;
    }

    function getEntryIndex() {
        if (_entryIndex) return _entryIndex;
        const state = window.EveLibrary.State;
        if (!state) return new Map();
        _entryIndex = new Map();
        const libs = state.getAllLibraries();
        const parseScoped = state.parseScopedCategoryKey;
        for (const [libKey, lib] of Object.entries(libs)) {
            const parsed = typeof parseScoped === 'function'
                ? parseScoped(libKey)
                : { categoryName: libKey, workspaceId: '', scoped: false };
            const catName = parsed.categoryName;
            const wsId = Core.normalizeWorkspaceId(parsed.workspaceId);
            (lib?.entries || []).forEach(entry => {
                if (entry && entry.id != null) {
                    // First-seen wins (matches original priority: scoped > legacy)
                    const key = String(entry.id);
                    if (!_entryIndex.has(key)) {
                        _entryIndex.set(key, { entry, categoryName: catName, workspaceId: wsId });
                    }
                }
            });
        }
        return _entryIndex;
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
            Core.saveConnections?.();
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

        // Fast path: direct scoped lookup (most common case)
        const state = window.EveLibrary.State;
        if (state) {
            const lib = state.getCategoryLibrary(scopedCategory, scopedWorkspace);
            const direct = (lib.entries || []).find(item => String(item.id) === String(conn.libraryEntryId));
            if (direct) return { entry: direct, categoryName: scopedCategory, workspaceId: scopedWorkspace };
        }

        // Indexed fallback: O(1) cross-library lookup
        const indexed = getEntryIndex().get(String(conn.libraryEntryId));
        if (indexed) return indexed;

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
        getDefaultStatus,
        invalidateEntryIndex
    });
})();
