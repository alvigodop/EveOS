window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordBuildersSources) return;

    const shared = ns.IndexShared;
    const local = ns.IndexRecordBuildersLocal;
    if (!shared || !local) return;

    const {
        INDEX_VERSION,
        LOCAL_TYPES,
        now,
        text,
        normalizeText,
        toArray,
        readConfig,
        readLinks,
        getWorkspaceGroupMeta,
        deriveBaseHealth
    } = shared;
    const {
        buildCategoryMap,
        buildCardRecords,
        buildBookmarkRecords,
        buildLibraryRecords
    } = local;

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

    ns.IndexRecordBuildersSources = {
        buildCachedRecords,
        buildKnowledgeRecords,
        buildSnapshot
    };
})();
