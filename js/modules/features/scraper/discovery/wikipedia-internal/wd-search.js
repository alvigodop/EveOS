/**
 * Wikipedia Discovery Search (Facade)
 * Handles search operations by delegating to Direct or Server strategies.
 */
(function () {
    if (typeof window.WDSearch === 'undefined') {
        window.WDSearch = {
            initialized: false,

            init: function () {
                this.initialized = true;
                return this;
            },

            discover: function (query, callback) {
                if (!query) {
                    console.warn('WDSearch: discover called with empty query.');
                    if (typeof callback === 'function') callback([]);
                    return;
                }

                console.log('WDSearch: Discovering wikis for query: ' + query);

                // Get mode from Core
                const mode = window.WDCore ? window.WDCore.getSearchMode() : 'direct';

                // Route based on search mode
                if (mode === 'server') {
                    if (window.WDSearchServer) {
                        window.WDSearchServer.search(query, callback);
                    } else {
                        console.error("WDSearchServer module not found");
                        callback([]);
                    }
                } else {
                    // Default to direct
                    if (window.WDSearchDirect) {
                        window.WDSearchDirect.search(encodeURIComponent(query.trim()), callback);
                    } else {
                        console.error("WDSearchDirect module not found");
                        callback([]);
                    }
                }
            }
        };
    }
})();
