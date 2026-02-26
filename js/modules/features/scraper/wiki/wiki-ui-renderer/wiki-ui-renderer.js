/**
 * Wiki UI Renderer Module (Facade)
 * 
 * Handles rendering of Wiki lists, Fandom lists, and status badges.
 * Delegates actual rendering to sub-modules:
 * - wur-status.js
 * - wur-fandom.js
 * - wur-entries.js
 * - wur-categories.js
 * 
 * @version 1.1.0 (Modularized)
 */
const WikiUIRenderer = window.WikiUIRenderer || {};

/**
 * Initialize the renderer
 */
WikiUIRenderer.init = function () {
    console.log('WikiUIRenderer initialized (Facade)');

    // Ensure all sub-modules are loaded
    const requiredMethods = [
        'renderFandomDomainList',
        'renderWikiEntryList',
        'renderWikiCategoryList',
        'getFandomCacheStatus',
        'getWikiCacheStatus',
        'getCategoryCacheStatus'
    ];

    const missingMethods = requiredMethods.filter(m => typeof WikiUIRenderer[m] !== 'function');

    if (missingMethods.length > 0) {
        console.warn('WikiUIRenderer: Some sub-modules may not be loaded:', missingMethods);
    }

    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiUIRenderer', WikiUIRenderer);
    }
};

// Global Export
window.WikiUIRenderer = WikiUIRenderer;
