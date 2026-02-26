/**
 * Cache UI Module (Facade)
 * 
 * Orchestrates Cache UI components.
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    if (!window.CacheUI) {
        const CacheUI = {
            version: '1.1.0-facade',
            _initialized: false,

            init: function () {
                this._initialized = true;
                console.log('[CacheUI] Facade initialized');
                return this;
            },

            /**
             * View all cached data 
             */
            viewCache: function () {
                if (window.CUISummary) {
                    CUISummary.viewCache();
                } else {
                    console.error('[CacheUI] CUISummary module not loaded');
                }
            },

            /**
             * Display cached data in a popup window
             */
            displayCachedData: function (data, title) {
                if (window.CUIPopup) {
                    CUIPopup.displayCachedData(data, title);
                } else {
                    console.error('[CacheUI] CUIPopup module not loaded');
                }
            },

            /**
             * Show a toast notification
             */
            showToast: function (message, type = 'info') {
                if (window.CUIUtils) {
                    CUIUtils.showToast(message, type);
                } else {
                    console.error('[CacheUI] CUIUtils module not loaded');
                }
            },

            // Legacy private methods exposed for compatibility if needed
            _renderCacheList: function (data, title) {
                return window.CUIList ? CUIList.renderCacheList(data, title) : '';
            },

            _renderCacheCard: function (entry) {
                return window.CUIList ? CUIList.renderCacheCard(entry) : '';
            },

            _renderStatsGrid: function (data, title) {
                return window.CUIStats ? CUIStats.renderStatsGrid(data, title) : '';
            }
        };

        window.CacheUI = CacheUI;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('CacheUI', CacheUI);
        }
    }
})();
