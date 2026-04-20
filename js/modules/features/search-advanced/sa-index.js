window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const INDEX_VERSION = 1;
    const STORAGE_KEY = 'eve.nexusIndex.v1';
    const STORAGE_MANAGER_KEY = 'nexusIndex';
    const SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
    const LOCAL_TYPES = new Set(['bookmark', 'card', 'library', 'knowledge', 'cached']);
    const SEARCH_STORAGE_KEYS = new Set(['wikiEntries', 'fandomDomains', 'wikiCacheStore', 'wikiDataStore', 'fandomCacheIndex', 'wikiCategories']);

    const state = {
        snapshot: null,
        buildPromise: null,
        dirty: true,
        loaded: false,
        lastReason: 'startup'
    };

    function now() {
        return Date.now();
    }

    function text(value, fallback) {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function normalizeText(value) {
        return text(value, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function readConfig() {
        return window.eveState?.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function readLinks() {
        return Array.isArray(window.eveState?.links)
            ? window.eveState.links
            : (typeof window.links !== 'undefined' ? window.links : []);
    }

    function readBookmarkFolders() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {
            return window.eveState.bookmarkFolders;
        }
        if (typeof window.bookmarkFolders !== 'undefined' && window.bookmarkFolders && typeof window.bookmarkFolders === 'object') {
            return window.bookmarkFolders;
        }
        return {};
    }

    function getScopedKey(workspaceId, categoryName) {
        return text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
    }

    function getWorkspaceIdsInScope(scope) {
        if (!scope?.workspaceId) return null;
        const wsId = text(scope.workspaceId, 'main');
        const ids = new Set([wsId]);
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = readConfig().workspaces || [];
        if (helpers?.findById && helpers?.getDescendantIds) {
            const workspace = helpers.findById(workspaces, wsId);
            if (workspace) {
                helpers.getDescendantIds(workspace).forEach(function (id) {
                    ids.add(text(id, ''));
                });
            }
        }
        return ids;
    }

    function getCurrentFocusCategory() {
        try {
            return typeof focusCategory !== 'undefined' ? text(focusCategory, '') : '';
        } catch (error) {
            return '';
        }
    }

    function getWorkspaceGroupMeta(workspaceId) {
        const groups = window.EveSidebarGroupsRuntime;
        if (!groups?.getWorkspaceRoot || !groups?.getWorkspaceGroupId || !groups?.findGroupById) {
            return { groupId: '', groupName: '', hidden: false };
        }

        const rootWorkspace = groups.getWorkspaceRoot(workspaceId, readConfig());
        const groupId = text(groups.getWorkspaceGroupId(rootWorkspace || workspaceId, readConfig()), '');
        const group = groupId ? groups.findGroupById(groupId, readConfig()) : null;
        return {
            groupId: groupId,
            groupName: text(group?.name, ''),
            hidden: !!group?.hidden
        };
    }

    function getLinkedLibraryMeta(linkId) {
        const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(text(linkId, '')) || null;
        const entry = linked?.entry || null;
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
            .concat(toArray(entry?.aliases))
            .concat(toArray(entry?.alternativeTitles))
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);

        return {
            linked: true,
            entryId: text(entry?.id, ''),
            categoryName: text(linked?.categoryName, ''),
            workspaceId: text(linked?.workspaceId, ''),
            title: text(entry?.title, ''),
            summary: text(entry?.summary, ''),
            status: text(entry?.status, ''),
            mediaType: text(entry?.mediaType || entry?.type, ''),
            author: text(entry?.author, ''),
            genre: text(entry?.genre, ''),
            aliases: aliases
        };
    }

    function computeFreshness(updatedAt) {
        const stamp = Number(updatedAt || 0);
        if (!stamp) {
            return { state: 'unknown', label: 'Unknown', ageMs: 0 };
        }

        const ageMs = Math.max(0, now() - stamp);
        if (ageMs < 7 * 24 * 60 * 60 * 1000) {
            return { state: 'fresh', label: 'Fresh', ageMs: ageMs };
        }
        if (ageMs < 30 * 24 * 60 * 60 * 1000) {
            return { state: 'aging', label: 'Aging', ageMs: ageMs };
        }
        return { state: 'stale', label: 'Stale', ageMs: ageMs };
    }

    function deriveBaseHealth(record) {
        const reasons = [];
        let stateLabel = 'healthy';

        if (record?.provenance?.orphaned) {
            stateLabel = 'broken';
            reasons.push('Workspace reference no longer exists.');
        }
        if (record?.path?.ambiguousWorkspace) {
            if (stateLabel !== 'broken') stateLabel = 'warning';
            reasons.push('Card exists in multiple tabs; path uses the preferred match.');
        }
        if (record?.type === 'cached' && !record?.url) {
            if (stateLabel !== 'broken') stateLabel = 'warning';
            reasons.push('Cached result is missing a launch URL.');
        }
        if (record?.type === 'bookmark' && !record?.url) {
            if (stateLabel !== 'broken') stateLabel = 'warning';
            reasons.push('Bookmark is missing a URL.');
        }
        if (!record?.path?.workspaceId || !record?.path?.categoryName) {
            stateLabel = 'broken';
            reasons.push('Path metadata is incomplete.');
        }

        return {
            state: stateLabel,
            reasons: reasons
        };
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

    function buildFolderPathLabel(workspaceId, categoryName, folderId) {
        if (!folderId || typeof window.EveBookmarkFolders?.buildFolderPathLabel !== 'function') return '';
        return text(window.EveBookmarkFolders.buildFolderPathLabel(workspaceId, categoryName, folderId), '');
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

    async function buildCachedRecords(categoryMap) {
        const cache = window.EveOS?.API?.Cache;
        const cacheRuntime = window.EveOS?.API?.CacheRuntime || {};
        const locators = ns.Locators || {};
        if (!cache?.loadPool) return [];

        const activeWorkspace = text(readConfig().activeWorkspace, 'main');
        const records = [];
        const groupedByCategory = new Map();

        Array.from(categoryMap.values()).forEach(function (entry) {
            const key = entry.categoryName;
            if (!groupedByCategory.has(key)) {
                groupedByCategory.set(key, {
                    categoryName: key,
                    workspaceIds: new Set()
                });
            }
            entry.workspaceIds.forEach(function (workspaceId) {
                groupedByCategory.get(key).workspaceIds.add(workspaceId);
            });
        });

        for (const category of groupedByCategory.values()) {
            try {
                const pool = await cache.loadPool(category.categoryName);
                if (!pool || typeof pool !== 'object') continue;
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

                const queryEntries = pool?.queries && typeof pool.queries === 'object' ? pool.queries : pool;
                Object.keys(queryEntries).forEach(function (queryKey) {
                    const entry = queryEntries[queryKey];
                    if (!entry || typeof entry !== 'object') return;
                    const perSource = entry.summary?.perSource
                        || (cache.summarizeSources ? cache.summarizeSources(entry.sources || {}).perSource : {})
                        || {};
                    const sourceQuery = text(entry?.query || queryKey, '');
                    const providerKeys = cacheRuntime.getSearchableProviderKeys
                        ? cacheRuntime.getSearchableProviderKeys()
                        : Object.keys(perSource || {});

                    providerKeys.forEach(function (providerKey) {
                        const items = cacheRuntime.getProviderList
                            ? cacheRuntime.getProviderList(entry.sources || {}, providerKey)
                            : [];
                        toArray(items).forEach(function (result, index) {
                            const title = text(
                                result?.title
                                || result?.name
                                || result?.attributes?.title?.en
                                || result?.attributes?.title?.ja
                                || result?.node?.title?.userPreferred
                                || result?.volumeInfo?.title,
                                'Untitled'
                            );
                            const url = text(
                                result?.url
                                || result?.link
                                || result?.siteUrl
                                || result?.html_url
                                || result?.attributes?.url,
                                ''
                            );
                            const description = text(
                                result?.description
                                || result?.snippet
                                || result?.synopsis
                                || result?.attributes?.description?.en
                                || result?.attributes?.description,
                                ''
                            );
                            const record = {
                                id: 'cached::' + category.categoryName + '::' + queryKey + '::' + providerKey + '::' + index,
                                type: 'cached',
                                title: title,
                                url: url,
                                displayUrl: text(result?.displayUrl || result?.formattedUrl || url, ''),
                                description: description,
                                provider: text(providerKey, 'unknown'),
                                sourceCard: category.categoryName,
                                sourceIdentity: {
                                    kind: 'cached',
                                    sourceQuery: sourceQuery,
                                    provider: text(providerKey, 'unknown')
                                },
                                workspaceId: preferredWorkspaceId,
                                workspaceIds: workspaceIds,
                                categoryName: category.categoryName,
                                path: path,
                                updatedAt: Number(entry?.updatedAt || entry?.createdAt || 0),
                                groupId: groupMeta.groupId,
                                groupName: groupMeta.groupName,
                                groupHidden: groupMeta.hidden,
                                provenance: {
                                    kind: 'cached',
                                    sourceQuery: sourceQuery,
                                    provider: text(providerKey, 'unknown'),
                                    perSource: perSource
                                }
                            };
                            record.baseHealth = deriveBaseHealth(record);
                            record.searchableText = normalizeText([
                                record.title,
                                record.url,
                                record.description,
                                record.provider,
                                category.categoryName,
                                record.provenance.sourceQuery,
                                path.pathLabel
                            ].join(' '));
                            records.push(record);
                        });
                    });
                });
            } catch (error) {
                console.warn('[NexusIndex] Failed to index cache pool for', category.categoryName, error);
            }
        }

        return records;
    }

    async function buildKnowledgeRecords(categoryMap) {
        const searchInternals = window.EveOS?.API?.SearchInternals;
        const locators = ns.Locators || {};
        if (!searchInternals?.buildSourceCacheGroups) return [];

        const activeWorkspace = text(readConfig().activeWorkspace, 'main');
        const records = [];
        const groupedByCategory = new Map();

        Array.from(categoryMap.values()).forEach(function (entry) {
            const key = entry.categoryName;
            if (!groupedByCategory.has(key)) {
                groupedByCategory.set(key, {
                    categoryName: key,
                    workspaceIds: new Set()
                });
            }
            entry.workspaceIds.forEach(function (workspaceId) {
                groupedByCategory.get(key).workspaceIds.add(workspaceId);
            });
        });

        for (const category of groupedByCategory.values()) {
            try {
                const groups = await searchInternals.buildSourceCacheGroups(category.categoryName, {
                    includeUncachedKnowledge: true
                });
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
                toArray(groups).forEach(function (group, index) {
                    const providerSummary = searchInternals.summarizeApiGroupProviders
                        ? searchInternals.summarizeApiGroupProviders(group?.apiEntries || [])
                        : {};
                    const wikiTitle = text(group?.wikipediaEntry?.title || group?.title, '');
                    const fandomDomain = text(group?.fandomEntry?.domain, '');
                    const record = {
                        id: 'knowledge::' + category.categoryName + '::' + index,
                        type: 'knowledge',
                        title: text(group?.title, 'Untitled Source Group'),
                        url: wikiTitle
                            ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(wikiTitle.replace(/\s+/g, '_'))
                            : (fandomDomain ? 'https://' + fandomDomain.replace(/^https?:\/\//i, '') : ''),
                        displayUrl: fandomDomain || wikiTitle,
                        description: text([
                            wikiTitle ? 'Wikipedia' : '',
                            fandomDomain ? 'Fandom' : '',
                            Object.keys(providerSummary).length ? ('API: ' + Object.keys(providerSummary).join(', ')) : ''
                        ].filter(Boolean).join(' | '), 'Saved source graph'),
                        provider: 'knowledge',
                        sourceCard: category.categoryName,
                        sourceIdentity: {
                            kind: 'knowledge',
                            wikipediaTitle: wikiTitle,
                            fandomDomain: fandomDomain
                        },
                        workspaceId: preferredWorkspaceId,
                        workspaceIds: workspaceIds,
                        categoryName: category.categoryName,
                        path: path,
                        updatedAt: Number(group?.updatedAt || 0),
                        groupId: groupMeta.groupId,
                        groupName: groupMeta.groupName,
                        groupHidden: groupMeta.hidden,
                        provenance: {
                            kind: 'knowledge',
                            aliases: toArray(group?.aliases).map(function (value) { return text(value, ''); }).filter(Boolean),
                            wikipediaTitle: wikiTitle,
                            fandomDomain: fandomDomain,
                            apiQueries: toArray(group?.apiEntries).map(function (entry) { return text(entry?.query, ''); }).filter(Boolean),
                            providers: Object.keys(providerSummary),
                            providerSummary: providerSummary
                        }
                    };
                    record.baseHealth = deriveBaseHealth(record);
                    record.searchableText = normalizeText([
                        record.title,
                        record.description,
                        record.displayUrl,
                        record.provenance.aliases.join(' '),
                        record.provenance.apiQueries.join(' '),
                        category.categoryName,
                        path.pathLabel
                    ].join(' '));
                    records.push(record);
                });
            } catch (error) {
                console.warn('[NexusIndex] Failed to index source graph for', category.categoryName, error);
            }
        }

        return records;
    }

    async function buildSnapshot(reason) {
        const links = readLinks().filter(Boolean);
        const categoryMap = buildCategoryMap(links);
        const records = []
            .concat(buildCardRecords(categoryMap))
            .concat(buildBookmarkRecords(links))
            .concat(buildLibraryRecords())
            .concat(await buildKnowledgeRecords(categoryMap))
            .concat(await buildCachedRecords(categoryMap));

        const providers = new Set();
        records.forEach(function (record) {
            if (record?.provider && !LOCAL_TYPES.has(record.provider)) providers.add(record.provider);
            toArray(record?.provenance?.providers).forEach(function (provider) {
                if (provider) providers.add(provider);
            });
        });

        return {
            version: INDEX_VERSION,
            builtAt: now(),
            reason: text(reason, 'manual'),
            stats: {
                totalRecords: records.length,
                cardCount: records.filter(function (record) { return record.type === 'card'; }).length,
                bookmarkCount: records.filter(function (record) { return record.type === 'bookmark'; }).length,
                libraryCount: records.filter(function (record) { return record.type === 'library'; }).length,
                knowledgeCount: records.filter(function (record) { return record.type === 'knowledge'; }).length,
                cachedCount: records.filter(function (record) { return record.type === 'cached'; }).length,
                providerCount: providers.size,
                workspaceCount: new Set(records.map(function (record) { return record.workspaceId; }).filter(Boolean)).size
            },
            records: records
        };
    }

    async function loadPersistedSnapshot() {
        if (state.loaded) return state.snapshot;
        state.loaded = true;

        let snapshot = null;
        try {
            if (window.StorageManager?.loadDataAsync) {
                snapshot = await window.StorageManager.loadDataAsync(STORAGE_MANAGER_KEY, null, null);
            }
        } catch (error) {
            console.warn('[NexusIndex] StorageManager load failed:', error);
        }

        if (!snapshot) {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                snapshot = raw ? JSON.parse(raw) : null;
            } catch (error) {
                console.warn('[NexusIndex] localStorage load failed:', error);
            }
        }

        if (snapshot?.version === INDEX_VERSION && Array.isArray(snapshot.records)) {
            state.snapshot = snapshot;
            state.dirty = false;
        }

        return state.snapshot;
    }

    async function persistSnapshot(snapshot) {
        try {
            if (window.StorageManager?.saveDataAsync) {
                await window.StorageManager.saveDataAsync(STORAGE_MANAGER_KEY, snapshot, null);
            }
        } catch (error) {
            console.warn('[NexusIndex] StorageManager save failed:', error);
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        } catch (error) {
            console.warn('[NexusIndex] localStorage save failed:', error);
        }
    }

    function markDirty(reason) {
        state.dirty = true;
        state.lastReason = text(reason, 'state-mutated');
    }

    function shouldTrackStorageKey(key) {
        const normalized = text(key, '');
        return !!normalized && normalized !== STORAGE_MANAGER_KEY && SEARCH_STORAGE_KEYS.has(normalized);
    }

    function wrapMutationMethod(target, methodName, onSuccess) {
        if (!target || typeof target[methodName] !== 'function') return false;
        const original = target[methodName];
        if (original.__nexusIndexWrapped) return true;

        const wrapped = function () {
            const args = Array.prototype.slice.call(arguments);
            const result = original.apply(this, args);
            if (result && typeof result.then === 'function') {
                return result.then(function (value) {
                    onSuccess(args, value);
                    return value;
                });
            }
            onSuccess(args, result);
            return result;
        };

        wrapped.__nexusIndexWrapped = true;
        wrapped.__nexusIndexOriginal = original;
        target[methodName] = wrapped;
        return true;
    }

    function installMutationHooks() {
        const searchInternals = window.EveOS?.API?.SearchInternals;
        wrapMutationMethod(searchInternals || {}, 'saveScopedStorageValueAsync', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('scoped-storage:' + key);
            }
        });

        const cacheApi = window.EveOS?.API?.Cache;
        wrapMutationMethod(cacheApi || {}, 'storeQuery', function () {
            markDirty('cache-store-query');
        });
        wrapMutationMethod(cacheApi || {}, 'storePool', function () {
            markDirty('cache-store-pool');
        });

        const storageManager = window.StorageManager;
        wrapMutationMethod(storageManager || {}, 'saveDataAsync', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('storage-save:' + key);
            }
        });
        wrapMutationMethod(storageManager || {}, 'saveData', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('storage-save:' + key);
            }
        });
    }

    async function ensureFresh(options) {
        await loadPersistedSnapshot();
        const force = !!options?.force;
        const snapshotAge = state.snapshot ? (now() - Number(state.snapshot.builtAt || 0)) : Number.POSITIVE_INFINITY;
        if (!force && state.snapshot && !state.dirty && snapshotAge < SNAPSHOT_MAX_AGE_MS) {
            return state.snapshot;
        }
        return rebuild(options);
    }

    async function rebuild(options) {
        if (state.buildPromise) return state.buildPromise;
        const reason = text(options?.reason || state.lastReason, 'manual');
        state.buildPromise = buildSnapshot(reason)
            .then(async function (snapshot) {
                state.snapshot = snapshot;
                state.dirty = false;
                state.lastReason = reason;
                await persistSnapshot(snapshot);
                return snapshot;
            })
            .finally(function () {
                state.buildPromise = null;
            });
        return state.buildPromise;
    }

    function matchesScope(record, scope) {
        if (!record) return false;
        if (!scope || (!scope.workspaceId && !scope.categoryName)) return true;
        const workspaceIds = getWorkspaceIdsInScope(scope);
        const recordWorkspaceIds = toArray(record.workspaceIds).length
            ? toArray(record.workspaceIds).map(function (value) { return text(value, ''); })
            : [text(record.workspaceId, '')];

        if (workspaceIds && !recordWorkspaceIds.some(function (workspaceId) { return workspaceIds.has(workspaceId); })) {
            return false;
        }
        if (scope.categoryName && text(record.categoryName, 'Unsorted') !== text(scope.categoryName, 'Unsorted')) {
            return false;
        }
        return true;
    }

    function isCollapsedCategory(configRef, workspaceId, categoryName, key) {
        const items = toArray(configRef?.[key]);
        const scopedKey = getScopedKey(workspaceId, categoryName);
        return items.includes(scopedKey) || items.includes(categoryName);
    }

    function computeVisibility(record) {
        const cfg = readConfig();
        const reasons = [];
        let stateLabel = 'visible';
        const recordWorkspaceIds = toArray(record?.workspaceIds).length
            ? toArray(record.workspaceIds).map(function (value) { return text(value, ''); })
            : [text(record?.workspaceId, 'main')];
        const activeWorkspace = text(cfg.activeWorkspace, 'main');
        const focus = getCurrentFocusCategory();
        const inUnidex = text(cfg.viewMode, 'grid') === 'unidex';

        if (record?.baseHealth?.state === 'broken') {
            stateLabel = 'broken';
            reasons.push.apply(reasons, toArray(record.baseHealth.reasons));
        }

        if (!inUnidex && !recordWorkspaceIds.includes(activeWorkspace)) {
            stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
            reasons.push('Lives in another tab: ' + text(record?.path?.workspaceLabel, record?.workspaceId));
            if (!cfg.showInactiveTabs) {
                reasons.push('Inactive tabs are hidden in the sidebar.');
            }
        }

        if (record?.groupHidden && !cfg.showHiddenSidebarGroups) {
            stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
            reasons.push('Workspace belongs to hidden group "' + text(record.groupName, 'Unnamed Group') + '".');
        }

        if (!inUnidex && focus && record?.categoryName && text(record.categoryName, '') !== focus) {
            if (stateLabel === 'visible') stateLabel = 'indirect';
            reasons.push('Current card focus is "' + focus + '".');
        }

        if (record?.type === 'bookmark' || record?.type === 'card' || record?.type === 'library') {
            if (isCollapsedCategory(cfg, text(record.workspaceId, 'main'), text(record.categoryName, 'Unsorted'), 'collapsed')) {
                stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
                reasons.push('Card is collapsed.');
            }
        }

        if (record?.type === 'bookmark') {
            if (isCollapsedCategory(cfg, text(record.workspaceId, 'main'), text(record.categoryName, 'Unsorted'), 'linksCollapsed')) {
                stateLabel = stateLabel === 'broken' ? stateLabel : 'hidden';
                reasons.push('Bookmark list is collapsed for this card.');
            }
        }

        if (!reasons.length) {
            reasons.push('Visible in the current dashboard state.');
        }

        return {
            state: stateLabel,
            label: stateLabel === 'broken'
                ? 'Broken'
                : stateLabel === 'hidden'
                    ? 'Hidden'
                    : stateLabel === 'indirect'
                        ? 'Indirect'
                        : 'Visible',
            reasons: reasons
        };
    }

    function computeHealth(record) {
        const freshness = computeFreshness(record?.updatedAt);
        const reasons = toArray(record?.baseHealth?.reasons).slice();
        let stateLabel = text(record?.baseHealth?.state, 'healthy') || 'healthy';

        if ((record?.type === 'cached' || record?.type === 'knowledge' || record?.type === 'library') && freshness.state === 'stale' && stateLabel !== 'broken') {
            stateLabel = 'warning';
            reasons.push('Source data is stale.');
        }
        if ((record?.type === 'cached' || record?.type === 'knowledge' || record?.type === 'library') && freshness.state === 'unknown' && stateLabel !== 'broken') {
            stateLabel = 'warning';
            reasons.push('No freshness timestamp is available.');
        }

        return {
            state: stateLabel,
            label: stateLabel === 'broken' ? 'Broken' : stateLabel === 'warning' ? 'Warning' : 'Healthy',
            reasons: reasons
        };
    }

    function looseFuzzyMatch(haystack, needle) {
        if (!haystack || !needle || needle.length < 3) return false;
        let h = 0;
        let n = 0;
        while (h < haystack.length && n < needle.length) {
            if (haystack[h] === needle[n]) n += 1;
            h += 1;
        }
        return n === needle.length;
    }

    function scoreField(value, query) {
        if (!value || !query) return 0;
        if (value === query) return 140;
        if (value.startsWith(query)) return 110;
        if (value.includes(query)) return 75;
        if (looseFuzzyMatch(value, query)) return 18;
        return 0;
    }

    function computeScore(record, query, scope) {
        const q = normalizeText(query);
        if (!q) return 0;

        let score = 0;
        const title = normalizeText(record?.title);
        const description = normalizeText(record?.description);
        const displayUrl = normalizeText(record?.displayUrl || record?.url);
        const pathLabel = normalizeText(record?.path?.pathLabel);
        const provider = normalizeText(record?.provider);
        const searchText = normalizeText(record?.searchableText);

        score += scoreField(title, q);
        score += Math.floor(scoreField(pathLabel, q) * 0.6);
        score += Math.floor(scoreField(displayUrl, q) * 0.45);
        score += Math.floor(scoreField(description, q) * 0.35);
        score += Math.floor(scoreField(provider, q) * 0.2);

        if (!score && searchText.includes(q)) score += 26;
        if (!score && looseFuzzyMatch(searchText.replace(/\s+/g, ''), q.replace(/\s+/g, ''))) score += 12;

        if (scope?.workspaceId && matchesScope(record, { workspaceId: scope.workspaceId })) score += 14;
        if (scope?.categoryName && text(record?.categoryName, '') === text(scope.categoryName, '')) score += 18;
        if (record?.type === 'card') score += 22;
        if (record?.type === 'bookmark') score += 16;
        if (record?.type === 'library') score += 14;
        if (record?.library?.linked) score += 8;
        if (record?.provenance?.done) score -= 4;

        return score;
    }

    async function search(query, scope, settings) {
        const snapshot = await ensureFresh();
        const q = normalizeText(query);
        if (!q) return { records: [], facets: {}, stats: {}, snapshot: snapshot };

        const allowedTypes = new Set();
        const vectors = settings?.activeVectors || {};
        if (vectors.bookmarks) {
            allowedTypes.add('bookmark');
            allowedTypes.add('card');
            allowedTypes.add('library');
        }
        if (vectors.knowledge) allowedTypes.add('knowledge');
        if (vectors.cachedResults) allowedTypes.add('cached');

        const records = [];
        snapshot.records.forEach(function (record) {
            if (!record || !allowedTypes.has(record.type) || !matchesScope(record, scope)) return;
            const score = computeScore(record, q, scope);
            if (score <= 0) return;
            const visibility = computeVisibility(record);
            const freshness = computeFreshness(record.updatedAt);
            const health = computeHealth(record);
            records.push(Object.assign({}, record, {
                score: score,
                visibility: visibility,
                visibilityState: visibility.state,
                freshness: freshness,
                freshnessState: freshness.state,
                health: health,
                healthState: health.state
            }));
        });

        records.sort(function (left, right) {
            return Number(right.score || 0) - Number(left.score || 0)
                || Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
                || text(left.title, '').localeCompare(text(right.title, ''));
        });

        const facets = {
            tabs: {},
            cards: {},
            sourceTypes: {},
            providers: {},
            freshness: {},
            visibility: {},
            health: {}
        };

        records.forEach(function (record) {
            const workspaceLabel = text(record?.path?.workspaceLabel, record?.workspaceId);
            const cardLabel = text(record?.categoryName, 'Unsorted');
            const typeLabel = text(record?.type, 'result');
            const providerLabel = text(record?.provider, 'unknown');
            const freshnessLabel = text(record?.freshness?.label, 'Unknown');
            const visibilityLabel = text(record?.visibility?.label, 'Visible');
            const healthLabel = text(record?.health?.label, 'Healthy');

            facets.tabs[workspaceLabel] = (facets.tabs[workspaceLabel] || 0) + 1;
            facets.cards[cardLabel] = (facets.cards[cardLabel] || 0) + 1;
            facets.sourceTypes[typeLabel] = (facets.sourceTypes[typeLabel] || 0) + 1;
            facets.providers[providerLabel] = (facets.providers[providerLabel] || 0) + 1;
            facets.freshness[freshnessLabel] = (facets.freshness[freshnessLabel] || 0) + 1;
            facets.visibility[visibilityLabel] = (facets.visibility[visibilityLabel] || 0) + 1;
            facets.health[healthLabel] = (facets.health[healthLabel] || 0) + 1;
        });

        return {
            records: records,
            facets: facets,
            stats: snapshot.stats || {},
            snapshot: snapshot
        };
    }

    function getStats() {
        return state.snapshot?.stats || null;
    }

    window.addEventListener('eve:state-mutated', function (event) {
        markDirty(event?.detail?.source || 'state-mutated');
    });
    window.addEventListener('eve:library-link-updated', function () {
        markDirty('library-link-updated');
    });
    window.addEventListener('modulesRegistered', installMutationHooks);
    window.addEventListener('eve:storage-backend', installMutationHooks);
    installMutationHooks();

    ns.Index = {
        ensureFresh,
        rebuild,
        search,
        getStats,
        markDirty,
        computeFreshness,
        computeVisibility,
        computeHealth
    };
})();
