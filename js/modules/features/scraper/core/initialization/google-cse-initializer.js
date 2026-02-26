/**
 * Google CSE (Custom Search Engine) Initializer
 * 
 * Delegates initialization to the GoogleCSEEmbedded module.
 * 
 * @version 1.2.0
 */

(function () {
    const checkAndInit = () => {
        if (window.GoogleCSEEmbedded) {
            console.log('google-cse-initializer.js: initializing GoogleCSEEmbedded...');

            // Get config from global object if available, otherwise let the module handle defaults
            const config = window.googleCseConfig || {};

            GoogleCSEEmbedded.init({
                cseId: config.cseId,
                containerIds: config.containerIds
            });

            // Check for URL query
            const urlParams = new URLSearchParams(window.location.search);
            const q = urlParams.get('q');
            if (q) {
                console.log('google-cse-initializer.js: Auto-searching for:', q);
                GoogleCSEEmbedded.search(q);
            }

        } else {
            console.warn('google-cse-initializer.js: GoogleCSEEmbedded module not found, retrying...');
            setTimeout(checkAndInit, 100);
        }
    };

    // Initialize Fandom Search if available
    const initFandom = () => {
        // Only initialize if the UI is present (e.g. Scraper tab is open)
        if (document.getElementById('fandom-search-input') && 
            typeof FandomCommunitySearch !== 'undefined' && 
            typeof FandomCommunitySearch.init === 'function') {
            FandomCommunitySearch.init();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            checkAndInit();
            initFandom();
        });
    } else {
        checkAndInit();
        initFandom();
    }

})();
