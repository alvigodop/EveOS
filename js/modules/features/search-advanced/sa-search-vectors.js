window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;

    function createTraceId() {
        return 'NX-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    }

    function nowMs() {
        return (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
    }

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
                    score: 5,
                    visibility: { state: 'visible', label: 'Visible', reasons: ['Web result is available directly in the search results.'] },
                    visibilityState: 'visible',
                    freshness: { state: 'unknown', label: 'Live', ageMs: 0 },
                    freshnessState: 'unknown',
                    health: { state: 'healthy', label: 'Healthy', reasons: ['Fetched live from Google CSE.'] },
                    healthState: 'healthy',
                    provenance: {
                        kind: 'google',
                        query: query
                    }
                };
            });
        } catch (err) {
            console.warn('[NexusSearch] Google CSE error:', err.message);
            throw err;
        }
    }

    async function runLocalIndexSearch(query, scope, settings) {
        const Index = ns.Index;
        if (!Index?.search) return { records: [], facets: {}, stats: {}, snapshot: null };
        return await Index.search(query, scope, settings);
    }

    async function runBookmarkVector(query, scope, settings) {
        const result = await runLocalIndexSearch(query, scope, {
            activeVectors: Object.assign({}, settings?.activeVectors, {
                bookmarks: true,
                knowledge: false,
                cachedResults: false
            })
        });
        return result.records.filter(function (record) {
            return record.type === 'bookmark' || record.type === 'card' || record.type === 'library';
        });
    }

    async function runCacheVector(query, scope, settings) {
        const result = await runLocalIndexSearch(query, scope, {
            activeVectors: Object.assign({}, settings?.activeVectors, {
                bookmarks: false,
                knowledge: false,
                cachedResults: true
            })
        });
        return result.records.filter(function (record) {
            return record.type === 'cached';
        });
    }

    async function runKnowledgeVector(query, scope, settings) {
        const result = await runLocalIndexSearch(query, scope, {
            activeVectors: Object.assign({}, settings?.activeVectors, {
                bookmarks: false,
                knowledge: true,
                cachedResults: false
            })
        });
        return result.records.filter(function (record) {
            return record.type === 'knowledge';
        });
    }

    async function runMultiVectorSearch(query, settings, scope) {
        const q = String(query || '').trim();
        if (!q) {
            return {
                results: [],
                stats: {},
                trace: {
                    id: createTraceId(),
                    startedAt: Date.now(),
                    endedAt: Date.now(),
                    totalMs: 0,
                    vectors: {}
                }
            };
        }

        const vectors = settings?.activeVectors || {
            google: true,
            knowledge: true,
            cachedResults: true,
            bookmarks: true
        };

        const trace = {
            id: createTraceId(),
            query: q,
            scope: scope || null,
            mode: settings?.resultsMode || 'segmented',
            startedAt: Date.now(),
            vectors: {}
        };

        const localEnabled = !!(vectors.bookmarks || vectors.knowledge || vectors.cachedResults);
        let localSearchResult = { records: [], facets: {}, stats: {}, snapshot: null };
        let localDurationMs = 0;

        if (localEnabled) {
            const localStart = nowMs();
            try {
                localSearchResult = await runLocalIndexSearch(q, scope, settings);
                localDurationMs = Math.round((nowMs() - localStart) * 100) / 100;
            } catch (error) {
                localDurationMs = Math.round((nowMs() - localStart) * 100) / 100;
                console.warn('[NexusSearch] Local NexusIndex search error:', error);
                trace.vectors.localIndex = {
                    status: 'error',
                    durationMs: localDurationMs,
                    resultCount: 0,
                    error: error?.message || 'Index search failed'
                };
            }
        }

        const bookmarkRecords = localSearchResult.records.filter(function (record) {
            return record.type === 'bookmark';
        });
        const libraryRecords = localSearchResult.records.filter(function (record) {
            return record.type === 'library';
        });
        const cardRecords = localSearchResult.records.filter(function (record) {
            return record.type === 'card';
        });
        const knowledgeRecords = localSearchResult.records.filter(function (record) {
            return record.type === 'knowledge';
        });
        const cachedRecords = localSearchResult.records.filter(function (record) {
            return record.type === 'cached';
        });

        if (localEnabled && !trace.vectors.localIndex) {
            trace.vectors.localIndex = {
                status: 'ok',
                durationMs: localDurationMs,
                resultCount: localSearchResult.records.length
            };
        }

        trace.vectors.bookmarks = {
            status: vectors.bookmarks ? 'ok' : 'disabled',
            durationMs: vectors.bookmarks ? localDurationMs : 0,
            resultCount: vectors.bookmarks ? bookmarkRecords.length + libraryRecords.length + cardRecords.length : 0
        };
        trace.vectors.knowledge = {
            status: vectors.knowledge ? 'ok' : 'disabled',
            durationMs: vectors.knowledge ? localDurationMs : 0,
            resultCount: vectors.knowledge ? knowledgeRecords.length : 0
        };
        trace.vectors.cached = {
            status: vectors.cachedResults ? 'ok' : 'disabled',
            durationMs: vectors.cachedResults ? localDurationMs : 0,
            resultCount: vectors.cachedResults ? cachedRecords.length : 0
        };

        let googleResults = [];
        if (vectors.google && settings?.apiKey && settings?.cx) {
            const googleStart = nowMs();
            try {
                googleResults = await runGoogleVector(q, settings);
                trace.vectors.google = {
                    status: 'ok',
                    durationMs: Math.round((nowMs() - googleStart) * 100) / 100,
                    resultCount: googleResults.length
                };
            } catch (error) {
                trace.vectors.google = {
                    status: 'error',
                    durationMs: Math.round((nowMs() - googleStart) * 100) / 100,
                    resultCount: 0,
                    error: error?.message || 'Google vector failed'
                };
            }
        } else {
            trace.vectors.google = {
                status: vectors.google ? 'skipped' : 'disabled',
                durationMs: 0,
                resultCount: 0,
                error: vectors.google ? 'Missing Google API credentials' : ''
            };
        }

        const allResults = []
            .concat(cardRecords)
            .concat(bookmarkRecords)
            .concat(libraryRecords)
            .concat(knowledgeRecords)
            .concat(cachedRecords)
            .concat(googleResults);

        const typePriority = {
            card: 440,
            bookmark: 400,
            library: 388,
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

        trace.endedAt = Date.now();
        trace.totalMs = Math.round(((trace.endedAt - trace.startedAt)) * 100) / 100;

        const stats = {
            cards: cardRecords.length,
            bookmarks: bookmarkRecords.length,
            library: libraryRecords.length,
            knowledge: knowledgeRecords.length,
            cached: cachedRecords.length,
            google: googleResults.length,
            localIndexed: localSearchResult.records.length
        };

        return {
            results: allResults,
            stats: stats,
            facets: localSearchResult.facets || {},
            query: q,
            scope: scope || null,
            timestamp: Date.now(),
            mode: settings?.resultsMode || 'segmented',
            trace: trace,
            indexStats: localSearchResult.stats || {},
            indexBuiltAt: localSearchResult.snapshot?.builtAt || 0
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
