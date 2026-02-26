/**
 * Relevance Scoring Module (Facade)
 * Handles scoring and sorting of search results based on relevance
 * 
 * Delegates to:
 * - RSScorer: Core scoring calculations
 * 
 * @version 1.1.0-facade
 */

window.RelevanceScorer = (function () {
    console.log('Loading RelevanceScorer module...');

    const RelevanceScorer = {
        name: 'RelevanceScorer',
        version: '1.1.0-facade',
        _initialized: false,

        init: function () {
            if (this._initialized) return this;
            console.log('Initializing RelevanceScorer...');
            if (window.RSScorer && typeof RSScorer.init === 'function') {
                RSScorer.init();
                RSScorer._initialized = true;
            }
            this._initialized = true;
            return this;
        },

        /**
         * Sort results by relevance score
         * @param {Array} results - Array of result objects
         * @param {string} searchTerm - The search query
         * @returns {Array} Sorted results
         */
        sortResultsByRelevance: function (results, searchTerm) {
            if (!results || results.length === 0) return results;
            if (!searchTerm) return results;

            // Calculate scores for all results
            const scoredResults = results.map(result => {
                const score = this.calculateRelevanceScore(result, searchTerm);
                return { ...result, _relevanceScore: score };
            });

            // Sort by score descending
            scoredResults.sort((a, b) => b._relevanceScore - a._relevanceScore);

            return scoredResults;
        },

        /**
         * Calculate relevance score - delegates to RSScorer
         */
        calculateRelevanceScore: function (result, searchTerm) {
            if (window.RSScorer) {
                return RSScorer.calculateRelevanceScore(result, searchTerm);
            }
            // Fallback: basic calculation
            const title = (result.title || '').toLowerCase();
            const term = (searchTerm || '').toLowerCase();
            if (title === term) return 100;
            if (title.includes(term)) return 50;
            return 0;
        },

        /**
         * Log relevance scores - delegates to RSScorer
         */
        logRelevanceScores: function (results, searchTerm) {
            if (window.RSScorer) {
                RSScorer.logRelevanceScores(results, searchTerm);
            }
        }
    };

    // Auto-init
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        RelevanceScorer.init();
    } else {
        document.addEventListener('DOMContentLoaded', () => RelevanceScorer.init());
    }

    return RelevanceScorer;
})();
