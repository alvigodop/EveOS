/**
 * Fandom Search Logic - Live
 * 
 * Handles live fetching and enrichment for Fandom search.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const FSLLive = {
        version: '1.0.0',

        init: function () {
            console.log('FSLLive initialized');
            return this;
        },

        /**
         * Fetch and enrich results from live API
         */
        fetchAndEnrich: async function (domain, query, domainInfo) {
            console.log(`FSLLive: Fetching live search results for ${domain} query "${query}"`);

            try {
                // Dependency check
                if (!window.SearchFandom || typeof SearchFandom.fetchLiveFandomDomainSearch !== 'function') {
                    console.error('FSLLive: SearchFandom API missing');
                    return [];
                }

                const liveSearchResults = await SearchFandom.fetchLiveFandomDomainSearch(domain, query);

                const MAX_ENRICHED_RESULTS = 20;
                const resultsToEnrich = liveSearchResults.slice(0, MAX_ENRICHED_RESULTS);
                const remainingResults = liveSearchResults.slice(MAX_ENRICHED_RESULTS);

                const enrichedResults = await Promise.all(resultsToEnrich.map(async (item) => {
                    try {
                        const details = await SearchFandom.fetchLiveFandomPageDetails(domain, item.title);
                        if (details) {
                            return {
                                title: item.title,
                                snippet: details.extract || item.snippet || 'No snippet available',
                                url: item.url,
                                wiki_name: domainInfo.name || domain,
                                wiki_url: `https://${domain}`,
                                contentType: details.contentType || (window.ModuleUtilities ? ModuleUtilities.inferContentTypeFromTitle(item.title, domain) : 'unknown'),
                                categories: details.categories || [],
                                thumbnail: details.thumbnail || null,
                                source: 'live',
                                lastFetch: Date.now()
                            };
                        }
                    } catch (detailError) {
                        console.warn(`FSLLive: Failed to enrich result ${item.title}:`, detailError);
                    }
                    return this._createBasicResult(item, domain, domainInfo);
                }));

                const basicResults = remainingResults.map(item => this._createBasicResult(item, domain, domainInfo));

                return [...enrichedResults, ...basicResults];

            } catch (fetchError) {
                console.error(`FSLLive: Error fetching live search results for ${domain} query "${query}":`, fetchError);
                return [];
            }
        },

        _createBasicResult: function (item, domain, domainInfo) {
            return {
                title: item.title,
                snippet: item.snippet || 'No snippet available',
                url: item.url,
                wiki_name: domainInfo.name || domain,
                wiki_url: `https://${domain}`,
                contentType: window.ModuleUtilities ? ModuleUtilities.inferContentTypeFromTitle(item.title, domain) : 'unknown',
                categories: [],
                thumbnail: null,
                source: 'live',
                lastFetch: Date.now()
            };
        }
    };

    // Expose globally
    window.FSLLive = FSLLive;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('FSLLive', FSLLive);
    }
})();
