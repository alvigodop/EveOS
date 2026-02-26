/**
 * Fandom Community Search Core Module
 * 
 * Manages state and logic for Fandom Community Search.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    if (!window.FandomCSCore) {
        const FandomCSCore = {
            version: '1.0.0',
            _initialized: false,

            // Configuration
            config: {
                RESULTS_PER_PAGE: 15,
                MAX_API_RESULTS: 100
            },

            // State
            state: {
                currentPage: 1,
                totalResults: 0,
                currentQuery: '',
                lastSearchTerm: '',
                openMode: 'popup',
                isLoading: false,
                searchEngine: 'google'
            },

            /**
             * Initialize the core module
             */
            init: function () {
                console.log('Initializing FandomCSCore');
                this._initialized = true;
                return this;
            },

            /**
             * Reset state for a new search
             */
            resetSearchState: function () {
                this.state.currentPage = 1;
                this.state.totalResults = 0;
            },

            /**
             * Reset all state (clear)
             */
            resetAllState: function () {
                this.state.currentPage = 1;
                this.state.totalResults = 0;
                this.state.currentQuery = '';
                this.state.lastSearchTerm = '';
                this.state.isLoading = false;
            },

            /**
             * Set loading state
             */
            setLoading: function (isLoading) {
                this.state.isLoading = isLoading;
                if (window.FandomCSUI) {
                    FandomCSUI.updateLoadingState(isLoading);
                }
            },

            /**
             * Update open mode
             */
            setOpenMode: function (mode) {
                this.state.openMode = mode;
                console.log(`FandomCSCore: Link open mode set to ${mode}`);
            },

            /**
             * Set the search engine mode
             */
            setSearchEngine: function (engine) {
                this.state.searchEngine = engine;
            },

            /**
             * Update pagination state
             */
            updatePaginationState: function (page, total) {
                this.state.currentPage = page;
                if (total !== undefined) {
                    this.state.totalResults = total;
                }
            },

            /**
             * Execute search based on current state
             */
            executeSearch: function (page = 1) {
                if (this.state.isLoading) return;

                // Ensure UI has latest query if this is a pagination call
                const query = this.state.lastSearchTerm;
                if (!query && page > 1) return;

                if (window.FandomCSAPI) {
                    FandomCSAPI.fetchResults(page);
                }
            }
        };

        window.FandomCSCore = FandomCSCore;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('FandomCSCore', FandomCSCore);
        }
    }
})();
