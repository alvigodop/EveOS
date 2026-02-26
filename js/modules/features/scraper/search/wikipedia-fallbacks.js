/**
 * Direct Search Wikipedia Fallbacks Module
 * 
 * Handles fallback strategies for Wikipedia search.
 * Part of the modularized DirectSearchWikipedia feature.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DirectSearchWikipedia = window.DirectSearchWikipedia;

    if (!DirectSearchWikipedia) {
        console.error('DirectSearchWikipedia Fallbacks: Core module not loaded!');
        return;
    }

    /**
     * Get a fallback Wikipedia search function
     * @returns {Function} A fallback function for Wikipedia search.
     */
    DirectSearchWikipedia.getFallbackSearch = function () {
        return async function fallbackDiscoverWikipedia(query) {
            console.warn('DirectSearchWikipedia: Using fallback Wikipedia search via GlobalFix or WikipediaDiscovery.');
            // Prioritize GlobalFix's fallback if available
            if (window.GlobalFix && typeof window.GlobalFix.discoverWikipedia === 'function') {
                return await window.GlobalFix.discoverWikipedia(query);
            }
            // Otherwise, try WikipediaDiscovery directly (which uses callbacks)
            else if (window.WikipediaDiscovery && typeof window.WikipediaDiscovery.discover === 'function') {
                console.warn('DirectSearchWikipedia: Using direct WikipediaDiscovery module (callback-based).');
                try {
                    // Wrap the callback-based function in a Promise
                    return new Promise((resolve) => {
                        // Call discover with the query and a callback
                        WikipediaDiscovery.discover(query, (results) => {
                            // Resolve the promise with the results (or empty array)
                            resolve(results || []);
                        });
                    });
                } catch (error) {
                    // Catch any synchronous error during the setup/call of discover
                    console.error('Error setting up fallback call to WikipediaDiscovery.discover:', error);
                    return []; // Return empty array on error
                }
            } else {
                console.error('DirectSearchWikipedia: No fallback method available for Wikipedia search.');
                if (window.ErrorNotifier) {
                    ErrorNotifier.showError('Cannot search Wikipedia. Required modules missing.', { recovery: 'Load GlobalFix or WikipediaDiscovery' });
                }
                return []; // Return empty array if no method found
            }
        };
    };

})();
