window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordBuildersLocal) return;

    const shared = ns.IndexShared;
    const folderDiagnostics = ns.IndexRecordFolderDiagnostics;
    const folderBuilders = ns.IndexRecordBuildersFolders;
    if (!shared || !folderDiagnostics || !folderBuilders) return;

    const {
        text,
        normalizeText,
        toArray,
        readConfig,
        readBookmarkFolders,
        getScopedKey,
        getWorkspaceGroupMeta,
        getLinkedLibraryMeta,
        deriveBaseHealth,
        buildFolderPathLabel
    } = shared;

    function createEntityLink(source) {
        const api = window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
        return api && typeof api.createLink === 'function' ? api.createLink(source) : '';
    }

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
        const isEmptyTransientLibrary = typeof libraryState?.isEmptyTransientLibraryBucket === 'function'
            ? libraryState.isEmptyTransientLibraryBucket
            : function (value) {
                const source = value && typeof value === 'object' ? value : {};
                const entries = Array.isArray(source.entries) ? source.entries : [];
                const folderView = source.folderView && typeof source.folderView === 'object' ? source.folderView : {};
                const chain = Array.isArray(folderView.chain) ? folderView.chain : [];
                return entries.length === 0
                    && String(source.dataType || 'graphicNovels') === 'graphicNovels'
                    && String(folderView.root || 'all') === 'all'
                    && chain.length === 0
                    && folderView.expanded !== true;
            };
        Object.keys(libraries || {}).forEach(function (key) {
            if (isEmptyTransientLibrary(libraries[key])) return;
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

        const folderStore = readBookmarkFolders();
        Object.keys(folderStore || {}).forEach(function (scopedKey) {
            const parts = String(scopedKey || '').split('::');
            const workspaceId = text(parts?.[0], 'main');
            const categoryName = text(parts?.slice(1).join('::'), 'Unsorted');
            const tree = folderStore[scopedKey];
            if (!Array.isArray(tree?.nodes) || !tree.nodes.length) return;
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
        const cfg = readConfig();
        const activeWorkspace = text(cfg.activeWorkspace, 'main');
        const cardDescriptions = cfg.cardDescriptions && typeof cfg.cardDescriptions === 'object'
            ? cfg.cardDescriptions
            : {};
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
            const cardDescription = text(cardDescriptions[category.scopedKey], '');
            const entityLink = createEntityLink({
                type: 'card',
                workspaceId: preferredWorkspaceId,
                categoryName: category.categoryName
            });
            const record = {
                id: 'card::' + category.scopedKey,
                type: 'card',
                entityLink: entityLink,
                title: category.categoryName,
                url: '',
                displayUrl: '',
                description: cardDescription || ('Card in ' + text(path.workspaceLabel, preferredWorkspaceId)),
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
                    entityLink: entityLink,
                    linkCount: category.linkCount,
                    cardDescription: cardDescription
                }
            };
            record.baseHealth = deriveBaseHealth(record);
            record.searchableText = normalizeText([
                record.title,
                cardDescription,
                path.workspaceLabel,
                category.scopedKey
            ].join(' '));
            records.push(record);
        });

        return records;
    }

    function normalizeQuickLinksForIndex(value) {
        const source = Array.isArray(value) ? value : [];
        return source.map(function (entry) {
            return {
                workspaceId: text(entry?.workspaceId || entry?.workspace || entry?.tabId, 'main'),
                categoryName: text(entry?.categoryName || entry?.category || entry?.cardName, 'Unsorted')
            };
        }).filter(function (entry) {
            return !!(entry.workspaceId && entry.categoryName);
        });
    }

    function buildBookmarkIdentifierMap() {
        const cfg = readConfig();
        const apiDefinitions = window.EveBookmarkIdentifiers?.getDefinitions
            ? window.EveBookmarkIdentifiers.getDefinitions()
            : null;
        const definitions = Array.isArray(apiDefinitions) && apiDefinitions.length
            ? apiDefinitions
            : (Array.isArray(cfg.bookmarkIdentifiers) ? cfg.bookmarkIdentifiers : []);
        return new Map(definitions.filter(Boolean).map(function (definition) {
            return [text(definition.id, ''), {
                id: text(definition.id, ''),
                label: text(definition.label || definition.id, ''),
                description: text(definition.description, ''),
                icon: text(definition.icon, ''),
                quickLinks: normalizeQuickLinksForIndex(definition.quickLinks)
            }];
        }).filter(function (entry) {
            return !!entry[0];
        }));
    }

    function buildBookmarkIdentifierMeta(identifierIds, identifierMap) {
        const ids = toArray(identifierIds).map(function (value) { return text(value, ''); }).filter(Boolean);
        const labels = [];
        const descriptions = [];
        const quickLinkTargets = [];
        ids.forEach(function (id) {
            const definition = identifierMap.get(id);
            if (!definition) return;
            if (definition.label) labels.push(definition.label);
            if (definition.description) descriptions.push(definition.description);
            normalizeQuickLinksForIndex(definition.quickLinks).forEach(function (target) {
                quickLinkTargets.push(target.categoryName + ' ' + target.workspaceId);
            });
        });
        return {
            ids,
            labels,
            descriptions,
            quickLinkTargets
        };
    }

    function buildBookmarkRecords(links) {
        const locators = ns.Locators || {};
        const knownWorkspaceIds = window.EveOS?.SearchAdvanced?.CacheAggregator?.getKnownWorkspaceIds
            ? window.EveOS.SearchAdvanced.CacheAggregator.getKnownWorkspaceIds()
            : new Set(['main']);
        const identifierMap = buildBookmarkIdentifierMap();
        const folderIntegrityCache = new Map();
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
            const folderId = text(path.folderId || link.folderId, '');
            const folderDiagnostic = folderDiagnostics.getBookmarkFolderDiagnostic(folderIntegrityCache, path.workspaceId, path.categoryName, folderId);
            const identifierMeta = buildBookmarkIdentifierMeta(link.identifiers, identifierMap);
            const relatedUrls = toArray(link.relatedUrls).map(function (entry) {
                return text(entry?.url || entry, '');
            }).filter(Boolean);
            const entityLink = createEntityLink({
                type: 'bookmark',
                workspaceId: path.workspaceId,
                categoryName: path.categoryName,
                folderId: folderId,
                bookmarkId: text(link.id, '')
            });
            const record = {
                id: 'bookmark::' + text(link.id, Math.random().toString(36).slice(2, 8)),
                type: 'bookmark',
                entityLink: entityLink,
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
                    entityLink: entityLink,
                    done: !!link.done,
                    orphaned: !knownWorkspaceIds.has(path.workspaceId),
                    missingFolder: folderDiagnostic.missingFolder,
                    missingParent: folderDiagnostic.missingParent,
                    folderUnreachable: folderDiagnostic.folderUnreachable,
                    folderParentBroken: folderDiagnostic.folderParentBroken,
                    folderIssueTypes: folderDiagnostic.folderIssueTypes,
                    folderIssueReasons: folderDiagnostic.folderIssueReasons,
                    tags: tags,
                    identifiers: identifierMeta.ids,
                    identifierLabels: identifierMeta.labels,
                    identifierDescriptions: identifierMeta.descriptions,
                    identifierQuickLinkTargets: identifierMeta.quickLinkTargets,
                    icon: text(link.icon, ''),
                    coverImage: text(link.coverImage, ''),
                    relatedUrls: relatedUrls,
                    priority: text(link.priority, ''),
                    libraryLinked: !!library.linked,
                    libraryEntryId: library.entryId
                },
                library: library
            };
            record.baseHealth = deriveBaseHealth(record);
            record.searchableText = normalizeText([
                record.title,
                record.url,
                relatedUrls.join(' '),
                record.description,
                tags.join(' '),
                identifierMeta.ids.join(' '),
                identifierMeta.labels.join(' '),
                identifierMeta.descriptions.join(' '),
                identifierMeta.quickLinkTargets.join(' '),
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

    const libraryBuilders = ns.IndexRecordBuildersLibrary;
    if (!libraryBuilders) return;
    const {
        normalizeEntryTimestamp,
        buildLibraryRecords
    } = libraryBuilders;
    ns.IndexRecordBuildersLocal = {
        buildCategoryMap,
        buildCardRecords,
        buildBookmarkRecords,
        buildFolderRecords: folderBuilders.buildFolderRecords,
        normalizeEntryTimestamp,
        buildLibraryRecords
    };
})();
