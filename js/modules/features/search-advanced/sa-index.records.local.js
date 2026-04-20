window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordBuildersLocal) return;

    const shared = ns.IndexShared;
    if (!shared) return;

    const {
        text,
        normalizeText,
        toArray,
        readConfig,
        getScopedKey,
        getWorkspaceGroupMeta,
        getLinkedLibraryMeta,
        deriveBaseHealth,
        buildFolderPathLabel
    } = shared;

    function buildCategoryMap(links) {
        const map = new Map();
        links.forEach(function (link) {
            if (!link) return;
            const workspaceId = text(link.workspace, 'main');
            const categoryName = text(link.category, 'Unsorted');
            const scopedKey = getScopedKey(workspaceId, categoryName);
            if (!map.has(scopedKey)) {
                map.set(scopedKey, {
                    scopedKey: scopedKey,
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    workspaceIds: new Set(),
                    linkCount: 0
                });
            }
            const entry = map.get(scopedKey);
            entry.workspaceIds.add(workspaceId);
            entry.linkCount += 1;
        });

        const libraryState = window.EveLibrary?.State;
        const libraries = libraryState?.getAllLibraries ? libraryState.getAllLibraries() : {};
        const parseScopedKey = libraryState?.parseScopedCategoryKey;
        Object.keys(libraries || {}).forEach(function (key) {
            const parsed = parseScopedKey
                ? parseScopedKey(key)
                : { workspaceId: 'main', categoryName: key };
            const workspaceId = text(parsed.workspaceId, 'main');
            const categoryName = text(parsed.categoryName, 'Unsorted');
            const scopedKey = getScopedKey(workspaceId, categoryName);
            if (!map.has(scopedKey)) {
                map.set(scopedKey, {
                    scopedKey: scopedKey,
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    workspaceIds: new Set(),
                    linkCount: 0
                });
            }
            map.get(scopedKey).workspaceIds.add(workspaceId);
        });

        return map;
    }

    function buildCardRecords(categoryMap) {
        const locators = ns.Locators || {};
        const activeWorkspace = text(readConfig().activeWorkspace, 'main');
        const records = [];

        Array.from(categoryMap.values()).forEach(function (category) {
            const workspaceIds = Array.from(category.workspaceIds);
            const preferredWorkspaceId = workspaceIds.includes(activeWorkspace) ? activeWorkspace : workspaceIds[0];
            const path = locators.buildPathMeta
                ? locators.buildPathMeta({
                    workspaceIds: workspaceIds,
                    workspaceId: preferredWorkspaceId,
                    categoryName: category.categoryName
                })
                : {
                    workspaceId: preferredWorkspaceId,
                    workspaceIds: workspaceIds,
                    categoryName: category.categoryName,
                    pathLabel: category.categoryName
                };
            const groupMeta = getWorkspaceGroupMeta(preferredWorkspaceId);
            const record = {
                id: 'card::' + category.scopedKey,
                type: 'card',
                title: category.categoryName,
                url: '',
                displayUrl: '',
                description: 'Card in ' + text(path.workspaceLabel, preferredWorkspaceId),
                provider: 'card',
                sourceCard: category.categoryName,
                sourceIdentity: {
                    kind: 'card',
                    scopedKey: category.scopedKey
                },
                workspaceId: preferredWorkspaceId,
                workspaceIds: workspaceIds,
                categoryName: category.categoryName,
                path: path,
                updatedAt: 0,
                groupId: groupMeta.groupId,
                groupName: groupMeta.groupName,
                groupHidden: groupMeta.hidden,
                provenance: {
                    kind: 'card',
                    scopedKey: category.scopedKey,
                    linkCount: category.linkCount
                }
            };
            record.baseHealth = deriveBaseHealth(record);
            record.searchableText = normalizeText([
                record.title,
                path.workspaceLabel,
                category.scopedKey
            ].join(' '));
            records.push(record);
        });

        return records;
    }

    function buildBookmarkRecords(links) {
        const locators = ns.Locators || {};
        const knownWorkspaceIds = window.EveOS?.SearchAdvanced?.CacheAggregator?.getKnownWorkspaceIds
            ? window.EveOS.SearchAdvanced.CacheAggregator.getKnownWorkspaceIds()
            : new Set(['main']);
        return links.filter(Boolean).map(function (link) {
            const path = locators.buildBookmarkPath
                ? locators.buildBookmarkPath(link)
                : {
                    workspaceId: text(link.workspace, 'main'),
                    workspaceIds: [text(link.workspace, 'main')],
                    categoryName: text(link.category, 'Unsorted'),
                    folderId: text(link.folderId, ''),
                    folderLabel: buildFolderPathLabel(text(link.workspace, 'main'), text(link.category, 'Unsorted'), text(link.folderId, '')),
                    linkId: text(link.id, ''),
                    pathLabel: text(link.category, 'Unsorted')
                };
            const library = getLinkedLibraryMeta(link.id);
            const groupMeta = getWorkspaceGroupMeta(path.workspaceId);
            const tags = toArray(link.tags).map(function (tag) { return text(tag, ''); }).filter(Boolean);
            const record = {
                id: 'bookmark::' + text(link.id, Math.random().toString(36).slice(2, 8)),
                type: 'bookmark',
                title: text(link.title || link.name || link.url, 'Untitled'),
                url: text(link.url, ''),
                displayUrl: text(link.url, ''),
                description: text(link.notes || library.summary, ''),
                provider: 'bookmark',
                sourceCard: text(link.category, 'Unsorted'),
                sourceIdentity: {
                    kind: 'bookmark',
                    linkId: text(link.id, '')
                },
                workspaceId: path.workspaceId,
                workspaceIds: [path.workspaceId],
                categoryName: path.categoryName,
                path: path,
                updatedAt: 0,
                groupId: groupMeta.groupId,
                groupName: groupMeta.groupName,
                groupHidden: groupMeta.hidden,
                provenance: {
                    kind: 'bookmark',
                    linkId: text(link.id, ''),
                    done: !!link.done,
                    orphaned: !knownWorkspaceIds.has(path.workspaceId),
                    tags: tags,
                    libraryLinked: !!library.linked,
                    libraryEntryId: library.entryId
                },
                library: library
            };
            record.baseHealth = deriveBaseHealth(record);
            record.searchableText = normalizeText([
                record.title,
                record.url,
                record.description,
                tags.join(' '),
                library.title,
                library.summary,
                library.author,
                library.genre,
                library.status,
                library.mediaType,
                library.aliases.join(' '),
                path.pathLabel
            ].join(' '));
            return record;
        });
    }

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
                const aliases = []
                    .concat(toArray(libraryEntry?.aliases))
                    .concat(toArray(libraryEntry?.alternativeTitles))
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
                        entryId: text(libraryEntry?.id, ''),
                        categoryName: categoryName
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
                        entryId: text(libraryEntry?.id, ''),
                        status: text(libraryEntry?.status, ''),
                        mediaType: text(libraryEntry?.mediaType || library?.dataType, ''),
                        aliases: aliases
                    },
                    library: {
                        linked: true,
                        entryId: text(libraryEntry?.id, ''),
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

    ns.IndexRecordBuildersLocal = {
        buildCategoryMap,
        buildCardRecords,
        buildBookmarkRecords,
        normalizeEntryTimestamp,
        buildLibraryRecords
    };
})();
