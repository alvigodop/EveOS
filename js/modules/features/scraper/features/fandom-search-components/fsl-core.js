/**
 * Fandom Search Logic - Core
 * 
 * Main orchestration for Fandom search.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const FSLCore = {
        version: '1.0.0',

        init: function () {
            console.log('FSLCore initialized');
            return this;
        },

        /**
         * Search managed Fandom domains
         * @param {Array} domains - List of managed Fandom domains from WikiManager
         * @param {string} query - The search term
         * @param {object} options - Search options/filters
         * @param {Function} showLoadingFn - Callback to show loading status
         * @returns {Promise<Array>} Promise resolving to an array of results
         */
        searchManagedFandom: async function (domains, query, options, showLoadingFn) {
            console.log(`FSLCore: Searching ${domains.length} domains for "${query}"`, options);

            // Validate query parameter
            if (!query || typeof query !== 'string' || query === 'undefined') {
                console.warn('FSLCore: Invalid or undefined query, returning empty results');
                return [];
            }

            const normalizedQuery = query.toLowerCase().trim();
            const allResults = [];
            const processedUrls = new Set();

            // Cache Settings
            const shouldUseCache = options.liveSearch !== true;
            const shouldFetchLive = options.liveSearch === true || options.hybridSearch !== false;

            if (shouldUseCache && window.FSLCache && typeof FSLCache.getCachedAggregateResults === 'function') {
                const aggregateResults = await FSLCache.getCachedAggregateResults(query, domains);
                if (aggregateResults && aggregateResults.length > 0) {
                    if (typeof FSLCache.updateAggregateCache === 'function') {
                        await FSLCache.updateAggregateCache(query, aggregateResults);
                    }
                    if (showLoadingFn) {
                        showLoadingFn(true, 'results', `Loading cached Fandom results for "${query}"...`, {
                            wikisSearched: domains.length,
                            totalWikis: domains.length,
                            resultsFound: aggregateResults.length,
                            statusPhase: 'cache'
                        });
                    }

                    if (window.WikiManager) {
                        if (typeof WikiManager.refreshCacheStores === 'function') WikiManager.refreshCacheStores();
                        if (typeof WikiManager.renderFandomDomainList === 'function') WikiManager.renderFandomDomainList(true);
                    }

                    return aggregateResults;
                }
            }

            let searchedDomains = 0;
            const totalDomains = domains.length;

            for (const domainInfo of domains) {
                if (!domainInfo || !domainInfo.domain) continue;
                const domain = domainInfo.domain;

                searchedDomains++;
                if (showLoadingFn) {
                    showLoadingFn(true, 'results', `Searching Fandom domain ${searchedDomains}/${totalDomains}: ${domainInfo.name || domain}`, {
                        wikisSearched: searchedDomains,
                        totalWikis: totalDomains,
                        resultsFound: allResults.length
                    });
                }

                let domainResults = [];
                let dataSource = 'cache';
                const cacheKey = `fandom_${domain}_search_${normalizedQuery}`;

                // 1. Try Cache
                if (shouldUseCache && window.FSLCache) {
                    const cached = await FSLCache.getCachedResults(domain, query, cacheKey);
                    if (cached) {
                        domainResults = cached;
                    }
                }

                // 2. Fetch Live (if needed)
                if (domainResults.length === 0 && shouldFetchLive && window.FSLLive) {

                    domainResults = await FSLLive.fetchAndEnrich(domain, query, domainInfo);
                    dataSource = 'live';

                    // Update generic cache
                    if (domainResults.length > 0 && window.FSLCache) {
                        await FSLCache.updateGenericCache(cacheKey, domainResults);
                    }
                }

                // Store in domain's main cache for "View Cache" / "CACHED" tab
                // We update this regardless of source (live or cache) to ensure visual consistency
                if (window.FSLCache && domainResults.length > 0) {
                    FSLCache.updateDomainStore(domain, domainResults);
                }

                // 3. Collect Results
                if (domainResults.length > 0) {
                    const validResults = domainResults.filter(result => {
                        if (!result || !result.title || !result.url) return false;
                        if (processedUrls.has(result.url)) return false;
                        return true;
                    });

                    validResults.forEach(result => {
                        result.source = 'fandom';
                        result.fromCache = (dataSource === 'cache');
                        allResults.push(result);
                        processedUrls.add(result.url);
                    });
                }
            }

            // Refresh Fandom cache store and re-render so "CACHED" tab updates
            if (allResults.length > 0 && window.WikiManager) {
                if (typeof WikiManager.refreshCacheStores === 'function') WikiManager.refreshCacheStores();
                if (typeof WikiManager.renderFandomDomainList === 'function') WikiManager.renderFandomDomainList(true);
            }

            if (allResults.length > 0 && window.FSLCache && typeof FSLCache.updateAggregateCache === 'function') {
                await FSLCache.updateAggregateCache(query, allResults);
            }

            console.log(`FSLCore: Aggregated ${allResults.length} potential results.`);
            return allResults;
        }
    };

    // Expose globally
    window.FSLCore = FSLCore;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('FSLCore', FSLCore);
    }
})();
