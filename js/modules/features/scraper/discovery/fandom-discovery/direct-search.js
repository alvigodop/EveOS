/**
 * Fandom Discovery Direct Search
 * 
 * Extends FandomDiscovery with direct Fandom search capabilities.
 */

(function () {
    if (!window.FandomDiscovery) {
        console.error('FandomDiscovery core must be loaded before direct search');
        return;
    }

    Object.assign(window.FandomDiscovery, {
        /**
         * Check if direct Fandom search should be used
         * @returns {boolean} Whether direct Fandom search should be used
         */
        shouldUseDirectFandom: function () {
            // Check from GoogleSearchScraper if available
            if (window.GoogleSearchScraper && GoogleSearchScraper.searchOptions) {
                return GoogleSearchScraper.searchOptions.fandomSearchEnabled === true;
            }

            // Default to true if no setting available
            return true;
        },

        /**
         * Search Fandom wikis directly using Fandom API
         * @param {string} query - Search query 
         * @returns {Promise<Array>} Search results
         */
        searchFandomWikis: async function (query) {
            console.log(`FandomDiscovery: Searching Fandom wikis for "${query}"`);

            let results = [];

            // Try using FandomSearch if available
            if (window.FandomSearch) {
                try {
                    // Try searchFandomWikis method first
                    // Note: We need to be careful not to create a recursive loop if FandomSearch calls back to us
                    // The core module's compatibility layer handles this, but here we want the *original* method if possible
                    // However, we don't have easy access to the original method if we overwrote it.
                    // Ideally, FandomSearch would have a distinct internal method.

                    // If FandomSearch.searchFandomWikisLocal exists, use that (safest)
                    if (typeof FandomSearch.searchFandomWikisLocal === 'function') {
                        results = await FandomSearch.searchFandomWikisLocal(query);
                    }
                    // Otherwise rely on FandomSearch logic (checking for recursion is hard here without modifying FandomSearch)
                    // But if FandomSearch.searchFandomWikis is our wrapper, calling it again is fine as long as options.useDiscovery is false
                    // or handled correctly.
                } catch (error) {
                    console.warn('FandomDiscovery: Error using FandomSearch module:', error);
                }
            }

            // Try using PopularWikis if available and no results yet
            if (results.length === 0 && window.PopularWikis && typeof PopularWikis.searchWikis === 'function') {
                try {
                    const popularResults = await PopularWikis.searchWikis(query);
                    if (popularResults && popularResults.length > 0) {
                        results = popularResults;
                    }
                } catch (error) {
                    console.warn('FandomDiscovery: Error using PopularWikis module:', error);
                }
            }

            // Generate offline results if we still have nothing
            if (results.length === 0) {
                // Create some domains based on the search term
                const sanitizedTerm = query.toLowerCase().replace(/[^a-z0-9]/g, '');

                // If we have DomainGenerator, use it for better results
                if (window.DomainGenerator && typeof DomainGenerator.generateFandomDomains === 'function') {
                    try {
                        results = DomainGenerator.generateFandomDomains(query);
                    } catch (error) {
                        console.warn('FandomDiscovery: Error using DomainGenerator:', error);
                    }
                }

                // If still no results, create some basic ones
                if (results.length === 0) {
                    const domains = [
                        `${sanitizedTerm}.fandom.com`,
                        `${sanitizedTerm}-wiki.fandom.com`,
                        `${sanitizedTerm.substring(0, Math.max(3, sanitizedTerm.length))}.fandom.com`
                    ];

                    // Format the display name
                    const displayName = this._formatWikiName(query);

                    results = domains.map(domain => ({
                        name: displayName,
                        domain: domain,
                        url: `https://${domain}`,
                        description: `Potential Fandom wiki about ${query}`,
                        source: 'Fandom',
                        type: 'fandom',
                        verified: false,
                        generated: true
                    }));
                }
            }

            return results;
        }
    });

    console.log('FandomDiscovery: Direct search strategy loaded');
})();
