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
            return Agg.searchAcrossCards(query, aggregated, scope);
        } catch (err) {
            console.warn('[NexusSearch] Cache search error:', err);
            return [];
        }
    }

    async function runKnowledgeVector(query, scope) {
        const Locators = ns.Locators;
        if (!Locators?.searchKnowledgeSources) return [];
        try {
            return await Locators.searchKnowledgeSources(query, scope);
        } catch (err) {
            console.warn('[NexusSearch] Knowledge search error:', err);
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
            knowledge: true,
            cachedResults: true,
            bookmarks: true
        };

        const promises = [];
        const vectorLabels = [];

        if (vectors.google && settings?.apiKey && settings?.cx) {
            promises.push(runGoogleVector(q, settings));
            vectorLabels.push('google');
        }

        if (vectors.knowledge) {
            promises.push(runKnowledgeVector(q, scope));
            vectorLabels.push('knowledge');
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

        const typePriority = {
            bookmark: 400,
            knowledge: 360,
            cached: 320,
            google: 120
        };
        allResults.sort(function (left, right) {
            const leftRank = Number(typePriority[left?.type] || 0) + (Number(left?.score || 0) * 10);
            const rightRank = Number(typePriority[right?.type] || 0) + (Number(right?.score || 0) * 10);
            return rightRank - leftRank
                || Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0)
                || String(left?.title || '').localeCompare(String(right?.title || ''));
        });

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
        runKnowledgeVector,
        runCacheVector,
        runBookmarkVector
    };
})();
