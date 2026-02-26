/**
 * Fandom Search Logic - Strategy
 * Multi-strategy search implementation (Local -> Google Scraper -> Fallback)
 */
const FandomSearchStrategy = {};

/**
 * Search for Fandom wikis using all available methods
 * @param {string} query - The search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
FandomSearchStrategy.searchFandomWikis = async function (query, options = {}) {
    console.log(`FandomSearch: Searching for Fandom wikis matching "${query}"`);

    // Ensure FandomSearch util is available for formatting
    const FandomSearch = window.FandomSearch || {};

    // Store this on the global FandomSearch object if available, for tracking 
    if (FandomSearch) FandomSearch._lastSearchQuery = query;

    let results = [];

    // Try local search first
    try {
        // Assume searchFandomWikisLocal is available on FandomSearch object
        const localResults = FandomSearch.searchFandomWikisLocal ? await FandomSearch.searchFandomWikisLocal(query) : [];

        if (localResults && Array.isArray(localResults)) {
            console.log(`FandomSearch: Found ${localResults.length} local results`);
            results = [...localResults];
        } else if (localResults && typeof localResults === 'object' && localResults.results) {
            // Handle object format with results property
            console.log(`FandomSearch: Found ${localResults.results.length} local results (object format)`);
            results = [...localResults.results];
        }
    } catch (error) {
        console.warn(`FandomSearch: Error during local search:`, error);
    }

    // Try GoogleSearchScraper if available and local results are insufficient
    if ((results.length === 0 || options.useGoogleSearch) &&
        window.GoogleSearchScraper &&
        typeof GoogleSearchScraper.localFandomSearch === 'function') {

        try {
            console.log('FandomSearch: Using GoogleSearchScraper.localFandomSearch');
            const scraperResults = await GoogleSearchScraper.localFandomSearch(query);

            // Handle results based on return format
            if (scraperResults) {
                if (Array.isArray(scraperResults)) {
                    // Old format: array of results
                    console.log(`FandomSearch: Found ${scraperResults.length} additional results from GoogleSearchScraper`);

                    // Add new results, avoiding duplicates
                    scraperResults.forEach(result => {
                        if (!results.some(r => r.url === result.url)) {
                            results.push(result);
                        }
                    });
                } else if (typeof scraperResults === 'object' && scraperResults.results) {
                    // New format: object with results array
                    console.log(`FandomSearch: Found ${scraperResults.results.length} additional results from GoogleSearchScraper (object format)`);

                    // Add new results, avoiding duplicates
                    scraperResults.results.forEach(result => {
                        if (!results.some(r => r.url === result.url)) {
                            results.push(result);
                        }
                    });
                } else {
                    console.warn('FandomSearch: Unexpected results format from GoogleSearchScraper:', typeof scraperResults);
                }
            }
        } catch (error) {
            console.warn('FandomSearch: Error using GoogleSearchScraper:', error);
        }
    }

    // If no results found, generate some basic ones
    if (results.length === 0) {
        console.log('FandomSearch: No results found, generating fallback results');

        // Helper to format name
        const formatName = FandomSearch._formatWikiName || (q => q.charAt(0).toUpperCase() + q.slice(1) + ' Wiki');

        // Use domain generation if available
        if (window.DomainGenerator && typeof DomainGenerator.generateFandomDomains === 'function') {
            try {
                const domains = DomainGenerator.generateFandomDomains(query);

                if (domains && Array.isArray(domains) && domains.length > 0) {
                    console.log(`FandomSearch: Generated ${domains.length} domains with DomainGenerator`);

                    // Format results
                    const formattedName = formatName(query);

                    domains.forEach(domain => {
                        // Handle both string domains and domain objects
                        if (typeof domain === 'string') {
                            results.push({
                                url: `https://${domain}`,
                                name: formattedName,
                                domain: domain,
                                description: `Potential Fandom wiki about ${query}`,
                                generated: true
                            });
                        } else if (domain && domain.domain) {
                            results.push({
                                url: domain.url || `https://${domain.domain}`,
                                name: domain.name || formattedName,
                                domain: domain.domain,
                                description: domain.description || `Potential Fandom wiki about ${query}`,
                                generated: domain.generated !== undefined ? domain.generated : true
                            });
                        }
                    });
                }
            } catch (error) {
                console.warn('FandomSearch: Error using DomainGenerator:', error);
            }
        }

        // If still no results, use simple domain generation
        if (results.length === 0) {
            console.log('FandomSearch: Creating basic fallback results');

            const sanitizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
            const formattedName = formatName(query);

            const domains = [
                `${sanitizedQuery}.fandom.com`,
                `${sanitizedQuery}-wiki.fandom.com`,
                `${sanitizedQuery.substring(0, Math.max(3, sanitizedQuery.length))}.fandom.com`
            ];

            domains.forEach(domain => {
                results.push({
                    url: `https://${domain}`,
                    name: formattedName,
                    domain: domain,
                    description: `Potential Fandom wiki about ${query}`,
                    generated: true
                });
            });
        }
    }

    // Store results for later access
    if (FandomSearch) FandomSearch._lastSearchResults = results;

    console.log(`FandomSearch: Returning ${results.length} total results`);
    return results;
};

// Ensure global availability
window.FandomSearchStrategy = FandomSearchStrategy;
console.log('[FandomSearchStrategy] Loaded');
