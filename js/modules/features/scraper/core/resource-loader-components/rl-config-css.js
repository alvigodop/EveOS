/**
 * Resource Loader Configuration - CSS
 * 
 * Contains the configuration for CSS files to be loaded by the Resource Loader.
 * Extracted from rl-config.js to reduce file size.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    console.log('[rl-config-css.js] Initializing CSS configuration...');

    const CSS_FILES = {
        // Core CSS
        core: [
            'js/modules/core/styles/variables.css?v=1.0.1',
            'js/modules/core/styles/base.css?v=1.0.2',
            'js/modules/core/styles/dark-mode.css?v=1.0.1'
        ],

        // Shared highlight styles (prioritized)
        shared: [
            'js/modules/ui/styles/shared-highlight.css?v=1.0.1'
        ],

        // UI CSS - Core
        uiCore: [
            'js/modules/ui/result-display/result-display.css?v=1.0.2',
            'js/modules/ui/tab-manager/tab-manager.css?v=1.0.1',
            'js/modules/ui/popup-manager/popup-manager.css?v=1.0.1',
            'js/modules/ui/module-status/ui-module-status.css?v=1.0.1',
            'js/modules/ui/styles/layout-controls.css?v=1.0.1',
            'js/modules/ui/dropdown-handler/dropdown.css?v=1.0.1',
            'js/modules/ui/styles/app-layout.css?v=1.0.1',
            'js/modules/ui/styles/legacy-enhancements.css?v=1.0.1',
            'js/modules/ui/styles/inline-overrides.css?v=1.0.1'
        ],

        // UI CSS - Modular Extractions
        uiModular: [
            'js/modules/ui/styles/badges.css?v=1.0.0',
            'js/modules/ui/search-controls/toggle-switches.css?v=1.0.0',
            'js/modules/ui/styles/control-center.css?v=1.0.0',
            'js/modules/ui/styles/domain-manager.css?v=1.0.0',
            'js/modules/ui/styles/article-cards.css?v=1.0.0',
            'js/modules/ui/result-display/cached-results.css?v=1.0.0',
            'js/modules/ui/result-display/result-layouts.css?v=1.0.0',
            'js/modules/ui/result-display/result-card.css?v=1.0.0',
            'js/modules/ui/result-display/result-grid.css?v=1.0.0',
            'js/modules/ui/result-display/result-container.css?v=1.0.0',
            'js/modules/ui/styles/failsafe.css?v=1.0.0',
            'js/modules/ui/styles/fallback-forms.css?v=1.0.0',
            'js/modules/ui/styles/layout-overrides.css?v=1.0.0'
        ],

        // Discovery CSS
        discovery: [
            'js/modules/discovery/styles/google-search-ui.css?v=1.0.0',
            'js/modules/discovery/styles/entry-list.css?v=1.0.0',
            'js/modules/discovery/styles/wikipedia-section.css?v=1.0.0',
            'js/modules/discovery/styles/fandom-search.css?v=1.0.0',
            'js/modules/discovery/styles/google-search-internal.css?v=1.0.0',
            'js/modules/discovery/styles/wiki-listing.css?v=1.0.0',
            'js/modules/discovery/discovery.css?v=1.0.2',
            'js/modules/discovery/styles/domain-entry.css?v=1.0.0',
            'js/modules/discovery/styles/google-search-scraper.css?v=1.0.4',
            'js/modules/discovery/styles/google-knowledge-panel.css?v=1.0.0',
            'js/modules/discovery/styles/empty-states.css?v=1.0.0',
            'js/modules/discovery/styles/google-search-errors.css?v=1.0.0'
        ],

        // Features CSS
        features: [
            'js/modules/features/wiki-manager.css?v=1.0.1',
            'js/modules/features/search-manager.css?v=1.0.1',
            'js/modules/features/cache-visualization.css?v=1.0.0'
        ],

        // Search CSS
        search: [
            'js/modules/search/google-cse/google-cse-embedded.css?v=1.0.5',
            'js/modules/search/google-cse/google-cse-layout.css?v=1.0.0',
            'js/modules/search/google-cse/google-cse-results.css?v=1.0.0',
            'js/modules/search/google-cse/google-cse-overrides.css?v=1.0.0',
            'js/modules/search/shared/search-forms.css?v=1.0.0'
        ],

        // Utils CSS
        utils: [
            'js/modules/utils/styles/utility.css?v=1.0.1',
            'js/modules/utils/connectivity/connectivity-test.css?v=1.0.1',
            'js/modules/utils/cors-proxy/cors-proxy-manager.css?v=1.0.1',
            'js/modules/utils/force-reload/force-reload.css?v=1.0.1',
            'js/modules/utils/error-handling/interceptor/module-error-display-interceptor.css?v=1.0.0',
            'js/modules/utils/browser-emulator/browser-emulator.css?v=1.0.0',
            'js/modules/utils/error-handling/formatter/error-formatter.css?v=1.0.0',
            'js/modules/utils/error-handling/suppressor/error-suppressor.css?v=1.0.0',
            'js/modules/ui/loading-indicator/loading-indicators.css?v=1.0.0'
        ]
    };

    // Expose CSS config globally
    window.ResourceLoaderCSSContext = CSS_FILES;

    console.log('[rl-config-css.js] CSS configuration loaded');

})();
