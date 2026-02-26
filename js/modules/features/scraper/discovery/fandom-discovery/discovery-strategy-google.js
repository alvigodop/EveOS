/**
 * DiscoveryStrategy - Google
 * Encapsulates the logic for executing Google-based discovery
 */
window.FandomDiscovery = window.FandomDiscovery || {};

Object.assign(window.FandomDiscovery, {
    /**
     * Execute Google search strategy
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Result object { success, results, method }
     */
    executeGoogleStrategy: async function (query, options) {
        if (!options.useGoogleSearch) {
            return { success: false, results: [] };
        }

        try {
            console.log('FandomDiscovery: Executing Google search strategy');
            // searchWithGoogle is assumed to be available on FandomDiscovery (from core/extensions)
            const googleResults = await this.searchWithGoogle(query, options);

            if (googleResults && googleResults.success && googleResults.results.length > 0) {
                console.log(`FandomDiscovery: Found ${googleResults.results.length} results via Google`);
                return {
                    success: true,
                    results: googleResults.results,
                    method: 'google'
                };
            }
        } catch (error) {
            console.error('FandomDiscovery: Error with Google search strategy', error);
            return { success: false, error: error };
        }

        console.log('FandomDiscovery: Google search strategy yielded no results');
        return { success: false, results: [] };
    },

    /**
     * Check compatibility for Google Search
     * @param {Object} options 
     */
    checkGoogleCompatibility: function (options) {
        if (options.useGoogleSearch && typeof window.BrowserEmulator === 'undefined') {
            console.warn('FandomDiscovery: BrowserEmulator module not available for Google search');
            if (typeof window.ErrorNotifier !== 'undefined') {
                window.ErrorNotifier.showGoogleSearchError({
                    message: 'Google Search is enabled but the BrowserEmulator module is not available. Please try enabling Fandom Direct Search.'
                });
            }
        } else if (options.useGoogleSearch && typeof window.BrowserEmulator !== 'undefined' &&
            typeof window.BrowserEmulator.renderUrl !== 'function') {
            console.warn('FandomDiscovery: BrowserEmulator.renderUrl function not available for Google search');

            if (typeof window.BrowserEmulator.fixGoogleCompatibility === 'function') {
                const fixed = window.BrowserEmulator.fixGoogleCompatibility();
                if (fixed && typeof window.ErrorNotifier !== 'undefined') {
                    window.ErrorNotifier.showGoogleSearchError({
                        message: 'Google Search capabilities have been fixed. Please try your search again.',
                        addFixButton: false
                    });
                }
            }
        }
    }
});
