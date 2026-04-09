/**
 * Search Enhancer - Wiki Enhance
 * 
 * Handles Wikipedia result enhancement with OpenSearch data.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SEWikiEnhance = {
        version: '1.0.0',

        init: function () {
            console.log('SEWikiEnhance initialized');
            return this;
        },

        enhanceResultsWithWebData: async function (results, searchTerm) {
            if (results.length > 5 && results.some(r => r.isMainArticle)) {
                return results;
            }

            const isWikipediaSearch = results.some(r =>
                r.wiki_name === 'Wikipedia' || r.wiki_url?.includes('wikipedia.org')
            );

            if (!isWikipediaSearch) {
                return results;
            }

            const smartDedupToggle = document.getElementById('smartDedupToggle');
            if (smartDedupToggle && !smartDedupToggle.checked) {
                console.log('SEWikiEnhance: Smart linking disabled per user preference');
                return results;
            }

            console.log('SEWikiEnhance: Enhancing results with web data for:', searchTerm);

            try {
                const searchQuery = `${searchTerm} wiki information`;
                const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchQuery)}&limit=5&namespace=0&format=json&origin=*`;

                if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                    try {
                        const response = await CORSProxyManager.fetch(url);
                        if (response.ok) {
                            const data = await response.json();
                            const processedResults = this._processWebResults(data, searchTerm, results);
                            if (processedResults) return processedResults;
                        }
                    } catch (fetchError) {
                        console.warn('SEWikiEnhance: Error fetching web enhancement data:', fetchError);
                    }
                } else {
                    console.warn('SEWikiEnhance: CORSProxyManager not available, attempting Wikimedia helper/direct fetch');
                    try {
                        const fetchWikipediaJson = window.EveOS?.API?.Core?.fetchWikimediaJson;
                        const data = typeof fetchWikipediaJson === 'function'
                            ? await fetchWikipediaJson(url)
                            : await (await fetch(url)).json();
                        const processedResults = this._processWebResults(data, searchTerm, results);
                        if (processedResults) return processedResults;
                    } catch (directError) {
                        console.warn('SEWikiEnhance: Direct fetch failed:', directError);
                    }
                }
            } catch (error) {
                console.warn('SEWikiEnhance: Error enhancing results with web data:', error);
            }

            return results;
        },

        _processWebResults: function (data, searchTerm, results) {
            if (!data || data.length < 4) return null;

            // OpenSearch format: [query, [titles], [descriptions], [urls]]
            const titles = data[1] || [];
            const descriptions = data[2] || [];
            const urls = data[3] || [];

            if (titles.length === 0) return null;

            const newResults = [];

            for (let i = 0; i < titles.length; i++) {
                const title = titles[i];
                const url = urls[i];

                // Skip if already in results
                if (results.some(r => r.url === url || r.title === title)) {
                    continue;
                }

                newResults.push({
                    title: title,
                    url: url,
                    description: descriptions[i] || 'No description available',
                    source: 'wikipedia-discovery', // Mark as discovery
                    wiki_name: 'Wikipedia',
                    isMainArticle: false,
                    timestamp: Date.now()
                });
            }

            if (newResults.length > 0) {
                console.log(`SEWikiEnhance: Added ${newResults.length} new results from web enhancement.`);
                return [...results, ...newResults];
            }

            return null;
        }
    };

    // Expose globally
    window.SEWikiEnhance = SEWikiEnhance;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SEWikiEnhance', SEWikiEnhance);
    }
})();
