/**
 * Wikipedia Enhancer - Service
 * 
 * Handles fetching and orchestration of enhancement.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WESService = {
        version: '1.0.0',

        init: function () {
            console.log('WESService initialized');
            return this;
        },

        /**
         * Enhance search results with additional web data
         * @param {Array} results - Existing results array
         * @param {string} searchTerm - The search term
         * @returns {Promise<Array>} - Enhanced results
         */
        enhanceResultsWithWebData: async function (results, searchTerm) {
            // Only enhance if we have few results or no main article
            if (results.length > 5 && results.some(r => r.isMainArticle)) {
                return results; // Enough results and we have a main article
            }

            // Only enhance Wikipedia results
            const isWikipediaSearch = results.some(r =>
                r.wiki_name === 'Wikipedia' || r.wiki_url?.includes('wikipedia.org')
            );

            if (!isWikipediaSearch) {
                return results;
            }

            // Check availability of smart dedup toggle (User Preference)
            const smartDedupToggle = document.getElementById('smartDedupToggle');
            // If toggle exists and is unchecked, disable enhancement
            if (smartDedupToggle && !smartDedupToggle.checked) {
                console.log('WESService: Smart linking disabled per user preference');
                return results;
            }

            console.log('WESService: Enhancing results with web data for:', searchTerm);

            try {
                const searchQuery = `${searchTerm} wiki information`;
                const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchQuery)}&limit=5&namespace=0&format=json&origin=*`;

                // Use CORSProxyManager for reliable fetching (handles file://, localhost, and proxies)
                if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                    try {
                        const response = await CORSProxyManager.fetch(url);
                        if (response.ok) {
                            const data = await response.json();
                            console.log('WESService: Web enhancement data:', data);

                            if (window.WESProcessor) {
                                const processedResults = WESProcessor.processWebResults(data, searchTerm, results);
                                if (processedResults) return processedResults;
                            }
                        }
                    } catch (fetchError) {
                        console.warn('WESService: Error fetching web enhancement data:', fetchError);
                    }
                } else {
                    // Fallback if CORSProxyManager is not available
                    console.warn('WESService: CORSProxyManager not available, attempting Wikimedia helper/direct fetch');
                    try {
                        const fetchWikipediaJson = window.EveOS?.API?.Core?.fetchWikimediaJson;
                        const data = typeof fetchWikipediaJson === 'function'
                            ? await fetchWikipediaJson(url)
                            : await (await fetch(url)).json();
                        if (window.WESProcessor) {
                            const processedResults = WESProcessor.processWebResults(data, searchTerm, results);
                            if (processedResults) return processedResults;
                        }
                    } catch (directError) {
                        console.warn('WESService: Direct fetch failed:', directError);
                    }
                }
            } catch (error) {
                console.warn('WESService: Error enhancing results with web data:', error);
            }

            return results;
        }
    };

    // Expose globally
    window.WESService = WESService;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('WESService', WESService);
    }
})();
