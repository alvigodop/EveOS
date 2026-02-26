/**
 * Wikipedia Discovery Core
 * Handles initialization, state management, and event listeners
 */
(function () {
    if (typeof window.WDCore === 'undefined') {
        window.WDCore = {
            version: '1.0.0',
            _initialized: false,
            _searchMode: 'direct', // 'direct', 'server', or 'google-cse'

            init: function () {
                if (this._initialized) return this;

                console.log('WDCore: Initializing...');
                this._initialized = true;
                this._setupEventListeners();

                // Set default search mode if global setting exists, or default to direct
                if (typeof window.getSearchMode === 'function') {
                    // Logic to sync with global settings could go here
                }

                return this;
            },

            _setupEventListeners: function () {
                if (window.EventBus) {
                    EventBus.subscribe('discovery:search', this._handleSearchRequest.bind(this));
                    console.log('WDCore: Subscribed to discovery events');
                }
            },

            _handleSearchRequest: function (data) {
                if (!data || !data.query) return;

                // Only process if it's a wikipedia request or general discovery
                if (data.source === 'wikipedia' || data.source === 'all') {
                    console.log('WDCore: Processing search request for: ' + data.query);
                    // Delegate to WDSearch if available
                    if (window.WDSearch) {
                        WDSearch.discover(data.query, data.callback);
                    } else {
                        console.warn('WDCore: WDSearch module not loaded');
                        if (typeof data.callback === 'function') data.callback([]);
                    }
                }
            },

            setSearchMode: function (mode) {
                if (mode === 'google-cse') {
                    this._searchMode = mode;
                    console.log('WDCore: Search mode set to:', mode);
                    if (window.setCSEMode) {
                        window.setCSEMode('google-cse', 'wikipedia');
                    }
                } else if (mode === 'direct' || mode === 'server') {
                    this._searchMode = mode;
                    console.log('WDCore: Search mode set to:', mode);
                    // Disable CSE if it was active
                    if (window.setCSEMode) {
                        window.setCSEMode('default', 'wikipedia');
                    }
                } else {
                    console.warn('WDCore: Invalid search mode:', mode);
                }
            },

            getSearchMode: function () {
                return this._searchMode;
            }
        };
    }
})();
