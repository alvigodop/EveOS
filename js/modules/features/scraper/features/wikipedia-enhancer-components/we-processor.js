/**
 * Wikipedia Enhancer - Processor
 * 
 * Handles processing of OpenSearch results.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WESProcessor = {
        version: '1.0.0',

        init: function () {
            console.log('WESProcessor initialized');
            return this;
        },

        /**
         * Helper function to process web search results from opensearch API
         * @param {Array} data - OpenSearch response data [query, titles, descriptions, urls]
         * @param {string} searchTerm - The original search term
         * @param {Array} results - Existing results to merge with
         * @returns {Array|null} - Merged results or null if no new results
         */
        processWebResults: function (data, searchTerm, results) {
            // OpenSearch returns [query, titles, descriptions, urls]
            if (data && data[1] && data[1].length > 0) {
                const webResults = [];

                // Process each result
                for (let i = 0; i < data[1].length; i++) {
                    const title = data[1][i];
                    const description = data[2][i] || '';
                    const url = data[3][i] || '';

                    // Skip if we already have this result
                    if (results.some(r => r.title === title || r.url === url)) {
                        continue;
                    }

                    // Infer content type
                    let contentType = 'Article';
                    if (title.includes('List of')) contentType = 'List';
                    if (title.includes('Category:')) contentType = 'Category';

                    webResults.push({
                        title: title,
                        url: url,
                        description: description,
                        wiki_name: 'Wikipedia',
                        wiki_url: 'https://en.wikipedia.org',
                        last_updated: new Date().toISOString(),
                        is_managed: false,
                        content_type: contentType,
                        source: 'web_enhancement'
                    });
                }

                if (webResults.length > 0) {
                    console.log(`WESProcessor: Added ${webResults.length} web results`);
                    return [...results, ...webResults];
                }
            }
            return null;
        }
    };

    // Expose globally
    window.WESProcessor = WESProcessor;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('WESProcessor', WESProcessor);
    }
})();
