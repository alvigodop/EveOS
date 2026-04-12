window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;

    async function runGoogleVector(query, settings) {
        const Api = ns.Api;
        if (!Api || typeof Api.runSearch !== 'function') return [];
        try {
            const data = await Api.runSearch(query, settings);
            const items = Array.isArray(data?.items) ? data.items : [];
            return items.map(function (item) {
                return {
                    type: 'google',
                    title: item.title || 'Untitled',
                    url: item.link || '',
                    description: item.snippet || '',
                    displayUrl: item.formattedUrl || item.link || '',
                    provider: 'google',
                    sourceCard: '',
                    score: 5
                };
            });
        } catch (err) {
            console.warn('[NexusSearch] Google CSE error:', err.message);
            return [];
        }
    }

    async function runCacheVector(query, scope) {
        const Agg = ns.CacheAggregator;
        if (!Agg) return [];
        try {
            const aggregated = await Agg.aggregateAllCaches(scope);
            return Agg.searchAcrossCards(query, aggregated);
        } catch (err) {
            console.warn('[NexusSearch] Cache search error:', err);
            return [];
        }
    }

    function runBookmarkVector(query, scope) {
        const Agg = ns.CacheAggregator;
        if (!Agg) return [];
        try {
            return Agg.searchBookmarks(query, scope);
        } catch (err) {
            console.warn('[NexusSearch] Bookmark search error:', err);
            return [];
        }
    }

    async function runMultiVectorSearch(query, settings, scope) {
        const q = String(query || '').trim();
        if (!q) return { results: [], stats: {} };

        const vectors = settings?.activeVectors || {
            google: true,
            cachedResults: true,
            bookmarks: true
        };

        const promises = [];
        const vectorLabels = [];

        if (vectors.google && settings?.apiKey && settings?.cx) {
            promises.push(runGoogleVector(q, settings));
            vectorLabels.push('google');
        }

        if (vectors.cachedResults) {
            promises.push(runCacheVector(q, scope));
            vectorLabels.push('cached');
        }

        if (vectors.bookmarks) {
            promises.push(runBookmarkVector(q, scope));
            vectorLabels.push('bookmarks');
        }

        const settled = await Promise.allSettled(promises);
        const allResults = [];
        const vectorStats = {};

        settled.forEach(function (result, idx) {
            const label = vectorLabels[idx];
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                vectorStats[label] = result.value.length;
                result.value.forEach(function (r) { allResults.push(r); });
            } else {
                vectorStats[label] = 0;
            }
        });

        // Sort: Google first (score 5), then by individual score
        allResults.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });

        return {
            results: allResults,
            stats: vectorStats,
            query: q,
            scope: scope || null,
            timestamp: Date.now()
        };
    }

    ns.SearchVectors = {
        runMultiVectorSearch,
        runGoogleVector,
        runCacheVector,
        runBookmarkVector
    };
})();
