/**
 * Fix Direct Search Component
 * Logic for fixing DirectSearch module if missing or broken
 */
const FixDirectSearch = {
    /**
     * Fix DirectSearch module
     */
    fixDirectSearch: function () {
        if (!window.DirectSearch) {
            console.log('DirectSearch module not found, creating stub');
            // Create a minimal stub for DirectSearch that allows basic functionality
            window.DirectSearch = {
                version: '1.0.5-stub',
                _initialized: true,
                _functional: true,
                _offlineMode: true, // Offline mode by default for stub

                // Basic initialization function
                init: function () {
                    console.log('Initializing DirectSearch stub');
                    return this;
                },

                // Fallback search methods
                searchWikipedia: async function (query) {
                    console.log('Using DirectSearch stub for Wikipedia search:', query);
                    return [
                        {
                            title: `Search results for "${query}"`,
                            url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
                            snippet: 'Click to search on Wikipedia (stub)',
                            source: 'wikipedia',
                            type: 'article',
                            fallback: true
                        }
                    ];
                },

                searchFandom: async function (query) {
                    console.log('Using DirectSearch stub for Fandom search:', query);
                    return [
                        {
                            title: `Search results for "${query}"`,
                            url: `https://www.fandom.com/search?query=${encodeURIComponent(query)}`,
                            snippet: 'Click to search on Fandom (stub)',
                            source: 'fandom',
                            type: 'community',
                            fallback: true
                        }
                    ];
                },

                // Mock functionality tests that return false (offline)
                checkFunctionality: async function () {
                    return false; // Always return false for the stub
                },

                testEndpointAccess: async function () {
                    return false; // Always return false for the stub
                },

                // Setup method that does nothing since we've already created fallbacks
                setupFallbackMethods: function () {
                    console.log('DirectSearch stub: setupFallbackMethods called (no action needed)');
                },

                /**
                 * Provides a global fallback for discovering Wikipedia articles if DirectSearch isn't loaded.
                 * @param {string} query - The search query.
                 * @returns {Promise<Array>} - A promise resolving to an array of Wikipedia results.
                 */
                discoverWikipedia: async function (query) {
                    console.warn('GlobalFix: Using fallback discoverWikipedia.');
                    if (window.WikipediaDiscovery && typeof window.WikipediaDiscovery.discover === 'function') {
                        try {
                            // Wrap the callback-based discover in a Promise
                            return new Promise((resolve, reject) => {
                                WikipediaDiscovery.discover(query, (results) => {
                                    resolve(results || []); // Resolve with results or empty array
                                });
                            });
                        } catch (error) {
                            console.error('GlobalFix: Error calling WikipediaDiscovery.discover fallback:', error);
                            return [];
                        }
                    } else {
                        console.error('GlobalFix: Cannot perform Wikipedia search - WikipediaDiscovery module not found.');
                        if (window.ErrorNotifier) {
                            ErrorNotifier.showError('Wikipedia discovery module is missing.', { recovery: 'Load wikipedia-discovery.js' });
                        }
                        return [];
                    }
                }
            };

            // Register the stub with ModuleRegistry if available
            if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
                ModuleRegistry.register('DirectSearch', window.DirectSearch);
            }
        } else if (!window.DirectSearch._functional) {
            console.log('DirectSearch exists but is not functional, applying fix');

            // Always mark as functional
            window.DirectSearch._functional = true;

            // Set offlineMode if not present
            if (typeof window.DirectSearch._offlineMode !== 'boolean') {
                window.DirectSearch._offlineMode = true;
            }

            // Ensure the module has the setupFallbackMethods function
            if (typeof window.DirectSearch.setupFallbackMethods !== 'function') {
                window.DirectSearch.setupFallbackMethods = function () {
                    console.log('Setting up DirectSearch fallback methods (from GlobalFix)');

                    // Set up fallback search methods
                    this.searchWikipedia = async function (query) {
                        console.log('Using fallback Wikipedia search (from GlobalFix):', query);
                        return [
                            {
                                title: `Search results for "${query}"`,
                                url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
                                snippet: 'Click to search on Wikipedia',
                                source: 'wikipedia',
                                type: 'article',
                                fallback: true
                            }
                        ];
                    };

                    this.searchFandom = async function (query) {
                        console.log('Using fallback Fandom search (from GlobalFix):', query);
                        return [
                            {
                                title: `Search results for "${query}"`,
                                url: `https://www.fandom.com/search?query=${encodeURIComponent(query)}`,
                                snippet: 'Click to search on Fandom',
                                source: 'fandom',
                                type: 'community',
                                fallback: true
                            }
                        ];
                    };
                };
            }

            // Call the setupFallbackMethods function to fix the module
            window.DirectSearch.setupFallbackMethods();
        } else {
            // DirectSearch exists and is functional, check if it has all required features
            console.log('DirectSearch exists and is functional, ensuring it has all required features');

            // Add _offlineMode if it doesn't exist
            if (typeof window.DirectSearch._offlineMode !== 'boolean') {
                window.DirectSearch._offlineMode = !navigator.onLine; // Default to browser online status
                console.log(`Added _offlineMode=${window.DirectSearch._offlineMode} to DirectSearch`);
            }

            // Ensure it has the setupFallbackMethods function
            if (typeof window.DirectSearch.setupFallbackMethods !== 'function') {
                window.DirectSearch.setupFallbackMethods = function () {
                    console.log('Added setupFallbackMethods to DirectSearch (no action needed)');
                };
            }
        }

        // Fallback for DirectSearch.discoverWikipedia
        if (!window.DirectSearch || typeof window.DirectSearch.discoverWikipedia !== 'function') {
            console.warn('GlobalFix: DirectSearch.discoverWikipedia not found, applying fallback.');
            // Ensure DirectSearch object exists before attaching
            if (!window.DirectSearch) window.DirectSearch = {};
            window.DirectSearch.discoverWikipedia = async function (query) {
                console.warn('GlobalFix: Using DirectSearch.discoverWikipedia fallback.');
                // Use the globally defined fallback via the facade if possible, or direct logic
                // Since this runs within GlobalFix facade context, `this` should be GlobalFix
                // But referencing window.GlobalFix is safer here as `this` might depend on caller
                if (window.GlobalFix && typeof window.GlobalFix.discoverWikipedia === 'function') {
                    return await window.GlobalFix.discoverWikipedia(query);
                } else {
                    // Inline backup of discoverWikipedia logic for safety
                    console.warn('GlobalFix: Using inline discoverWikipedia fallback.');
                    if (window.WikipediaDiscovery && typeof window.WikipediaDiscovery.discover === 'function') {
                        return new Promise((resolve) => {
                            WikipediaDiscovery.discover(query, (results) => resolve(results || []));
                        });
                    }
                    return [];
                }
            };
        }
    }
};

window.FixDirectSearch = FixDirectSearch;
