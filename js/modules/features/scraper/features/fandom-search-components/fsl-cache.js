/**
 * Fandom Search Logic - Cache
 * 
 * Handles cache interactions for Fandom search.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const FSLCache = {
        version: '1.0.0',

        init: function () {
            console.log('FSLCache initialized');
            return this;
        },

        _normalizeQuery: function (query) {
            return String(query || '').trim().toLowerCase();
        },

        _normalizeTitleValue: function (value) {
            return String(value || '').replace(/\s+/g, ' ').trim();
        },

        _normalizeTitleKey: function (value) {
            return this._normalizeTitleValue(value)
                .toLowerCase()
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        _extractSlugTitle: function (url) {
            const rawUrl = String(url || '').trim();
            if (!rawUrl) return '';

            try {
                const parsed = new URL(rawUrl, window.location.href);
                const match = parsed.pathname.match(/\/wiki\/(.+)$/i);
                if (!match || !match[1]) return '';
                return this._normalizeTitleValue(decodeURIComponent(match[1]).replace(/_/g, ' '));
            } catch (error) {
                return '';
            }
        },

        _resolveStoredTitle: function (result) {
            const source = result && typeof result === 'object' ? result : {};
            const rawTitle = this._normalizeTitleValue(source.title || source.name || '');
            const wikiName = this._normalizeTitleValue(source.wiki_name || '');
            const domainLabel = this._normalizeTitleValue(
                String(source.domain || source.wiki_domain || '')
                    .replace(/^https?:\/\//i, '')
                    .replace(/\.fandom\.com$/i, '')
                    .replace(/\.[^.]+$/, '')
                    .replace(/[-_]+/g, ' ')
            );
            const rawKey = this._normalizeTitleKey(rawTitle);
            const genericKeys = new Set([
                this._normalizeTitleKey(wikiName),
                this._normalizeTitleKey(`${wikiName} wiki`),
                this._normalizeTitleKey(domainLabel),
                this._normalizeTitleKey(`${domainLabel} wiki`),
                'untitled',
                'no title'
            ].filter(Boolean));
            const slugTitle = this._extractSlugTitle(source.url);

            if (slugTitle && (!rawKey || genericKeys.has(rawKey))) {
                return slugTitle;
            }

            return rawTitle || slugTitle || 'Untitled';
        },

        _getAggregateCacheKey: function (query) {
            return `fandom_managed_search_${this._normalizeQuery(query)}`;
        },

        _buildMatchHaystack: function (result) {
            const source = result && typeof result === 'object' ? result : {};
            const values = [
                source.title,
                source.snippet,
                source.content,
                source.extract,
                source.domain,
                source.wiki_name,
                ...(Array.isArray(source.categories) ? source.categories : []),
                ...(Array.isArray(source.tags) ? source.tags : []),
                ...(Array.isArray(source.genres) ? source.genres : []),
                ...(Array.isArray(source.names) ? source.names : []),
                ...(Array.isArray(source.aliases) ? source.aliases : [])
            ];
            return values
                .map((value) => String(value || '').trim().toLowerCase())
                .filter(Boolean)
                .join(' ');
        },

        _matchesCachedQuery: function (query, result) {
            const normalizedQuery = this._normalizeQuery(query);
            if (!normalizedQuery) return false;

            const haystack = this._buildMatchHaystack(result);
            if (!haystack) return false;
            if (haystack.includes(normalizedQuery)) return true;

            const tokens = normalizedQuery.split(/[^a-z0-9]+/i).filter(Boolean);
            if (!tokens.length) return false;
            return tokens.every((token) => haystack.includes(token));
        },

        _cloneResult: function (result, overrides = {}) {
            const source = result && typeof result === 'object' ? result : {};
            return {
                ...source,
                title: this._resolveStoredTitle(source),
                categories: Array.isArray(source.categories) ? source.categories.slice() : [],
                tags: Array.isArray(source.tags) ? source.tags.slice() : [],
                genres: Array.isArray(source.genres) ? source.genres.slice() : [],
                names: Array.isArray(source.names) ? source.names.slice() : [],
                aliases: Array.isArray(source.aliases) ? source.aliases.slice() : [],
                ...overrides
            };
        },

        /**
         * Try to get results from generic cache
         */
        getCachedResults: async function (domain, query, cacheKey) {
            if (window.CacheManager && typeof CacheManager.getGeneric === 'function') {
                try {
                    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day
                    const cachedData = await CacheManager.getGeneric(cacheKey);

                    if (cachedData) {
                        const cacheAge = Date.now() - (cachedData.lastFetch || 0);
                        if (cacheAge < CACHE_MAX_AGE_MS) {
                            const results = cachedData.results || [];
                            if (results.length > 0) {
                                console.log(`FSLCache: Using fresh cache for ${domain} query "${query}" (${results.length} results)`);
                                return results;
                            } else {
                                console.log(`FSLCache: Cache empty for ${domain} query "${query}"`);
                            }
                        } else {
                            console.log(`FSLCache: Cache stale for ${domain} query "${query}"`);
                        }
                    }
                } catch (cacheError) {
                    console.warn(`FSLCache: Error reading cache for ${domain} query "${query}":`, cacheError);
                }
            }
            return null;
        },

        getCachedAggregateResults: async function (query, domains) {
            if (!window.CacheManager || typeof CacheManager.getGeneric !== 'function') {
                return null;
            }

            const cacheKey = this._getAggregateCacheKey(query);
            const activeDomains = new Set((Array.isArray(domains) ? domains : [])
                .map((domainInfo) => String(domainInfo?.domain || domainInfo || '').trim().toLowerCase())
                .filter(Boolean));

            const fallbackToDomainStore = () => this.getCachedDomainStoreResults(query, domains);

            try {
                const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
                const cachedData = await CacheManager.getGeneric(cacheKey);
                if (!cachedData || !Array.isArray(cachedData.results)) {
                    return fallbackToDomainStore();
                }

                const cacheAge = Date.now() - (cachedData.lastFetch || 0);
                if (cacheAge >= CACHE_MAX_AGE_MS) {
                    console.log(`FSLCache: Aggregate cache stale for query "${query}"`);
                    return fallbackToDomainStore();
                }

                const scopedResults = cachedData.results
                    .map((result) => this._cloneResult(result, { fromCache: true }))
                    .filter((result) => {
                        if (!activeDomains.size) return true;
                        const resultDomain = String(result.domain || result.wiki_domain || result.wiki_name || '').trim().toLowerCase();
                        return resultDomain ? activeDomains.has(resultDomain) : true;
                    });

                if (!scopedResults.length) {
                    return fallbackToDomainStore();
                }

                console.log(`FSLCache: Using aggregate cache for "${query}" (${scopedResults.length} results)`);
                return scopedResults;
            } catch (cacheError) {
                console.warn(`FSLCache: Error reading aggregate cache for "${query}":`, cacheError);
                return fallbackToDomainStore();
            }
        },

        getCachedDomainStoreResults: function (query, domains) {
            if (!window.CacheManager || !CacheManager.wikiDataStore?.searchResults) {
                return null;
            }

            const domainsList = Array.isArray(domains) ? domains : (domains ? [domains] : []);
            const activeDomains = new Set(domainsList
                .map((domainInfo) => String(domainInfo?.domain || domainInfo || '').trim().toLowerCase())
                .filter(Boolean));
            const results = [];
            const seen = new Set();
            const domainStore = CacheManager.wikiDataStore.searchResults || {};

            Object.entries(domainStore).forEach(([domain, entries]) => {
                const normalizedDomain = String(domain || '').trim().toLowerCase();
                if (activeDomains.size && normalizedDomain && !activeDomains.has(normalizedDomain)) {
                    return;
                }

                Object.entries(entries || {}).forEach(([entryKey, value]) => {
                    if (entryKey === 'lastUpdate' || !value || typeof value !== 'object') return;
                    if (!this._matchesCachedQuery(query, value)) return;

                    const cloned = this._cloneResult(value, {
                        domain: value.domain || domain,
                        wiki_domain: value.wiki_domain || value.domain || domain,
                        fromCache: true,
                        cacheOrigin: 'domain-store'
                    });
                    const dedupeKey = String(cloned.url || `${cloned.domain || domain}::${cloned.title || entryKey}`).trim().toLowerCase();
                    if (!dedupeKey || seen.has(dedupeKey)) return;
                    seen.add(dedupeKey);
                    results.push(cloned);
                });
            });

            if (!results.length) {
                return null;
            }

            console.log(`FSLCache: Using domain-store fallback cache for "${query}" (${results.length} results)`);
            return results;
        },

        /**
         * Update generic cache with fresh results
         */
        updateGenericCache: async function (cacheKey, results) {
            if (window.CacheManager && typeof CacheManager.updateGeneric === 'function') {
                try {
                    const clonedResults = Array.isArray(results)
                        ? results.map((result) => this._cloneResult(result))
                        : [];
                    await CacheManager.updateGeneric(cacheKey, { results: clonedResults, lastFetch: Date.now() });
                } catch (cacheWriteError) {
                    console.warn(`FSLCache: Error writing cache:`, cacheWriteError);
                }
            }
        },

        updateAggregateCache: async function (query, results) {
            if (!window.CacheManager || typeof CacheManager.updateGeneric !== 'function') {
                return;
            }

            const cacheKey = this._getAggregateCacheKey(query);
            try {
                const clonedResults = Array.isArray(results)
                    ? results.map((result) => this._cloneResult(result))
                    : [];
                await CacheManager.updateGeneric(cacheKey, {
                    query: String(query || '').trim(),
                    results: clonedResults,
                    lastFetch: Date.now()
                });
            } catch (cacheWriteError) {
                console.warn(`FSLCache: Error writing aggregate cache:`, cacheWriteError);
            }
        },

        /**
         * Update the main WikiDataStore cache for "View Cache" functionality
         */
        updateDomainStore: function (domain, results) {
            if (results.length > 0 && window.CacheManager && CacheManager.wikiDataStore) {
                try {
                    CacheManager.init();
                    if (!CacheManager.wikiDataStore.searchResults) {
                        CacheManager.wikiDataStore.searchResults = {};
                    }
                    if (!CacheManager.wikiDataStore.searchResults[domain]) {
                        CacheManager.wikiDataStore.searchResults[domain] = { lastUpdate: null };
                    }

                    for (const result of results) {
                        const resolvedTitle = this._resolveStoredTitle(result);
                        const key = resolvedTitle;
                        CacheManager.wikiDataStore.searchResults[domain][key] = this._cloneResult(result, {
                            title: resolvedTitle,
                            content: result.content || result.snippet || '',
                            snippet: result.snippet || '',
                            wiki_domain: result.domain || domain,
                            domain: result.domain || domain,
                            lastUpdate: new Date().toISOString()
                        });
                    }
                    CacheManager.wikiDataStore.searchResults[domain].lastUpdate = new Date().toISOString();

                    if (window.CacheCore && typeof CacheCore.saveWikiDataStore === 'function') {
                        CacheCore.saveWikiDataStore();
                    } else {
                        localStorage.setItem('wikiDataStore', JSON.stringify(CacheManager.wikiDataStore));
                    }
                } catch (mergeError) {
                    console.warn(`FSLCache: Error merging results to domain cache:`, mergeError);
                }
            }
        }
    };

    // Expose globally
    window.FSLCache = FSLCache;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('FSLCache', FSLCache);
    }
})();
