/**
 * Google CSE Results Module
 * 
 * Handles search execution and rendering of the CSE elements.
 * 
 * @version 1.0.0
 */

const CSEResults = (function () {
    let _hasRendered = false;

    return {
        /**
         * Check if already rendered
         */
        hasRendered: function () {
            return _hasRendered;
        },

        /**
         * Reset render state
         */
        resetRenderState: function () {
            _hasRendered = false;
        },

        /**
         * Manually render the CSE elements using HTML attributes
         * This strategy is more robust than JS-only render calls
         * @param {Object} config - CSE Configuration
         */
        renderCSE: function (config) {
            if (_hasRendered) return;

            if (!window.google || !window.google.search || !window.google.search.cse) {
                console.warn('CSEResults: API not ready to render yet.');
                return;
            }

            console.log('CSEResults: Executing manual render...');
            try {
                // Dependency: CSEUtils
                if (window.CSEUtils) {
                    window.CSEUtils.ensureContainersExist(config.containerIds);
                } else {
                    console.warn('CSEResults: CSEUtils missing, skipping container check.');
                }

                // Cleanup any existing components to prevent duplicates/conflicts (Fix for "Multiple components" error)
                const existingComponents = document.querySelectorAll('[data-gname="gsearch"]');
                if (existingComponents.length > 0) {
                    console.warn(`CSEResults: found ${existingComponents.length} existing gsearch components, cleaning up...`);
                    existingComponents.forEach(el => el.remove());
                }

                const searchBox = document.getElementById(config.containerIds.searchBoxId);
                const results = document.getElementById(config.containerIds.resultsContainerId);

                // Inject specific HTML tags for Google CSE to "discover"
                if (searchBox) {
                    searchBox.innerHTML = `<div class="gcse-searchbox" data-gname="gsearch"></div>`;
                }
                if (results) {
                    results.innerHTML = `<div class="gcse-searchresults" data-gname="gsearch"></div>`;
                }

                // Force Google to parse the new tags
                // go() must be called WITHOUT arguments to scan the whole document for gcse-* tags
                console.log('CSEResults: Calling google.search.cse.element.go()');
                window.google.search.cse.element.go();

                _hasRendered = true;

                // Setup preventers after a delay to allow elements to init
                if (config.preventNavigation && window.CSEHandlers) {
                    setTimeout(() => window.CSEHandlers.setupNavigationPreventers(config), 1000);
                }

                console.log('CSEResults: Manual render complete.');
            } catch (e) {
                console.error('CSEResults: Render failed:', e);
            }
        },

        /**
         * Programmatically execute a search
         * @param {string} query - Search term
         * @param {number} retryCount - Current retry attempt
         * @param {Function} retryCallback - Callback for retrying (usually bind to self)
         */
        executeSearch: function (query, retryCount = 0, retryCallback) {
            console.log(`CSEResults: Searching for: ${query} (Attempt ${retryCount + 1})`);

            try {
                if (window.google && window.google.search && window.google.search.cse && window.google.search.cse.element) {
                    const cseElement = window.google.search.cse.element;
                    // Try finding 'gsearch' (our explicitly named element)
                    let element = cseElement.getElement('gsearch');

                    // Fallback to any element
                    if (!element) {
                        const allElements = cseElement.getAllElements();
                        const keys = Object.keys(allElements);
                        if (keys.length > 0) {
                            console.log(`CSEResults: Using alternative element: ${keys[0]}`);
                            element = allElements[keys[0]];
                        }
                    }

                    if (element) {
                        element.execute(query);
                    } else {
                        console.error('CSEResults: Search element "gsearch" not found.');

                        // Auto-recover if possible
                        if (retryCount < 3 && typeof retryCallback === 'function') {
                            console.warn(`CSEResults: Retrying search in 500ms...`);
                            setTimeout(() => retryCallback(query, retryCount + 1), 500);
                        } else {
                            // Final failure
                            if (window.UI && UI.showErrorInMonitor) {
                                UI.showErrorInMonitor('Search Error: CSE Element Missing. Try Refreshing.');
                            }
                        }
                    }
                } else {
                    console.error('CSEResults: Google CSE API not loaded.');
                }
            } catch (e) {
                console.error('CSEResults: Error executing search:', e);
            }
        }
    };
})();

if (typeof ModuleRegistry !== 'undefined') {
    ModuleRegistry.register('CSEResults', CSEResults);
}
window.CSEResults = CSEResults;
