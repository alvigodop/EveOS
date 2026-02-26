/**
 * Search Discovery Broker (Facade)
 * 
 * Manages the "Discover Fandom Communities" functionality.
 * Bridges the gap between the Search UI and the various discovery backends.
 * 
 * [REFACTORED]
 * Delegates to:
 * - discovery-broker/sdb-core.js
 * - discovery-broker/sdb-fandom.js
 * - discovery-broker/sdb-wikipedia.js
 * - discovery-broker/sdb-ui.js
 */


window.SearchDiscoveryBroker = window.SearchDiscoveryBroker || {};
// Note: const declaration removed - sdb-core.js already declares it

/**
 * Search Fandom communities
 * Delegates to SDBFandom
 */
SearchDiscoveryBroker.searchFandomCommunities = async function (searchTerm, options = {}) {
    if (window.SDBFandom) {
        return SDBFandom.searchCommunities(searchTerm, options);
    } else {
        console.error('SearchDiscoveryBroker: SDBFandom module not loaded');
        // Fallback or error handling could go here
    }
};

/**
 * Discover Wikipedia articles
 * Delegates to SDBWikipedia
 */
SearchDiscoveryBroker.discoverWikipediaArticles = async function (query) {
    if (window.SDBWikipedia) {
        return SDBWikipedia.discoverArticles(query);
    } else {
        console.error('SearchDiscoveryBroker: SDBWikipedia module not loaded');
    }
};

/**
 * Handle search button click
 * Original logic retained or delegated if complex
 */
SearchDiscoveryBroker.handleSearchButtonClick = function (event, context) {
    // Prevent default form submission
    event.preventDefault();

    // Get the search input
    const searchInput = document.getElementById('search-input');
    if (!searchInput || !searchInput.value.trim()) {
        console.warn('SearchDiscoveryBroker: Empty search input');
        return;
    }

    // Get search term
    const searchTerm = searchInput.value.trim();

    // Get search options from context or defaults
    const searchOptions = (context && typeof context._getGlobalSearchOptions === 'function')
        ? context._getGlobalSearchOptions()
        : { useGoogleSearch: true, useFandomSearch: true };

    // Perform search action
    this.searchFandomCommunities(searchTerm, searchOptions);
};

/**
 * Fetch thumbnails for Wikipedia results in batches
 * Proxy for backward compatibility
 */
SearchDiscoveryBroker.fetchWikipediaThumbnails = async function (results) {
    if (window.SDBWikipedia) {
        return SDBWikipedia._fetchThumbnails(results);
    }
    // Fallback if SDBWikipedia not ready but ThumbnailLoader is
    if (window.ThumbnailLoader && typeof ThumbnailLoader.fetchWikipediaThumbnails === 'function') {
        return ThumbnailLoader.fetchWikipediaThumbnails(results);
    }
    return results;
};

// Initialize if core is present
if (window.SearchDiscoveryBroker && typeof SearchDiscoveryBroker.init === 'function') {
    SearchDiscoveryBroker.init();
}
