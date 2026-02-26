/**
 * Search UI Handler - Options
 * 
 * Manages listeners for search options and settings.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SUHOptions = {
        version: '1.0.0',

        init: function () {
            console.log('SUHOptions initialized');
            this.setupAllOptions();
            return this;
        },

        setupOptionListener: function (elementId, eventType = 'change') {
            const element = document.getElementById(elementId);
            if (element) {
                element.addEventListener(eventType, () => {
                    console.log(`SUHOptions: Option ${elementId} changed.`);
                    // Optionally re-display results if applicable
                    // Check if SearchManager has a last query
                    if (window.SearchManager && SearchManager._lastQueryOptions && SearchManager._lastQueryOptions.query && (
                        elementId.includes('Layout') ||
                        elementId.includes('GroupBy') ||
                        elementId.includes('Toggle') ||
                        elementId.includes('Filter')
                    )) {
                        console.log(`Re-displaying results due to option change: ${elementId}`);
                        // Trigger redisplay
                        SearchManager.performContentSearch(
                            SearchManager._lastQueryOptions.query,
                            SearchManager._lastQueryOptions.source,
                            null,
                            true // custom params: redisplayOnly=true to avoid re-fetch
                        );
                    }
                });
            }
        },

        setupAllOptions: function () {
            // Setup listeners for global options
            this.setupOptionListener('layoutSelect');
            this.setupOptionListener('groupBySelect');
            this.setupOptionListener('hybridSearchToggle');
            this.setupOptionListener('liveSearchToggle');
            this.setupOptionListener('hidePersonsToggle');
            this.setupOptionListener('hideTextMatchesToggle');
            this.setupOptionListener('hideSourceArticlesToggle');
            this.setupOptionListener('smartDedupToggle');

            // Manga/Web Novel filter listeners
            this.setupOptionListener('mangaFilter');
            this.setupOptionListener('webNovelFilter');

            // Bing Fallback Toggle
            this.setupBingFallback();
        },

        setupBingFallback: function () {
            const bingFallbackToggle = document.getElementById('bingSearchToggle');
            if (bingFallbackToggle) {
                console.log('SUHOptions: Found Bing Fallback toggle');
                // Initialize state from DirectSearch or localStorage
                if (window.DirectSearch) {
                    bingFallbackToggle.checked = window.DirectSearch._useBingFallback;
                } else {
                    bingFallbackToggle.checked = localStorage.getItem('directSearch_useBingFallback') !== 'false';
                }

                bingFallbackToggle.addEventListener('change', () => {
                    console.log(`SUHOptions: Bing Fallback toggled to ${bingFallbackToggle.checked}`);
                    if (window.DirectSearch && typeof DirectSearch.toggleBingFallback === 'function') {
                        DirectSearch.toggleBingFallback(bingFallbackToggle.checked);
                    }
                });
            }
        }
    };

    // Expose globally
    window.SUHOptions = SUHOptions;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SUHOptions', SUHOptions);
    }
})();
