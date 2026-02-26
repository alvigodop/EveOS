/**
 * Relevance Scoring - Scorer
 * Core scoring logic extracted from relevance-scoring.js
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const RSScorer = {
        version: '1.0.0',

        init: function () {
            console.log('RSScorer initialized');
            return this;
        },

        /**
         * Calculate relevance score for a single result
         * @param {Object} result - Result object
         * @param {string} searchTerm - The search query
         * @returns {number} Score
         */
        calculateRelevanceScore: function (result, searchTerm) {
            let score = 0;
            const searchTermLower = (searchTerm || '').toLowerCase();
            const searchWords = searchTermLower.split(/\s+/).filter(Boolean);
            const title = (result.title || '').toLowerCase();
            const url = (result.url || '').toLowerCase();
            const description = (result.description || result.snippet || '').toLowerCase();

            // Title matching (most important)
            if (title === searchTermLower) {
                score += 100; // Exact match
            } else if (title.startsWith(searchTermLower)) {
                score += 80; // Title starts with search term
            } else if (title.includes(searchTermLower)) {
                score += 50; // Title contains search term
            }

            // Word matching in title
            let titleWordMatches = 0;
            searchWords.forEach(word => {
                if (title.includes(word)) {
                    titleWordMatches++;
                    score += 15;
                }
            });

            // Bonus for matching all words in title
            if (searchWords.length > 1 && titleWordMatches === searchWords.length) {
                score += 25;
            }

            // URL relevance
            if (url.includes(searchTermLower.replace(/\s+/g, ''))) {
                score += 20;
            }
            if (url.includes('wiki')) {
                score += 10; // Wiki URLs slightly preferred
            }

            // Description/snippet matching
            if (description.includes(searchTermLower)) {
                score += 15;
            }
            searchWords.forEach(word => {
                if (description.includes(word)) {
                    score += 5;
                }
            });

            // Source bonuses
            const source = (result.source || '').toLowerCase();
            if (source === 'fandom' || source === 'fandom wiki') {
                score += 5;
            } else if (source === 'wikipedia') {
                score += 8;
            }

            // Penalty for disambiguation pages
            if (title.includes('disambiguation') || title.includes('(disambiguation)')) {
                score -= 30;
            }

            // Penalty for list pages
            if (title.startsWith('list of ')) {
                score -= 15;
            }

            // Penalty for very long titles (likely less relevant)
            if (title.length > 80) {
                score -= 10;
            }

            // Quality indicator bonus
            if (result.thumbnail || result.image) {
                score += 5;
            }

            return Math.max(0, score); // Ensure non-negative
        },

        /**
         * Log relevance scores for debugging
         * @param {Array} results - Array of results
         * @param {string} searchTerm - Search query
         */
        logRelevanceScores: function (results, searchTerm) {
            if (!results || results.length === 0) return;

            console.group('Relevance Scores for: ' + searchTerm);
            results.slice(0, 10).forEach((result, index) => {
                const score = result._relevanceScore || this.calculateRelevanceScore(result, searchTerm);
                console.log(`${index + 1}. [${score}] ${result.title || 'No title'}`);
            });
            console.groupEnd();
        }
    };

    // Expose globally
    window.RSScorer = RSScorer;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('RSScorer', RSScorer);
    }
})();
