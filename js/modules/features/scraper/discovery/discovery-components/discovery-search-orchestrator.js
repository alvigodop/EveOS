/**
 * DiscoverySearchOrchestrator Module
 * Orchestrates the search process for Discovery module, coordinating multiple search sources
 */
const DiscoverySearchOrchestrator = {};

/**
 * Search for real Fandom wikis using Google scraping
 * @param {string} searchTerm - The search term to search for
 * @param {Array} [popularWikis=[]] - Optional array of popular wikis to search first
 * @returns {Promise<Array>} - Promise resolving to array of wiki results
 */
DiscoverySearchOrchestrator.searchForRealFandomWikis = async function (searchTerm, popularWikis = []) {
    console.log('Orchestrator: Searching for real Fandom wikis matching "' + searchTerm + '"');

    // Update loading UI
    const discoveryResultsContainer = document.getElementById('discoveryResults');
    if (discoveryResultsContainer && window.DiscoverySearchUI) {
        DiscoverySearchUI.showLoading(discoveryResultsContainer, searchTerm);
    }

    // First check for matches in popular wikis if provided
    let popularMatches = [];
    try {
        popularMatches = this.findMatchingPopularWikis(searchTerm, popularWikis);
    } catch (error) {
        console.error('Error finding matching popular wikis:', error);
        popularMatches = [];
    }

    // Keep track of all results
    let allResults = [...popularMatches];

    // Delegate to FandomDiscovery for the heavy lifting
    if (window.FandomDiscovery && typeof FandomDiscovery.discoverFandomCommunities === 'function') {
        try {
            console.log('Orchestrator: Delegating to FandomDiscovery...');

            // Configure options for broad discovery
            const options = {
                useGoogleSearch: true,
                useFandomSearch: true,
                prioritizeGoogleSearch: true // Default preference
            };

            // Execute discovery
            const discoveryResult = await FandomDiscovery.discoverFandomCommunities(searchTerm, options);

            if (discoveryResult.success && discoveryResult.results.length > 0) {
                console.log(`Orchestrator: FandomDiscovery returned ${discoveryResult.results.length} results via ${discoveryResult.searchMethod}`);

                // Filter out duplicates that might be in popularMatches
                const newResults = discoveryResult.results.filter(r =>
                    !allResults.some(existing => existing.url === r.url)
                );

                allResults = allResults.concat(newResults);
            } else {
                console.log('Orchestrator: FandomDiscovery returned no results');
            }
        } catch (error) {
            console.error('Orchestrator: Error during FandomDiscovery delegation:', error);
        }
    } else {
        console.warn('Orchestrator: FandomDiscovery not available, skipping extended search');
    }

    // Render results if container exists
    if (discoveryResultsContainer && window.GoogleSearchScraper && typeof GoogleSearchScraper.renderSearchResults === 'function') {
        // If we have results, render them
        if (allResults.length > 0 && !discoveryResultsContainer.querySelector('.fandom-search-results')) {
            GoogleSearchScraper.renderSearchResults(allResults, searchTerm, discoveryResultsContainer);
        }
    }

    // Update UI state based on results
    if (allResults.length === 0 && discoveryResultsContainer && window.DiscoverySearchUI) {
        DiscoverySearchUI.clearLoading(discoveryResultsContainer);
        DiscoverySearchUI.showNoResults(discoveryResultsContainer, searchTerm);
    } else if (discoveryResultsContainer && window.DiscoverySearchUI) {
        DiscoverySearchUI.clearLoading(discoveryResultsContainer);
    }

    return allResults;
};

/**
 * Find matching wikis from the popular wikis list
 * @param {string} searchTerm - The search term
 * @param {Array} popularWikis - List of popular wikis to check
 * @returns {Array} - Array of matching wikis
 */
DiscoverySearchOrchestrator.findMatchingPopularWikis = function (searchTerm, popularWikis = []) {
    console.log(`Checking for popular wikis matching "${searchTerm}"`);

    if (!Array.isArray(popularWikis) || popularWikis.length === 0) {
        return [];
    }

    const searchTermLower = searchTerm.toLowerCase();
    const matches = popularWikis.filter(wiki => {
        if (!wiki || typeof wiki !== 'object') return false;

        const nameMatch = wiki.name && wiki.name.toLowerCase().includes(searchTermLower);
        const domainMatch = wiki.domain && wiki.domain.toLowerCase().includes(searchTermLower);
        const descriptionMatch = wiki.description && wiki.description.toLowerCase().includes(searchTermLower);

        return nameMatch || domainMatch || descriptionMatch;
    });

    if (matches.length > 0) {
        console.log(`Found ${matches.length} matching popular wikis for "${searchTerm}"`);
    }

    return matches;
};

// Check for ModuleRegistry and register this module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DiscoverySearchOrchestrator', DiscoverySearchOrchestrator);
} else {
    window.DiscoverySearchOrchestrator = DiscoverySearchOrchestrator;
}
