/**
 * DiscoveryStrategy - Fandom
 * Encapsulates the logic for executing Fandom-based discovery (Direct Search)
 */
window.FandomDiscovery = window.FandomDiscovery || {};

Object.assign(window.FandomDiscovery, {
    /**
     * Execute Fandom direct search strategy
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @param {boolean} isFallback - Whether this is a fallback attempt
     * @returns {Promise<Object>} Result object { success, results, method }
     */
    executeFandomStrategy: async function (query, options, isFallback = false) {
        if (!options.useFandomSearch) {
            return { success: false, results: [] };
        }

        try {
            console.log(`FandomDiscovery: Executing Fandom direct search strategy ${isFallback ? '(fallback)' : ''}`);
            // searchFandomWikis is assumed to be available on FandomDiscovery
            const fandomResults = await this.searchFandomWikis(query);

            if (fandomResults && fandomResults.length > 0) {
                const method = isFallback ? 'fandom-fallback' : 'fandom';
                console.log(`FandomDiscovery: Found ${fandomResults.length} results via Fandom direct search`);
                return {
                    success: true,
                    results: fandomResults,
                    method: method
                };
            }
        } catch (error) {
            console.warn(`FandomDiscovery: Error with Fandom direct search strategy ${isFallback ? '(fallback)' : ''}`, error);
            return { success: false, error: error };
        }

        return { success: false, results: [] };
    }
});
