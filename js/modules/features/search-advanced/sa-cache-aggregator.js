window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const Cache = window.EveOS.API?.Cache;
    const Scope = ns.CacheAggregatorScope || {};
    const Records = ns.CacheAggregatorRecords || {};
    const Diagnostics = ns.CacheAggregatorDiagnostics || {};

    const getWorkspaceIdsInScope = Scope.getWorkspaceIdsInScope || function () { return null; };
    const getScopedLinks = Scope.getScopedLinks || function () { return []; };
    const getVisibleCategories = Scope.getVisibleCategories || function () { return []; };
    const normalizePoolEntries = Records.normalizePoolEntries || function () { return []; };
    const getResultTitle = Records.getResultTitle || function () { return 'Untitled'; };
    const getResultUrl = Records.getResultUrl || function () { return ''; };
    const getResultDescription = Records.getResultDescription || function () { return ''; };
    const extractCachedResults = Records.extractCachedResults || function () { return []; };
    const getKnownWorkspaceIds = Diagnostics.getKnownWorkspaceIds || function () { return new Set(); };
    const detectOrphanedLinks = Diagnostics.detectOrphanedLinks || function () { return { orphaned: [] }; };
    const rescueOrphanedLinks = Diagnostics.rescueOrphanedLinks || function () { return { rescued: 0 }; };
    const describeScopeLabel = Diagnostics.describeScopeLabel || function () { return 'All Tabs'; };

    function getActiveWorkspace() {
        return String(
            window.eveState?.config?.activeWorkspace
            || window.config?.activeWorkspace
            || 'main'
        ).trim() || 'main';
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

                if (!isMatch) return;

                matches.push({
                    query: entry.query,
                    categoryName: entry.categoryName,
                    title: titleText,
                    url: urlText,
                    description: descriptionText,
                    provider: result.provider || result.source || '',
                    updatedAt: entry.updatedAt,
                    score: (title.includes(q) ? 3 : 0)
                        + (url.includes(q) ? 2 : 0)
                        + (description.includes(q) ? 1 : 0)
                        + (queryMatch ? 1 : 0),
                    raw: result,
                    workspaceId: path?.workspaceId || scope?.workspaceId || getActiveWorkspace(),
                    path: path,
                    sourceIdentity: {
                        kind: 'cached-result',
                        provider: result.provider || result.source || '',
                        query: entry.query,
                        categoryName: entry.categoryName
                    }
                });
            });
        });

        const seen = new Set();
        const deduped = [];
        matches.sort(function (a, b) { return b.score - a.score; });
        matches.forEach(function (m) {
            const key = [
                String(m.url || '').toLowerCase(),
                String(m.title || '').toLowerCase(),
                String(m.categoryName || '').toLowerCase()
            ].join('|');
            if (seen.has(key)) return;
            seen.add(key);
            deduped.push(m);
        });

        return deduped.slice(0, 80);
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
            if (!isMatch) return;

            const workspaceId = String(link.workspace || 'main').trim() || 'main';
            matches.push({
                title: link.title || link.name || link.url || 'Untitled',
                url: link.url || '',
                description: notes,
                categoryName: category,
                workspaceId: workspaceId,
                path: path,
                score: (title.includes(q) ? 3 : 0) + (url.includes(q) ? 2 : 0) + (notes.toLowerCase().includes(q) ? 1 : 0),
                raw: link,
                sourceIdentity: {
                    kind: 'bookmark',
                    linkId: link.id || '',
                    workspaceId: workspaceId,
                    categoryName: category
                },
                visibility: knownWorkspaces.has(workspaceId) ? 'visible' : 'orphaned',
                health: knownWorkspaces.has(workspaceId) ? 'ok' : 'orphaned',
                tags: Array.isArray(link.tags)
                    ? link.tags.map(function (tag) { return String(tag || '').trim(); }).filter(Boolean)
                    : []
            });
        });

        matches.sort(function (a, b) { return b.score - a.score; });
        return matches.slice(0, 120);
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
