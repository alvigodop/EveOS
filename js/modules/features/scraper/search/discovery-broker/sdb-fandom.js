/**
 * Search Discovery Broker - Fandom Orchestration
 * 
 * Handles searching for Fandom communities using various backends.
 */
(function () {
    const SDBFandom = {
        name: 'SDBFandom'
    };

    /**
     * Search Fandom communities with fallbacks
     */
    SDBFandom.searchCommunities = async function (searchTerm, options = {}) {
        console.log(`SDBFandom: Searching for "${searchTerm}"`, options);

        if (window.SearchUIRenderer) {
            SearchUIRenderer.showLoading(true, 'loading-indicator', `Searching for "${searchTerm}"...`);
        }

        try {
            // 1. Initialize BrowserEmulator if needed
            if (window.BrowserEmulator && !BrowserEmulator._initialized) {
                await BrowserEmulator.initialize();
            }

            // 2. Try FandomDiscovery
            if (window.FandomDiscovery && typeof FandomDiscovery.discoverFandomCommunities === 'function') {
                const result = await FandomDiscovery.discoverFandomCommunities(searchTerm, options);
                if (result && result.success && result.results.length > 0) {
                    this._displayResults(result.results, searchTerm, result.searchMethod);
                    return;
                }
                // If FandomDiscovery failed to find results, continue to fallbacks...
            }

            // 3. Fallback: Google Search
            if (options.useGoogleSearch && window.GoogleSearchScraper) {
                const googleResults = await GoogleSearchScraper.scrapeGoogleForFandomWikis(searchTerm);
                if (this._hasResults(googleResults)) {
                    this._displayResults(googleResults.results || googleResults, searchTerm, 'google');
                    return;
                }
            }

            // 4. Fallback: FandomSearch (Direct)
            if (options.useFandomSearch && window.FandomSearch) {
                const fandomResults = await FandomSearch.searchFandomWikis(searchTerm);
                if (fandomResults && fandomResults.length > 0) {
                    this._displayResults(fandomResults, searchTerm, 'fandom');
                    return;
                }
            }

            // 5. No results found
            this._displayNoResults(searchTerm);

        } catch (error) {
            console.error('SDBFandom: Error searching communities:', error);
            this._handleError(searchTerm, error, options);
        }
    };

    // Helper: Check if results object has data
    SDBFandom._hasResults = function (results) {
        if (Array.isArray(results) && results.length > 0) return true;
        if (results && results.results && results.results.length > 0) return true;
        return false;
    };

    // Helper: Display Results
    SDBFandom._displayResults = function (results, term, source) {
        if (window.SearchUIRenderer) {
            SearchUIRenderer.displaySearchResults(results, term, source);
        }
    };

    // Helper: Display No Results
    SDBFandom._displayNoResults = function (term) {
        if (window.SearchUIRenderer) {
            SearchUIRenderer.displayNoResults(term);
        }
    };

    // Helper: Handle Error
    SDBFandom._handleError = function (term, error, options) {
        if (window.SearchUIRenderer) {
            SearchUIRenderer.displayError(term, error, () => {
                this.searchCommunities(term, options);
            });
        }
        if (window.ErrorNotifier) {
            ErrorNotifier.showError('Error searching Fandom communities', { details: error });
        }
    };

    window.SDBFandom = SDBFandom;
})();
