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
        buildFolderRecords,
        buildSmartViewRecords,
        buildLibraryRecords
    } = local;

    function buildCategoryScopeMap(categoryMap) {
        const groupedByCategory = new Map();
        Array.from(categoryMap.values()).forEach(function (entry) {
            const key = entry.categoryName;
            if (!groupedByCategory.has(key)) {
                groupedByCategory.set(key, {
                    categoryName: key,
                    workspaceIds: new Set(),
                    linkCount: 0
                });
            }
            entry.workspaceIds.forEach(function (workspaceId) {
                groupedByCategory.get(key).workspaceIds.add(workspaceId);
            });
            groupedByCategory.get(key).linkCount += Number(entry.linkCount || 0);
        });
        return groupedByCategory;
    }

    function filterCategoryMap(categoryMap, categoryNames) {
        const allowedNames = new Set(
            toArray(categoryNames)
                .map(function (value) { return text(value, ''); })
                .filter(Boolean)
        );
        if (!allowedNames.size) return new Map();
        return new Map(
            Array.from(categoryMap.entries()).filter(function (entryPair) {
                return allowedNames.has(text(entryPair?.[1]?.categoryName, ''));
            })
        );
    }

    function buildCategoryScopeMeta(categoryName, workspaceIds) {
        const locators = ns.Locators || {};
        const normalizedWorkspaceIds = (Array.isArray(workspaceIds)
            ? workspaceIds
            : Array.from(workspaceIds || []))
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);
        const activeWorkspace = text(readConfig().activeWorkspace, 'main');
        const preferredWorkspaceId = normalizedWorkspaceIds.includes(activeWorkspace)
            ? activeWorkspace
            : text(normalizedWorkspaceIds[0], 'main');
        const path = locators.buildPathMeta
            ? locators.buildPathMeta({
                workspaceIds: normalizedWorkspaceIds,
                workspaceId: preferredWorkspaceId,
                categoryName: categoryName
            })
            : {
                workspaceId: preferredWorkspaceId,
                workspaceIds: normalizedWorkspaceIds,
                categoryName: categoryName,
                pathLabel: categoryName
            };
        const groupMeta = getWorkspaceGroupMeta(preferredWorkspaceId);
        return {
            categoryName: categoryName,
            workspaceIds: normalizedWorkspaceIds,
            preferredWorkspaceId: preferredWorkspaceId,
            path: path,
            groupMeta: groupMeta
        };
    }

    function buildLocalRecordBundle() {
        const links = readLinks().filter(Boolean);
        const categoryMap = buildCategoryMap(links);
        const records = []
            .concat(buildCardRecords(categoryMap))
            .concat(buildFolderRecords(links, categoryMap))
            .concat(buildSmartViewRecords ? buildSmartViewRecords(links, categoryMap) : [])
            .concat(buildBookmarkRecords(links))
            .concat(buildLibraryRecords());
        return {
            links: links,
            categoryMap: categoryMap,
            records: records
        };
    }

    function normalizeScopeKey(workspaceId, categoryName) {
        return text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
    }

    function buildScopedLocalRecordBundle(options) {
        const allLinks = readLinks().filter(Boolean);
        const allCategoryMap = buildCategoryMap(allLinks);
        const explicitScopes = toArray(options?.scopes);
        const explicitLinkIds = new Set(
            toArray(options?.linkIds)
                .map(function (value) { return text(value, ''); })
                .filter(Boolean)
        );
        const scopeKeys = new Set();

        explicitScopes.forEach(function (scope) {
            const workspaceId = text(scope?.workspaceId, '');
            const categoryName = text(scope?.categoryName, '');
            if (!workspaceId && !categoryName) return;
            if (workspaceId && categoryName) {
                scopeKeys.add(normalizeScopeKey(workspaceId, categoryName));
                return;
            }
            Array.from(allCategoryMap.values()).forEach(function (entry) {
                if (workspaceId && text(entry.workspaceId, '') !== workspaceId) return;
                if (categoryName && text(entry.categoryName, '') !== categoryName) return;
                scopeKeys.add(normalizeScopeKey(entry.workspaceId, entry.categoryName));
            });
        });

        if (explicitLinkIds.size) {
            allLinks.forEach(function (link) {
                if (!explicitLinkIds.has(text(link?.id, ''))) return;
                scopeKeys.add(normalizeScopeKey(link?.workspace, link?.category));
            });
        }

        const scopedCategoryMap = new Map(
            Array.from(allCategoryMap.entries()).filter(function (entryPair) {
                return scopeKeys.has(text(entryPair?.[0], ''));
            })
        );
        const scopedLinks = allLinks.filter(function (link) {
            const linkScopeKey = normalizeScopeKey(link?.workspace, link?.category);
            return scopeKeys.has(linkScopeKey) || explicitLinkIds.has(text(link?.id, ''));
        });
        const scopedLibraryRecords = buildLibraryRecords().filter(function (record) {
            return scopeKeys.has(normalizeScopeKey(record?.workspaceId, record?.categoryName));
        });
        const records = []
            .concat(buildCardRecords(scopedCategoryMap))
            .concat(buildFolderRecords(allLinks, scopedCategoryMap))
            .concat(buildSmartViewRecords ? buildSmartViewRecords(allLinks, scopedCategoryMap) : [])
            .concat(buildBookmarkRecords(scopedLinks))
            .concat(scopedLibraryRecords);

        return {
            links: scopedLinks,
            categoryMap: allCategoryMap,
            scopedCategoryMap: scopedCategoryMap,
            scopeKeys: Array.from(scopeKeys),
            linkIds: Array.from(explicitLinkIds),
            records: records
        };
    }

    function buildSnapshotStats(records) {
        const providers = new Set();
        const workspaceIds = new Set();
        const stats = {
            totalRecords: toArray(records).length,
            cardCount: 0,
            folderCount: 0,
            smartViewCount: 0,
            bookmarkCount: 0,
            libraryCount: 0,
            knowledgeCount: 0,
            cachedCount: 0,
            providerCount: 0,
            workspaceCount: 0
        };

        toArray(records).forEach(function (record) {
            const type = text(record?.type, '');
            if (type === 'card') stats.cardCount += 1;
            if (type === 'folder') stats.folderCount += 1;
            if (type === 'smartView') stats.smartViewCount += 1;
            if (type === 'bookmark') stats.bookmarkCount += 1;
            if (type === 'library') stats.libraryCount += 1;
            if (type === 'knowledge') stats.knowledgeCount += 1;
            if (type === 'cached') stats.cachedCount += 1;

            if (record?.provider && !LOCAL_TYPES.has(record.provider)) providers.add(record.provider);
            toArray(record?.provenance?.providers).forEach(function (provider) {
                if (provider) providers.add(provider);
            });
            if (record?.workspaceId) workspaceIds.add(record.workspaceId);
        });

        stats.providerCount = providers.size;
        stats.workspaceCount = workspaceIds.size;
        return stats;
    }

    function rebuildSourceSearchableText(record) {
        if (text(record?.type, '') === 'cached') {
            return normalizeText([
                record.title,
                record.url,
                record.description,
                record.provider,
                record.categoryName,
                record?.provenance?.sourceQuery,
                record?.path?.pathLabel
            ].join(' '));
        }

        return normalizeText([
            record.title,
            record.description,
            record.displayUrl,
            toArray(record?.provenance?.aliases).join(' '),
            toArray(record?.provenance?.apiQueries).join(' '),
            record.categoryName,
            record?.path?.pathLabel
        ].join(' '));
    }

    function rehydrateSourceRecords(records, categoryMap) {
        const sourceScopeMap = buildCategoryScopeMap(categoryMap);
        return toArray(records).map(function (record) {
            const type = text(record?.type, '');
            if (type !== 'knowledge' && type !== 'cached') return null;

            const scopeMeta = buildCategoryScopeMeta(
                text(record?.categoryName, ''),
                sourceScopeMap.get(text(record?.categoryName, ''))?.workspaceIds
            );
            if (!scopeMeta.workspaceIds.length) return null;

            const refreshedRecord = Object.assign({}, record, {
                workspaceId: scopeMeta.preferredWorkspaceId,
                workspaceIds: scopeMeta.workspaceIds,
                categoryName: scopeMeta.categoryName,
                sourceCard: scopeMeta.categoryName,
                path: scopeMeta.path,
                groupId: scopeMeta.groupMeta.groupId,
                groupName: scopeMeta.groupMeta.groupName,
                groupHidden: scopeMeta.groupMeta.hidden
            });
            refreshedRecord.baseHealth = deriveBaseHealth(refreshedRecord);
            refreshedRecord.searchableText = rebuildSourceSearchableText(refreshedRecord);
            return refreshedRecord;
        }).filter(Boolean);
    }

    async function buildSourceRecordBundle(categoryMap, options = {}) {
        const includeKnowledge = options?.includeKnowledge !== false;
        const includeCached = options?.includeCached !== false;
        const knowledgeRecords = includeKnowledge
            ? await buildKnowledgeRecords(categoryMap)
            : [];
        const cachedRecords = includeCached
            ? await buildCachedRecords(categoryMap)
            : [];
        return {
            knowledgeRecords: knowledgeRecords,
            cachedRecords: cachedRecords,
            records: knowledgeRecords.concat(cachedRecords)
        };
    }

    async function buildCachedRecords(categoryMap) {
        const cache = window.EveOS?.API?.Cache;
        const cacheRuntime = window.EveOS?.API?.CacheRuntime || {};
        if (!cache?.loadPool) return [];

        const records = [];
        const groupedByCategory = buildCategoryScopeMap(categoryMap);

        for (const category of groupedByCategory.values()) {
            try {
                const scopeMeta = buildCategoryScopeMeta(
                    category.categoryName,
                    Array.from(category.workspaceIds)
                );
                const pool = await cache.loadPool(category.categoryName);
                if (!pool || typeof pool !== 'object') continue;
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
                                workspaceId: scopeMeta.preferredWorkspaceId,
                                workspaceIds: scopeMeta.workspaceIds,
                                categoryName: category.categoryName,
                                path: scopeMeta.path,
                                updatedAt: Number(entry?.updatedAt || entry?.createdAt || 0),
                                groupId: scopeMeta.groupMeta.groupId,
                                groupName: scopeMeta.groupMeta.groupName,
                                groupHidden: scopeMeta.groupMeta.hidden,
                                provenance: {
                                    kind: 'cached',
                                    sourceQuery: sourceQuery,
                                    provider: text(providerKey, 'unknown'),
                                    perSource: perSource,
                                    sourceOnly: Number(category.linkCount || 0) <= 0
                                }
                            };
                            record.baseHealth = deriveBaseHealth(record);
                            record.searchableText = rebuildSourceSearchableText(record);
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
        if (!searchInternals?.buildSourceCacheGroups) return [];

        const records = [];
        const groupedByCategory = buildCategoryScopeMap(categoryMap);

        for (const category of groupedByCategory.values()) {
            try {
                const scopeMeta = buildCategoryScopeMeta(
                    category.categoryName,
                    Array.from(category.workspaceIds)
                );
                const groups = await searchInternals.buildSourceCacheGroups(category.categoryName, {
                    includeUncachedKnowledge: true
                });
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
                        workspaceId: scopeMeta.preferredWorkspaceId,
                        workspaceIds: scopeMeta.workspaceIds,
                        categoryName: category.categoryName,
                        path: scopeMeta.path,
                        updatedAt: Number(group?.updatedAt || 0),
                        groupId: scopeMeta.groupMeta.groupId,
                        groupName: scopeMeta.groupMeta.groupName,
                        groupHidden: scopeMeta.groupMeta.hidden,
                        provenance: {
                            kind: 'knowledge',
                            aliases: toArray(group?.aliases).map(function (value) { return text(value, ''); }).filter(Boolean),
                            wikipediaTitle: wikiTitle,
                            fandomDomain: fandomDomain,
                            apiQueries: toArray(group?.apiEntries).map(function (entry) { return text(entry?.query, ''); }).filter(Boolean),
                            providers: Object.keys(providerSummary),
                            providerSummary: providerSummary,
                            sourceOnly: Number(category.linkCount || 0) <= 0
                        }
                    };
                    record.baseHealth = deriveBaseHealth(record);
                    record.searchableText = rebuildSourceSearchableText(record);
                    records.push(record);
                });
            } catch (error) {
                console.warn('[NexusIndex] Failed to index source graph for', category.categoryName, error);
            }
        }

        return records;
    }

    async function buildSnapshot(reason) {
        const localBundle = buildLocalRecordBundle();
        const sourceBundle = await buildSourceRecordBundle(localBundle.categoryMap);
        const records = []
            .concat(localBundle.records)
            .concat(sourceBundle.records);

        return {
            version: INDEX_VERSION,
            builtAt: now(),
            reason: text(reason, 'manual'),
            stats: buildSnapshotStats(records),
            records: records
        };
    }

    ns.IndexRecordBuildersSources = {
        buildCachedRecords,
        buildKnowledgeRecords,
        buildLocalRecordBundle,
        buildScopedLocalRecordBundle,
        buildSourceRecordBundle,
        buildSnapshotStats,
        filterCategoryMap,
        rehydrateSourceRecords,
        buildSnapshot
    };
})();
