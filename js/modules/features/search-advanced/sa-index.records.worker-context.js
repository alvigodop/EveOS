window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordWorkerContext) return;
    const shared = ns.IndexShared;
    if (!shared) return;

    const {
        text,
        toArray,
        readConfig,
        readBookmarkFolders,
        getWorkspaceGroupMeta
    } = shared;

    function clonePlain(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value == null ? fallback : value));
        } catch (error) {
            return fallback;
        }
    }

    function flattenWorkspaceIds(workspaces, ids) {
        toArray(workspaces).forEach(function (workspace) {
            const id = text(workspace?.id, '');
            if (id) ids.add(id);
            flattenWorkspaceIds(workspace?.subTabs, ids);
        });
    }

    function normalizeQuickLinksForIndex(value) {
        return toArray(value).map(function (entry) {
            return {
                workspaceId: text(entry?.workspaceId || entry?.workspace || entry?.tabId, 'main'),
                categoryName: text(entry?.categoryName || entry?.category || entry?.cardName, 'Unsorted')
            };
        }).filter(function (entry) {
            return !!(entry.workspaceId && entry.categoryName);
        });
    }

    function buildIdentifierDefinitions(config) {
        const apiDefinitions = window.EveBookmarkIdentifiers?.getDefinitions
            ? window.EveBookmarkIdentifiers.getDefinitions()
            : null;
        const definitions = Array.isArray(apiDefinitions) && apiDefinitions.length
            ? apiDefinitions
            : (Array.isArray(config.bookmarkIdentifiers) ? config.bookmarkIdentifiers : []);
        return definitions.filter(Boolean).map(function (definition) {
            return {
                id: text(definition.id, ''),
                label: text(definition.label || definition.id, ''),
                description: text(definition.description, ''),
                quickLinks: normalizeQuickLinksForIndex(definition.quickLinks)
            };
        }).filter(function (definition) {
            return !!definition.id;
        });
    }

    function getLibraryEntriesById() {
        const stateApi = window.EveLibrary?.State;
        if (!stateApi?.getAllLibraries || !stateApi?.parseScopedCategoryKey) return new Map();
        const entriesById = new Map();
        const libraries = stateApi.getAllLibraries() || {};
        Object.keys(libraries).forEach(function (scopedKey) {
            const parsed = stateApi.parseScopedCategoryKey(scopedKey) || {};
            const workspaceId = text(parsed.workspaceId, 'main');
            const categoryName = text(parsed.categoryName, 'Unsorted');
            toArray(libraries[scopedKey]?.entries).forEach(function (entry) {
                const entryId = text(entry?.id, '');
                if (!entryId) return;
                entriesById.set(entryId, {
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    entry: clonePlain(entry, {})
                });
            });
        });
        return entriesById;
    }

    function normalizeLibraryMeta(entry, scope) {
        if (!entry) {
            return {
                linked: false,
                entryId: '',
                categoryName: '',
                workspaceId: '',
                title: '',
                summary: '',
                status: '',
                mediaType: '',
                author: '',
                genre: '',
                aliases: []
            };
        }
        const aliases = []
            .concat(toArray(entry.aliases))
            .concat(toArray(entry.alternativeTitles))
            .concat(toArray(entry.altTitles))
            .concat(toArray(entry.titleAltNames))
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);
        return {
            linked: true,
            entryId: text(entry.id, ''),
            categoryName: text(scope?.categoryName, ''),
            workspaceId: text(scope?.workspaceId, ''),
            title: text(entry.title, ''),
            summary: text(entry.summary, ''),
            status: text(entry.status, ''),
            mediaType: text(entry.mediaType || entry.type, ''),
            author: text(entry.author, ''),
            genre: text(entry.genre, ''),
            aliases: aliases
        };
    }

    function buildLibraryByLinkId() {
        const api = window.EveLibrary?.ConnectionsAPI;
        const connections = typeof api?.getAll === 'function' ? api.getAll() : [];
        const entriesById = getLibraryEntriesById();
        const result = {};
        toArray(connections).forEach(function (connection) {
            const linkId = text(connection?.linkId, '');
            const entryId = text(connection?.libraryEntryId || connection?.entryId, '');
            if (!linkId || !entryId) return;
            const found = entriesById.get(entryId);
            const scope = {
                workspaceId: text(connection?.workspace || found?.workspaceId, ''),
                categoryName: text(found?.categoryName, '')
            };
            result[linkId] = normalizeLibraryMeta(found?.entry, scope);
        });
        return result;
    }

    function buildGroupMetaByWorkspace(knownWorkspaceIds) {
        const result = {};
        knownWorkspaceIds.forEach(function (workspaceId) {
            result[workspaceId] = getWorkspaceGroupMeta(workspaceId);
        });
        return result;
    }

    function buildBookmarkWorkerContext() {
        const config = readConfig();
        const workspaces = clonePlain(config.workspaces || [], []);
        const knownWorkspaceIds = new Set();
        flattenWorkspaceIds(workspaces, knownWorkspaceIds);
        knownWorkspaceIds.add(text(config.activeWorkspace, 'main'));
        knownWorkspaceIds.add('main');
        return {
            activeWorkspace: text(config.activeWorkspace, 'main'),
            workspaces: workspaces,
            knownWorkspaceIds: Array.from(knownWorkspaceIds),
            bookmarkFolders: clonePlain(readBookmarkFolders(), {}),
            identifierDefinitions: buildIdentifierDefinitions(config),
            libraryByLinkId: buildLibraryByLinkId(),
            groupMetaByWorkspace: buildGroupMetaByWorkspace(knownWorkspaceIds)
        };
    }

    ns.IndexRecordWorkerContext = {
        buildBookmarkWorkerContext
    };
})();
