/**
 * Search Discovery Broker - Wikipedia Orchestration
 * 
 * Handles discovery of Wikipedia articles.
 */
(function () {
    const SDBWikipedia = {
        name: 'SDBWikipedia'
    };

    /**
     * Discover Wikipedia articles
     */
    SDBWikipedia.discoverArticles = async function (query) {
        console.log(`SDBWikipedia: Discovering articles for "${query}"`);

        // Determine UI targets (borrowing logic from original broker)
        const activeTabId = window.TabManager ? TabManager.getActiveTabId() : 'wikipediaTab';
        const isFandomTab = activeTabId === 'fandomTab' || (document.getElementById('fandomTab') && document.getElementById('fandomTab').classList.contains('active'));

        const targetId = isFandomTab ? 'wikiDiscoveryResultsFandom' : 'wikiDiscoveryResults';
        const loadingId = isFandomTab ? 'loading-indicator-fandom' : 'loading-indicator';

        const container = document.getElementById(targetId);
        const loadingIndicator = document.getElementById(loadingId);

        if (!container) {
            console.error(`SDBWikipedia: Target #${targetId} not found`);
            return;
        }

        // Show Loading
        if (window.SDBUI) {
            SDBUI.toggleLoading(true, loadingIndicator, container, 'Searching Wikipedia...');
        }

        try {
            if (!window.DirectSearch || typeof DirectSearch.discoverWikipedia !== 'function') {
                throw new Error('DirectSearch module unavailable');
            }

            // Perform Search
            let results = await DirectSearch.discoverWikipedia(query);
            console.log(`SDBWikipedia: Found ${results.length} initial results`);

            // Fetch Thumbnails
            results = await this._fetchThumbnails(results);

            // Render
            if (window.SDBUI) {
                const uiAvailable = !!(window.WikiManager && WikiManager.wikiEntries);
                if (!uiAvailable) console.warn('SDBWikipedia: WikiManager not fully ready');

                SDBUI.renderWikipediaResults(results, container, loadingIndicator);
            }

        } catch (error) {
            console.error('SDBWikipedia: Discovery error:', error);
            if (window.SDBUI) {
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                SDBUI.displayError(container, `Error searching Wikipedia: ${error.message}`);
            }
        }
    };

    /**
     * Fetch thumbnails helper
     */
    SDBWikipedia._fetchThumbnails = async function (results) {
        // Prioritize specialized WikipediaDiscovery
        if (window.WikipediaDiscovery && typeof WikipediaDiscovery.fetchThumbnails === 'function') {
            return await WikipediaDiscovery.fetchThumbnails(results);
        }
        // Fallback to generic ThumbnailLoader
        if (window.ThumbnailLoader && typeof ThumbnailLoader.fetchWikipediaThumbnails === 'function') {
            return await ThumbnailLoader.fetchWikipediaThumbnails(results);
        }
        return results;
    };

    window.SDBWikipedia = SDBWikipedia;
})();
