/**
 * Resource Loader Module
 * 
 * Centralized module for loading all CSS and JavaScript resources.
 * This consolidates all loadCss() calls and script loading from the HTML.
 * 
 * @version 1.0.1
 */

(function () {
    'use strict';

    console.log('[resource-loader.js] Initializing resource loader...');

    // ========================================
    // State Tracking (prevent double-loading)
    // ========================================

    let _cssLoaded = false;
    let _scriptsLoaded = false;
    let _scriptsLoading = false;

    // ========================================
    // CSS Loading Configuration
    // ========================================

    if (!window.ResourceLoaderConfig) {
        console.error('[resource-loader.js] ResourceLoaderConfig not found! Resources will not load. Ensure rl-config.js is loaded before resource-loader.js');
    }

    const CSS_FILES = window.ResourceLoaderConfig ? window.ResourceLoaderConfig.CSS_FILES : {};

    // ========================================
    // JavaScript Loading Configuration
    // ========================================

    const JS_FILES = window.ResourceLoaderConfig ? window.ResourceLoaderConfig.JS_FILES : {};

    // ========================================
    // Helper Functions
    // ========================================

    /**
     * Load a CSS file dynamically
     * @param {string} href - Path to the CSS file
     */
    function loadCss(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    /**
     * Load all CSS files in order
     */
    function loadAllCss() {
        // Prevent double-loading
        if (_cssLoaded) {
            console.log('[resource-loader.js] CSS already loaded, skipping');
            return;
        }

        const supportsImports = 'CSSImportRule' in window || (window.CSSRule && window.CSSRule.IMPORT_RULE);

        if (!supportsImports) {
            console.log('[resource-loader.js] Browser does not support CSS imports, loading individual CSS files as fallback');

            // Load all CSS categories in order
            Object.keys(CSS_FILES).forEach(category => {
                CSS_FILES[category].forEach(loadCss);
            });
        } else {
            console.log('[resource-loader.js] Browser supports CSS imports');
        }

        _cssLoaded = true;
    }

    /**
     * Load a JavaScript file dynamically
     * @param {string} src - Path to the JS file
     * @returns {Promise} - Resolves when script is loaded
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                resolve(src);
            };
            script.onerror = () => {
                console.error(`[resource-loader.js] Failed to load script: ${src}`);
                reject(new Error(`Failed to load script: ${src}`));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Load scripts sequentially within a category
     * @param {string[]} scripts - Array of script paths
     * @returns {Promise}
     */
    async function loadScriptsSequentially(scripts) {
        for (const script of scripts) {
            try {
                await loadScript(script);
            } catch (error) {
                console.error(`[resource-loader.js] Error loading ${script}:`, error);
                // Continue loading other scripts even if one fails
            }
        }
    }

    /**
     * Load all JavaScript files in the correct order
     */
    async function loadAllScripts() {
        // Prevent double-loading
        if (_scriptsLoaded || _scriptsLoading) {
            console.log('[resource-loader.js] Scripts already loaded or loading, skipping');
            return;
        }

        _scriptsLoading = true;
        console.log('[resource-loader.js] Starting to load JavaScript modules...');

        // Load categories in order (they depend on each other)
        const categories = [
            'errorHandling',
            'core',
            'storage',
            'ui',
            'searchDiscovery',
            'features',
            'utilities',
            'debug',
            'startup'
        ];

        for (const category of categories) {
            console.log(`[resource-loader.js] Loading ${category} modules...`);
            await loadScriptsSequentially(JS_FILES[category]);
        }

        console.log('[resource-loader.js] All JavaScript modules loaded');
        _scriptsLoaded = true;
        _scriptsLoading = false;

        // Log ResultDisplay check
        console.log('ResultDisplay loaded check:', !!window.ResultDisplay);
    }

    // ========================================
    // Public API
    // ========================================

    window.ResourceLoader = {
        version: '1.0.1',

        CSS_FILES: CSS_FILES,
        JS_FILES: JS_FILES,

        loadCss: loadCss,
        loadScript: loadScript,
        loadAllCss: loadAllCss,
        loadAllScripts: loadAllScripts,

        /**
         * Check if resources are loaded
         */
        get isLoaded() {
            return _cssLoaded && _scriptsLoaded;
        },

        get cssLoaded() {
            return _cssLoaded;
        },

        get scriptsLoaded() {
            return _scriptsLoaded;
        },

        /**
         * Initialize all resources (with double-load protection)
         */
        init: function () {
            if (_cssLoaded && _scriptsLoaded) {
                console.log('[resource-loader.js] Resources already loaded, skipping init');
                return Promise.resolve();
            }
            console.log('[resource-loader.js] Initializing all resources...');
            loadAllCss();
            return loadAllScripts();
        }
    };

    // Auto-initialize CSS immediately
    loadAllCss();

    // Load scripts when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            loadAllScripts();
        });
    } else {
        // DOM is already ready
        loadAllScripts();
    }

    console.log('[resource-loader.js] Resource loader initialized');
    window.ResourceLoader._initialized = true;
})();
