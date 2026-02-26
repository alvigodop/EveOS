/**
 * Fandom Search Logic - Workflow
 * Orchestrates the search process (normalize -> log -> direct -> discovery -> fallback)
 */
const FandomSearchWorkflow = {};

/**
 * Searches for Fandom wikis using the provided search term.
 * @param {string} searchTerm - The term to search for.
 * @returns {Promise<Array>} - A promise resolving to the search results.
 */
FandomSearchWorkflow.search = async function (searchTerm) {
    if (!searchTerm) {
        throw new Error('Please enter a search term');
    }

    // Ensure FandomSearch util is available (it's defined in the facade or api.js/utils.js)
    // We assume FandomSearch global exists and has helper methods
    const FandomSearch = window.FandomSearch || {};

    // Sanitize and normalize search term
    const normalizedSearchTerm = FandomSearch.normalizeSearchTerm ? FandomSearch.normalizeSearchTerm(searchTerm) : searchTerm.trim().toLowerCase();

    // Show loading indicator
    if (window.UI && typeof UI.updateLoadingIndicator === 'function') {
        UI.updateLoadingIndicator(true, 'loading-indicator', 'Searching for Fandom community wikis...');
    }

    try {
        // Save the search term to cache
        if (window.CacheManager && typeof CacheManager.logSearch === 'function') {
            CacheManager.logSearch(searchTerm, 'fandom');
        }

        // First try direct local search when available
        try {
            console.log('Trying direct local search first to avoid CORS issues');
            // Use our own direct search since FandomDiscovery was removed
            // Access via Facade or Strategy if available, but here we assume FandomSearch has it
            const directResults = FandomSearch.directSearchFandom ? await FandomSearch.directSearchFandom(normalizedSearchTerm) : [];

            if (directResults && directResults.length > 0) {
                console.log(`Found ${directResults.length} results using direct local search`);
                const enhancedResults = directResults.map(wiki => ({
                    ...wiki,
                    source: wiki.source || 'Fandom',
                    type: wiki.type || 'fandom'
                }));
                if (window.UI) UI.updateLoadingIndicator(false, 'loading-indicator');
                return enhancedResults;
            }
        } catch (directError) {
            console.error('Error with direct local search:', directError);
        }

        // Prepare search terms for multi-word handling
        const searchTerms = FandomSearch.prepareSearchTerms ? FandomSearch.prepareSearchTerms(normalizedSearchTerm) : { original: normalizedSearchTerm, terms: normalizedSearchTerm.split(' ') };

        // Check if Discovery module is available
        if (window.Discovery && typeof Discovery.searchForRealFandomWikis === 'function') {
            // Use Discovery module's searchForRealFandomWikis which now includes Google UI
            const results = await Discovery.searchForRealFandomWikis(normalizedSearchTerm, window.popularWikis || []);

            // Add enhanced properties to the results
            // Use Score and Match modules
            const scoreFn = (window.FandomSearchScore && FandomSearchScore.calculateWikiRelevance) ? FandomSearchScore.calculateWikiRelevance : () => 100;
            const matchFn = (window.FandomSearchMatch && FandomSearchMatch.countMatches) ? FandomSearchMatch.countMatches : () => 0;

            const enhancedResults = results.map(wiki => ({
                ...wiki,
                relevance: scoreFn(wiki, searchTerms),
                source: 'Fandom',
                type: 'fandom',
                matches: matchFn(wiki, searchTerms)
            }));

            // Sort by relevance
            enhancedResults.sort((a, b) => b.relevance - a.relevance);

            // Hide loading indicator
            if (window.UI) UI.updateLoadingIndicator(false, 'loading-indicator');
            return enhancedResults;
        } else {
            // Fallback to direct search if Discovery module is not available
            console.warn('Discovery module not available, falling back to direct search');
            const directResults = FandomSearch.directSearchFandom ? await FandomSearch.directSearchFandom(normalizedSearchTerm) : [];
            if (directResults && directResults.length > 0) {
                const enhancedResults = directResults.map(wiki => ({
                    ...wiki,
                    source: wiki.source || 'Fandom',
                    type: wiki.type || 'fandom'
                }));
                if (window.UI) UI.updateLoadingIndicator(false, 'loading-indicator');
                return enhancedResults;
            }
        }

        // If we get here, no results were found
        if (window.UI) UI.updateLoadingIndicator(false, 'loading-indicator');
        return [];
    } catch (error) {
        if (window.UI) UI.updateLoadingIndicator(false, 'loading-indicator');
        console.error(`Error searching for Fandom wikis: ${error.message}`);
        throw new Error(`Error searching for Fandom community wikis: ${error.message}`);
    }
};

// Ensure global availability
window.FandomSearchWorkflow = FandomSearchWorkflow;
console.log('[FandomSearchWorkflow] Loaded');
