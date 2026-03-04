/**
 * Resource Loader Configuration - JS (Facade)
 *
 * JS categories are split across files in rl-config-js-sections/.
 */

(function () {
    'use strict';

    console.log('[rl-config-js.js] Initializing JS configuration...');

    const SECTION_FILES = [
        'rl-section-foundation.js',
        'rl-section-ui-storage.js',
        'rl-section-search-features.js',
        'rl-section-runtime.js'
    ];

    const CATEGORY_KEYS = [
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

    function haveAllCategories(registry) {
        return CATEGORY_KEYS.every(key => Array.isArray(registry[key]));
    }

    function getBasePath() {
        const src = String(document.currentScript?.src || '');
        if (!src) return null;
        return src.replace(/rl-config-js\.js(?:\?.*)?$/i, '');
    }

    function loadSectionScriptSync(url) {
        window.ResourceLoaderJSSectionFilesLoaded = window.ResourceLoaderJSSectionFilesLoaded || {};
        if (window.ResourceLoaderJSSectionFilesLoaded[url]) return true;

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.send();

            if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                // eslint-disable-next-line no-eval
                window.eval(`${xhr.responseText}\n//# sourceURL=${url}`);
                window.ResourceLoaderJSSectionFilesLoaded[url] = true;
                return true;
            }

            console.warn(`[rl-config-js.js] Failed to load section script: ${url} (status ${xhr.status})`);
            return false;
        } catch (error) {
            console.warn(`[rl-config-js.js] Failed to load section script: ${url}`, error);
            return false;
        }
    }

    function ensureSectionRegistry() {
        window.ResourceLoaderJSSections = window.ResourceLoaderJSSections || {};
        if (haveAllCategories(window.ResourceLoaderJSSections)) {
            return window.ResourceLoaderJSSections;
        }

        const basePath = getBasePath();
        if (!basePath) {
            console.warn('[rl-config-js.js] Unable to resolve base path for section scripts.');
            return window.ResourceLoaderJSSections;
        }

        SECTION_FILES.forEach(fileName => {
            loadSectionScriptSync(`${basePath}rl-config-js-sections/${fileName}`);
        });

        return window.ResourceLoaderJSSections || {};
    }

    const sections = ensureSectionRegistry();
    const JS_FILES = {
        errorHandling: Array.isArray(sections.errorHandling) ? sections.errorHandling : [],
        core: Array.isArray(sections.core) ? sections.core : [],
        storage: Array.isArray(sections.storage) ? sections.storage : [],
        ui: Array.isArray(sections.ui) ? sections.ui : [],
        searchDiscovery: Array.isArray(sections.searchDiscovery) ? sections.searchDiscovery : [],
        features: Array.isArray(sections.features) ? sections.features : [],
        utilities: Array.isArray(sections.utilities) ? sections.utilities : [],
        debug: Array.isArray(sections.debug) ? sections.debug : [],
        startup: Array.isArray(sections.startup) ? sections.startup : []
    };

    if (!haveAllCategories(JS_FILES)) {
        console.warn('[rl-config-js.js] One or more JS category arrays are missing.');
    }

    // Expose JS config globally
    window.ResourceLoaderJSContext = JS_FILES;

    console.log('[rl-config-js.js] JS configuration loaded');
})();
