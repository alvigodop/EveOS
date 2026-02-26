/**
 * Resource Loader Configuration
 * 
 * Contains the configuration for CSS and JS files to be loaded by the Resource Loader.
 * Extracted from resource-loader.js to reduce file size.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    console.log('[rl-config.js] Initializing resource loader configuration...');

    // Wait for contexts to be available or define empty defaults
    // In a real module system we'd import, but here we rely on load order or waiting

    // Helper to get CSS config
    function getCSSConfig() {
        if (window.ResourceLoaderCSSContext) {
            return window.ResourceLoaderCSSContext.CSS_FILES || window.ResourceLoaderCSSContext;
        }
        console.warn('[rl-config.js] ResourceLoaderCSSContext not found, using empty config');
        return {};
    }

    // Helper to get JS config
    function getJSConfig() {
        if (window.ResourceLoaderJSContext) {
            return window.ResourceLoaderJSContext.JS_FILES || window.ResourceLoaderJSContext;
        }
        console.warn('[rl-config.js] ResourceLoaderJSContext not found, using empty config');
        return {};
    }

    const CSS_FILES = getCSSConfig();
    const JS_FILES = getJSConfig();

    // Check if we actually got data
    if (Object.keys(CSS_FILES).length === 0) {
        console.error('[rl-config.js] Critical: CSS configuration missing!');
    }
    if (Object.keys(JS_FILES).length === 0) {
        console.error('[rl-config.js] Critical: JS configuration missing!');
    }

    // Expose config globally
    window.ResourceLoaderConfig = {
        CSS_FILES: CSS_FILES,
        JS_FILES: JS_FILES
    };

    console.log('[rl-config.js] Resource loader configuration initialized');

})();
