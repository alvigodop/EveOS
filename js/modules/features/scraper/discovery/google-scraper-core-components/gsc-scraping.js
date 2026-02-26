/**
 * Google Scraper Core - Scraping
 * 
 * Handles the logic of scraping Google search results.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const GSCScraping = {
        version: '1.0.0',

        init: function () {
            console.log('GSCScraping initialized');
            return this;
        },

        /**
         * Scrape Google search for Fandom wikis
         * @param {string} query - The search query
         * @param {Object} options - Additional options
         * @returns {Promise<Array|Object>} Array of search results or object with results and metadata
         */
        scrapeGoogleForFandomWikis: async function (query, options = {}) {
            if (!query) {
                console.warn('GSCScraping: No query provided for Google search');
                return { success: false, error: 'No query provided', results: [] };
            }

            console.log(`GSCScraping: Scraping Google for Fandom wikis matching "${query}"`);

            // Check if BrowserEmulator is ready for rendering
            // Use dependency GSCEmulator
            if (window.GSCEmulator && typeof GSCEmulator.isEmulatorReady === 'function') {
                if (!GSCEmulator.isEmulatorReady()) {
                    console.error('GSCScraping: BrowserEmulator not ready for Google search');
                    return {
                        success: false,
                        error: 'BrowserEmulator not ready for Google search',
                        errorType: 'emulator_not_ready',
                        results: []
                    };
                }
            } else {
                console.warn('GSCScraping: GSCEmulator missing, skipping readiness check (risky)');
            }

            try {
                // Construct the search URL with site:fandom.com to limit to Fandom wikis
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}+site:fandom.com`;
                console.log(`GSCScraping: Using search URL: ${searchUrl}`);

                // Use BrowserEmulator to render the search results
                console.log('GSCScraping: Calling BrowserEmulator.renderUrl()');
                const renderResult = await BrowserEmulator.renderUrl(searchUrl, {
                    requestDelay: 2000, // Extra delay for Google to avoid rate limiting
                    renderTimeout: 20000, // Longer timeout for Google
                    validateRenderedContent: true
                });

                if (!renderResult || !renderResult.html) {
                    console.error('GSCScraping: BrowserEmulator returned no HTML content', renderResult);
                    throw new Error('Failed to render Google search results');
                }

                console.log('GSCScraping: Successfully rendered Google search results');

                // Parse the Google search results
                const parsedResults = BrowserEmulator.parseGoogleResults(renderResult.html);

                if (!parsedResults || !Array.isArray(parsedResults)) {
                    console.error('GSCScraping: Failed to parse Google search results', parsedResults);
                    throw new Error('Failed to parse Google search results');
                }

                // Filter results to only include Fandom wikis
                const fandomResults = parsedResults.filter(result => {
                    const domain = result.domain || '';
                    return domain.includes('fandom.com') || domain.includes('wikia.com');
                });

                console.log(`GSCScraping: Found ${fandomResults.length} Fandom wikis in Google search results`);

                // Transform the results to match our expected format
                const transformedResults = fandomResults.map(result => ({
                    name: result.title || '',
                    url: result.url || '',
                    domain: result.domain || '',
                    description: result.description || '',
                    source: 'Google',
                    type: 'fandom'
                }));

                // Return the search results
                return {
                    success: true,
                    query: query,
                    results: transformedResults,
                    source: 'Google',
                    searchUrl: searchUrl
                };
            } catch (error) {
                console.error(`GSCScraping: Error scraping Google: ${error.message}`, error);

                return {
                    success: false,
                    error: error.message,
                    errorType: 'google_search_error',
                    query: query,
                    results: []
                };
            }
        }
    };

    // Expose globally
    window.GSCScraping = GSCScraping;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('GSCScraping', GSCScraping);
    }
})();
