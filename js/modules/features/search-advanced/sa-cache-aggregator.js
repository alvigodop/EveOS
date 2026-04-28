window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const Cache = window.EveOS.API?.Cache;

    // --- Scope helpers ---
    // scope = { workspaceId?, categoryName? }
    // no scope / empty = all tabs, all cards
    // workspaceId only = all cards in that tab + its sub-tabs
    // workspaceId + categoryName = single card

    function getWorkspaceIdsInScope(scope) {
        if (!scope?.workspaceId) return null; // null means "all"
        const wsId = String(scope.workspaceId).trim();
        const ids = new Set([wsId]);
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = window.eveState?.config?.workspaces
            || (typeof config !== 'undefined' ? config.workspaces : null)
            || [];
        if (helpers?.findById && helpers?.getDescendantIds) {
            const ws = helpers.findById(workspaces, wsId);
            if (ws) {
                helpers.getDescendantIds(ws).forEach(function (id) { ids.add(id); });
            }
        }
        return ids;
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function hasUsableDatapackSnapshot(indexApi) {
        if (!indexApi) return false;
        const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        return typeof indexApi.hasUsableSnapshot === 'function'
            ? indexApi.hasUsableSnapshot()
            : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    }

    function getDatapackSnapshot(indexApi) {
        if (!hasUsableDatapackSnapshot(indexApi) || typeof indexApi?.getSnapshot !== 'function') return null;
        return indexApi.getSnapshot();
    }

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function buildLiveLinkMap(links) {
        const map = new Map();
        (Array.isArray(links) ? links : []).forEach(function (link) {
            const linkId = String(link?.id || '').trim();
            if (linkId) map.set(linkId, link);
        });
        return map;
    }

    function getRecordWorkspaceIds(record) {
        const rawIds = Array.isArray(record?.workspaceIds) && record.workspaceIds.length
            ? record.workspaceIds
            : [record?.workspaceId];
        return rawIds.map(function (workspaceId) {
            return String(workspaceId || '').trim();
        }).filter(Boolean);
    }

    function matchesSnapshotScope(record, wsIds, catFilter) {
        if (!record) return false;
        if (wsIds && !getRecordWorkspaceIds(record).some(function (workspaceId) { return wsIds.has(workspaceId); })) {
            return false;
        }
        if (catFilter) {
            const recordCategory = String(record?.categoryName || record?.path?.categoryName || 'Unsorted').trim() || 'Unsorted';
            if (recordCategory !== catFilter) return false;
        }
        return true;
    }

    function getScopedLinks(scope) {
        const indexApi = getDatapackIndexApi();
        if (indexApi && hasUsableDatapackSnapshot(indexApi)
            && typeof indexApi.getScopedBookmarkLinkIds === 'function'
            && typeof indexApi.resolveBookmarkLink === 'function') {
            const liveLinkMap = buildLiveLinkMap(getLiveLinks());
            return indexApi.getScopedBookmarkLinkIds(scope || null).map(function (linkId) {
                const normalizedId = String(linkId || '').trim();
                if (!normalizedId) return null;
                return liveLinkMap.get(normalizedId) || indexApi.resolveBookmarkLink(normalizedId);
            }).filter(Boolean);
        }

        const links = getLiveLinks();
        const wsIds = getWorkspaceIdsInScope(scope);
        const catFilter = scope?.categoryName ? String(scope.categoryName).trim() : null;

        return links.filter(function (link) {
            if (!link) return false;
            if (wsIds && !wsIds.has(String(link.workspace || 'main').trim())) return false;
            if (catFilter && String(link.category || 'Unsorted').trim() !== catFilter) return false;
            return true;
        });
    }

    function getVisibleCategories(scope) {
        const indexApi = getDatapackIndexApi();
        const snapshot = getDatapackSnapshot(indexApi);
        const wsIds = getWorkspaceIdsInScope(scope);
        const catFilter = scope?.categoryName ? String(scope.categoryName).trim() : null;
        if (Array.isArray(snapshot?.records)) {
            const categories = new Set();
            snapshot.records.forEach(function (record) {
                if (String(record?.type || '').trim() !== 'card') return;
                if (!matchesSnapshotScope(record, wsIds, catFilter)) return;
                const categoryName = String(record?.categoryName || 'Unsorted').trim() || 'Unsorted';
                if (categoryName) categories.add(categoryName);
            });
            return Array.from(categories);
        }

        const scopedLinks = getScopedLinks(scope);
        const categories = new Set();
        scopedLinks.forEach(function (link) {
            const cat = String(link?.category || 'Unsorted').trim();
            if (cat) categories.add(cat);
        });
        return Array.from(categories);
    }

    function getActiveWorkspace() {
        return String(
            window.eveState?.config?.activeWorkspace
            || window.config?.activeWorkspace
            || 'main'
        ).trim() || 'main';
    }

    function normalizePoolEntries(pool) {
        if (!pool || typeof pool !== 'object') return [];

        const queryEntries = pool.queries && typeof pool.queries === 'object'
            ? pool.queries
            : pool;
        const orderedKeys = [];
        const seen = new Set();

        (Array.isArray(pool.order) ? pool.order : []).forEach(function (queryKey) {
            const key = String(queryKey || '').trim();
            if (!key || seen.has(key) || !queryEntries[key]) return;
            seen.add(key);
            orderedKeys.push(key);
        });

        Object.keys(queryEntries).forEach(function (queryKey) {
            if (queryKey === 'queries' || queryKey === 'order' || queryKey.charAt(0) === '_') return;
            if (!queryEntries[queryKey] || seen.has(queryKey)) return;
            seen.add(queryKey);
            orderedKeys.push(queryKey);
        });

        return orderedKeys.map(function (queryKey) {
            const entry = queryEntries[queryKey];
            if (!entry || typeof entry !== 'object') return null;
            return { queryKey: queryKey, entry: entry };
        }).filter(Boolean);
    }

    function getResultTitle(result) {
        return String(
            result?.title
            || result?.name
            || result?.attributes?.title?.en
            || result?.attributes?.title?.ja
            || result?.node?.title?.userPreferred
            || result?.volumeInfo?.title
            || 'Untitled'
        ).trim() || 'Untitled';
    }

    function getResultUrl(result) {
        return String(
            result?.url
            || result?.link
            || result?.siteUrl
            || result?.html_url
            || result?.attributes?.url
            || ''
        ).trim();
    }

    function getResultDescription(result) {
        return String(
            result?.description
            || result?.snippet
            || result?.synopsis
            || result?.attributes?.description?.en
            || result?.attributes?.description
            || result?.volumeInfo?.description
            || ''
        ).trim();
    }

    function safeStringify(value) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return '';
        }
    }

    function normalizeCachedResult(result, providerKey) {
        const item = result && typeof result === 'object' ? result : { title: String(result || '') };
        return Object.assign({}, item, {
            title: getResultTitle(item),
            url: getResultUrl(item),
            description: getResultDescription(item),
            _searchText: safeStringify(item),
            source: String(item.source || item.provider || providerKey || 'unknown').trim() || 'unknown',
            provider: String(item.provider || item.source || providerKey || 'unknown').trim() || 'unknown'
        });
    }

    function extractCachedResults(entry) {
        if (Array.isArray(entry?.results)) {
            return entry.results.map(function (result) {
                return normalizeCachedResult(result, result?.source || result?.provider);
            });
        }

        const cacheRuntime = window.EveOS?.API?.CacheRuntime || {};
        const sources = entry?.sources && typeof entry.sources === 'object' ? entry.sources : {};
        const perSource = entry?.summary?.perSource || {};
        const providerKeys = cacheRuntime.getSearchableProviderKeys
            ? cacheRuntime.getSearchableProviderKeys()
            : Object.keys(perSource);
        const results = [];

        providerKeys.forEach(function (providerKey) {
            const items = cacheRuntime.getProviderList
                ? cacheRuntime.getProviderList(sources, providerKey)
                : [];
            (Array.isArray(items) ? items : []).forEach(function (item) {
                results.push(normalizeCachedResult(item, providerKey));
            });
        });

        return results;
    }

    async function aggregateAllCaches(scope) {
        if (!Cache || typeof Cache.loadPool !== 'function') {
            return { entries: [], stats: { totalEntries: 0, totalProviders: 0, cardCount: 0 } };
        }

        const categories = getVisibleCategories(scope);
        const allEntries = [];
        const providerSet = new Set();

        for (let i = 0; i < categories.length; i++) {
            const categoryName = categories[i];
            try {
                const pool = await Cache.loadPool(categoryName);
                if (!pool || typeof pool !== 'object') continue;

                normalizePoolEntries(pool).forEach(function (record) {
                    const queryKey = record.queryKey;
                    const entry = record.entry;
                    const sources = entry.summary?.perSource || {};
                    const cachedResults = extractCachedResults(entry);
                    Object.keys(sources).forEach(function (provider) {
                        if (Number(sources[provider] || 0) > 0) providerSet.add(provider);
                    });
                    cachedResults.forEach(function (result) {
                        const provider = String(result?.source || result?.provider || '').trim();
                        if (provider) providerSet.add(provider);
                    });
                    allEntries.push({
                        query: String(entry.query || queryKey || '').trim(),
                        categoryName: categoryName,
                        updatedAt: Number(entry.lastUsedAt || entry.updatedAt || entry.createdAt || 0),
                        results: cachedResults,
                        summary: entry.summary || {},
                        perSource: sources
                    });
                });
            } catch (err) {
                console.warn('[NexusSearch] Failed to load cache for:', categoryName, err);
            }
        }

        return {
            entries: allEntries,
            stats: {
                totalEntries: allEntries.length,
                totalProviders: providerSet.size,
                cardCount: categories.length,
                providers: Array.from(providerSet)
            }
        };
    }

    function searchAcrossCards(query, aggregatedData, scope) {
        if (!query || !aggregatedData?.entries?.length) return [];

        const q = String(query).trim().toLowerCase();
        if (!q) return [];

        const matches = [];
        const locators = ns.Locators || null;

        aggregatedData.entries.forEach(function (entry) {
            const entryQuery = String(entry.query || '').toLowerCase();
            const queryMatch = entryQuery.includes(q) || q.includes(entryQuery);
            const path = locators?.resolveCategoryPath
                ? locators.resolveCategoryPath(entry.categoryName, scope)
                : null;

            const results = Array.isArray(entry.results) ? entry.results : [];
            results.forEach(function (result) {
                if (!result) return;
                const titleText = getResultTitle(result);
                const urlText = getResultUrl(result);
                const descriptionText = getResultDescription(result);
                const title = titleText.toLowerCase();
                const url = urlText.toLowerCase();
                const description = descriptionText.toLowerCase();
                const rawText = String(result.searchableText || result._searchText || '').toLowerCase();

                const isMatch = queryMatch
                    || title.includes(q)
                    || url.includes(q)
                    || description.includes(q)
                    || rawText.includes(q);

                if (isMatch) {
                    matches.push({
                        type: 'cached',
                        title: titleText,
                        url: urlText,
                        displayUrl: result.displayUrl || result.formattedUrl || urlText,
                        description: descriptionText,
                        provider: result.source || result.provider || 'unknown',
                        sourceCard: entry.categoryName,
                        sourceQuery: entry.query,
                        updatedAt: entry.updatedAt,
                        path: path,
                        provenance: {
                            kind: 'cached',
                            sourceQuery: entry.query,
                            provider: result.source || result.provider || 'unknown',
                            perSource: entry.perSource || {}
                        },
                        score: (title.includes(q) ? 3 : 0)
                            + (queryMatch ? 2 : 0)
                            + (url.includes(q) ? 1 : 0)
                            + (path?.ambiguousWorkspace ? 0 : 1)
                    });
                }
            });
        });

        const seen = new Set();
        const deduped = [];
        matches.sort(function (a, b) { return b.score - a.score; });
        matches.forEach(function (m) {
            const key = [
                String(m.url || m.title || '').toLowerCase(),
                String(m.path?.workspaceId || '').toLowerCase(),
                String(m.sourceCard || '').toLowerCase()
            ].join('::');
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(m);
            }
        });

        return deduped;
    }

    function searchBookmarks(query, scope) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return [];

        const scopedLinks = getScopedLinks(scope);
        const matches = [];
        const knownWorkspaces = getKnownWorkspaceIds();
        const locators = ns.Locators || null;

        scopedLinks.forEach(function (link) {
            if (!link) return;
            const title = String(link.title || link.name || '').toLowerCase();
            const url = String(link.url || '').toLowerCase();
            const category = String(link.category || 'Unsorted');
            const notes = String(link.notes || '');
            const path = locators?.buildBookmarkPath ? locators.buildBookmarkPath(link) : null;

            const isMatch = title.includes(q) || url.includes(q) || notes.toLowerCase().includes(q);
            if (isMatch) {
                matches.push({
                    type: 'bookmark',
                    title: link.title || link.name || link.url || 'Untitled',
                    url: link.url || '',
                    displayUrl: link.url || '',
                    description: notes,
                    provider: 'bookmark',
                    sourceCard: category,
                    sourceQuery: '',
                    updatedAt: 0,
                    path: path,
                    provenance: {
                        kind: 'bookmark',
                        linkId: String(link.id || '').trim(),
                        done: !!link.done,
                        orphaned: !knownWorkspaces.has(String(link.workspace || 'main').trim() || 'main'),
                        tags: Array.isArray(link.tags)
                            ? link.tags.map(function (tag) { return String(tag || '').trim(); }).filter(Boolean)
                            : []
                    },
                    score: (title.includes(q) ? 3 : 0) + (url.includes(q) ? 1 : 0) + (notes.toLowerCase().includes(q) ? 1 : 0)
                });
            }
        });

        matches.sort(function (a, b) { return b.score - a.score; });
        return matches;
    }

    function getKnownWorkspaceIds() {
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = window.eveState?.config?.workspaces
            || (typeof config !== 'undefined' ? config.workspaces : null)
            || [];
        if (helpers && typeof helpers.flattenIds === 'function') {
            return new Set(helpers.flattenIds(workspaces));
        }
        // Fallback: top-level only
        const ids = new Set();
        if (Array.isArray(workspaces)) {
            workspaces.forEach(function (ws) {
                if (ws?.id) ids.add(String(ws.id));
            });
        }
        if (ids.size === 0) ids.add('main');
        return ids;
    }

    function detectOrphanedLinks() {
        const indexApi = getDatapackIndexApi();
        const knownIds = getKnownWorkspaceIds();
        const snapshot = getDatapackSnapshot(indexApi);
        const orphaned = [];
        const orphanedByWorkspace = {};

        if (Array.isArray(snapshot?.records)) {
            snapshot.records.forEach(function (record, idx) {
                if (String(record?.type || '').trim() !== 'bookmark' || !record?.provenance?.orphaned) return;
                const linkId = String(record?.path?.linkId || record?.provenance?.linkId || '').trim();
                const workspaceId = String(record?.workspaceId || record?.path?.workspaceId || 'main').trim() || 'main';
                const resolved = linkId && typeof indexApi?.resolveBookmarkLink === 'function'
                    ? indexApi.resolveBookmarkLink(linkId)
                    : null;
                const link = resolved || {
                    id: linkId,
                    title: String(record?.title || 'Untitled').trim() || 'Untitled',
                    name: String(record?.title || 'Untitled').trim() || 'Untitled',
                    url: String(record?.url || '').trim(),
                    category: String(record?.categoryName || 'Unsorted').trim() || 'Unsorted',
                    workspace: workspaceId,
                    folderId: String(record?.path?.folderId || '').trim(),
                    notes: String(record?.description || '').trim()
                };
                orphaned.push({
                    index: idx,
                    link: link,
                    workspace: workspaceId,
                    category: String(link.category || 'Unsorted'),
                    title: link.title || link.name || link.url || 'Untitled',
                    url: link.url || ''
                });
                if (!orphanedByWorkspace[workspaceId]) orphanedByWorkspace[workspaceId] = [];
                orphanedByWorkspace[workspaceId].push(link);
            });

            return {
                orphaned: orphaned,
                orphanedByWorkspace: orphanedByWorkspace,
                totalOrphaned: orphaned.length,
                totalLinks: Number(snapshot?.stats?.bookmarkCount || getLiveLinks().length || 0),
                knownWorkspaces: Array.from(knownIds),
                ghostWorkspaces: Object.keys(orphanedByWorkspace)
            };
        }

        const links = getLiveLinks();

        links.forEach(function (link, idx) {
            if (!link) return;
            const wsId = String(link.workspace || 'main').trim();
            if (!knownIds.has(wsId)) {
                orphaned.push({
                    index: idx,
                    link: link,
                    workspace: wsId,
                    category: String(link.category || 'Unsorted'),
                    title: link.title || link.name || link.url || 'Untitled',
                    url: link.url || ''
                });
                if (!orphanedByWorkspace[wsId]) orphanedByWorkspace[wsId] = [];
                orphanedByWorkspace[wsId].push(link);
            }
        });

        return {
            orphaned: orphaned,
            orphanedByWorkspace: orphanedByWorkspace,
            totalOrphaned: orphaned.length,
            totalLinks: links.length,
            knownWorkspaces: Array.from(knownIds),
            ghostWorkspaces: Object.keys(orphanedByWorkspace)
        };
    }

    function rescueOrphanedLinks() {
        const links = getLiveLinks();
        const knownIds = getKnownWorkspaceIds();
        const workspaces = (typeof config !== 'undefined' ? config.workspaces : null)
            || window.eveState?.config?.workspaces
            || [];

        // Gather ghost workspace IDs
        const ghostIds = new Set();
        links.forEach(function (link) {
            if (!link) return;
            const wsId = String(link.workspace || 'main').trim();
            if (!knownIds.has(wsId)) ghostIds.add(wsId);
        });

        if (ghostIds.size === 0) return { rescued: 0, restoredTabs: [] };

        // Recreate each ghost workspace as a real tab
        const restoredTabs = [];
        ghostIds.forEach(function (ghostId) {
            // Count links in this ghost workspace
            var linkCount = 0;
            links.forEach(function (link) {
                if (link && String(link.workspace || 'main').trim() === ghostId) linkCount++;
            });

            // Generate a readable name from the ID
            var displayName = 'Recovered';
            var tsMatch = ghostId.match(/(\d{10,})/);
            if (tsMatch) {
                try {
                    var d = new Date(Number(tsMatch[1]));
                    if (!isNaN(d.getTime())) {
                        displayName = 'Recovered ' + (d.getMonth() + 1) + '/' + d.getDate();
                    }
                } catch (e) { /* ignore */ }
            }

            var newWs = {
                id: ghostId,
                name: displayName + ' (' + linkCount + ')',
                icon: '🔄',
                subTabs: []
            };

            workspaces.push(newWs);
            restoredTabs.push({ id: ghostId, name: newWs.name, linkCount: linkCount });
        });

        // Save
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof saveData === 'function') saveData();

        return {
            rescued: links.filter(function (l) { return l && ghostIds.has(String(l.workspace || 'main').trim()); }).length,
            restoredTabs: restoredTabs
        };
    }

    // Convenience: build a scope description string for UI display
    function describeScopeLabel(scope) {
        if (!scope || (!scope.workspaceId && !scope.categoryName)) return 'All Tabs';
        if (scope.categoryName && scope.workspaceId) return scope.categoryName;
        if (scope.workspaceId) {
            const helpers = window.EveWorkspaceHelpers;
            const workspaces = window.eveState?.config?.workspaces || [];
            const ws = helpers?.findById ? helpers.findById(workspaces, scope.workspaceId) : null;
            return ws?.name || scope.workspaceId;
        }
        return 'Scoped';
    }

    ns.CacheAggregator = {
        getVisibleCategories,
        getActiveWorkspace,
        getKnownWorkspaceIds,
        aggregateAllCaches,
        searchAcrossCards,
        searchBookmarks,
        detectOrphanedLinks,
        rescueOrphanedLinks,
        getScopedLinks,
        getWorkspaceIdsInScope,
        describeScopeLabel
    };
})();
