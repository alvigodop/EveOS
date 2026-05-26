window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordBuildersLibrary) return;

    const shared = ns.IndexShared;
    if (!shared) return;

    const {
        text,
        normalizeText,
        toArray,
        getWorkspaceGroupMeta,
        deriveBaseHealth
    } = shared;
    function normalizeEntryTimestamp(entry) {
        const candidates = [entry?.lastEdited, entry?.dateAdded, entry?.updatedAt, entry?.createdAt];
        for (let i = 0; i < candidates.length; i += 1) {
            const value = candidates[i];
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string' && value.trim()) {
                const stamp = Date.parse(value);
                if (Number.isFinite(stamp)) return stamp;
            }
        }
        return 0;
    }

    function findConnectionForLibraryEntry(entryId) {
        const normalizedEntryId = text(entryId, '');
        if (!normalizedEntryId) return null;
        const core = window.EveLibrary?.ConnectionsCore;
        if (typeof core?.findConnectionByLibraryEntryId === 'function') {
            return core.findConnectionByLibraryEntryId(normalizedEntryId) || null;
        }
        const api = window.EveLibrary?.ConnectionsAPI;
        const connections = typeof api?.getAll === 'function' ? api.getAll() : [];
        return toArray(connections).find(function (connection) {
            return text(connection?.libraryEntryId || connection?.entryId, '') === normalizedEntryId;
        }) || null;
    }

    function buildLibraryRecords() {
        const stateApi = window.EveLibrary?.State;
        if (!stateApi?.getAllLibraries || !stateApi?.parseScopedCategoryKey) return [];

        const libraries = stateApi.getAllLibraries() || {};
        const locators = ns.Locators || {};
        const records = [];

        Object.entries(libraries).forEach(function (entryPair) {
            const scopedKey = entryPair[0];
            const library = entryPair[1];
            const parsed = stateApi.parseScopedCategoryKey(scopedKey);
            const workspaceId = text(parsed.workspaceId, 'main');
            const categoryName = text(parsed.categoryName, 'Unsorted');
            const path = locators.buildPathMeta
                ? locators.buildPathMeta({
                    workspaceIds: [workspaceId],
                    workspaceId: workspaceId,
                    categoryName: categoryName
                })
                : {
                    workspaceId: workspaceId,
                    workspaceIds: [workspaceId],
                    categoryName: categoryName,
                    pathLabel: categoryName
                };
            const groupMeta = getWorkspaceGroupMeta(path.workspaceId);

            toArray(library?.entries).forEach(function (libraryEntry, index) {
                const entryId = text(libraryEntry?.id, '');
                const connection = findConnectionForLibraryEntry(entryId);
                const linkedLinkId = text(connection?.linkId, '');
                const aliases = []
                    .concat(toArray(libraryEntry?.aliases))
                    .concat(toArray(libraryEntry?.alternativeTitles))
                    .concat(toArray(libraryEntry?.altTitles))
                    .concat(toArray(libraryEntry?.titleAltNames))
                    .map(function (value) { return text(value, ''); })
                    .filter(Boolean);
                const sourceUrl = text(libraryEntry?.sourceUrl || libraryEntry?.url, '');
                const record = {
                    id: 'library::' + scopedKey + '::' + index,
                    type: 'library',
                    title: text(libraryEntry?.title, 'Untitled Library Entry'),
                    url: sourceUrl,
                    displayUrl: sourceUrl,
                    description: text(libraryEntry?.summary || libraryEntry?.genre || libraryEntry?.author, ''),
                    provider: 'library',
                    sourceCard: categoryName,
                    sourceIdentity: {
                        kind: 'library',
                        entryId: entryId,
                        categoryName: categoryName,
                        linkId: linkedLinkId
                    },
                    workspaceId: path.workspaceId,
                    workspaceIds: [path.workspaceId],
                    categoryName: categoryName,
                    path: path,
                    updatedAt: normalizeEntryTimestamp(libraryEntry),
                    groupId: groupMeta.groupId,
                    groupName: groupMeta.groupName,
                    groupHidden: groupMeta.hidden,
                    provenance: {
                        kind: 'library',
                        entryId: entryId,
                        linkId: linkedLinkId,
                        status: text(libraryEntry?.status, ''),
                        mediaType: text(libraryEntry?.mediaType || library?.dataType, ''),
                        aliases: aliases
                    },
                    library: {
                        linked: true,
                        entryId: entryId,
                        linkId: linkedLinkId,
                        categoryName: categoryName,
                        workspaceId: path.workspaceId,
                        title: text(libraryEntry?.title, ''),
                        summary: text(libraryEntry?.summary, ''),
                        status: text(libraryEntry?.status, ''),
                        mediaType: text(libraryEntry?.mediaType || library?.dataType, ''),
                        author: text(libraryEntry?.author, ''),
                        genre: text(libraryEntry?.genre, ''),
                        aliases: aliases
                    }
                };
                record.baseHealth = deriveBaseHealth(record);
                record.searchableText = normalizeText([
                    record.title,
                    record.description,
                    sourceUrl,
                    record.library.summary,
                    record.library.author,
                    record.library.genre,
                    record.library.status,
                    record.library.mediaType,
                    aliases.join(' '),
                    path.pathLabel
                ].join(' '));
                records.push(record);
            });
        });

        return records;
    }
    ns.IndexRecordBuildersLibrary = {
        normalizeEntryTimestamp,
        buildLibraryRecords
    };
})();
