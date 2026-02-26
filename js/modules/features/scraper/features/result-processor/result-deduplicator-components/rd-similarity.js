/**
 * Result Deduplicator - Similarity Module
 * Handles title similarity checking and fuzzy matching logic.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const RDSimilarity = {
        version: '1.0.0',

        init: function () {
            console.log('RDSimilarity initialized');
            return this;
        },

        /**
         * Check if two titles are similar enough to be considered duplicates
         * @param {string} t1 Title 1
         * @param {string} t2 Title 2
         * @returns {boolean}
         */
        areTitlesSimilar: function (t1, t2) {
            if (!t1 || !t2) return false;

            // exact match check first (fast)
            if (t1 === t2) return true;

            t1 = t1.toLowerCase().trim();
            t2 = t2.toLowerCase().trim();

            if (t1 === t2) return true;

            // Remove punctuation/special chars for clearer comparison
            const clean1 = t1.replace(/[^a-z0-9]/g, '');
            const clean2 = t2.replace(/[^a-z0-9]/g, '');

            // Close match after cleaning (e.g. "Spider-Man" vs "Spiderman")
            if (clean1 === clean2 && clean1.length > 3) return true;

            // Levenshtein Distance for small typos 
            // (High threshold only for very long words to avoid false positives)
            if (clean1.length > 5 && clean2.length > 5) {
                const dist = this.levenshteinDistance(clean1, clean2);
                // Allow 1 edit for medium length, 2 for very long
                const threshold = (clean1.length > 10) ? 2 : 1;

                // Ensure length difference isn't too big relative to edit distance
                if (dist <= threshold && Math.abs(clean1.length - clean2.length) <= threshold) {
                    return true;
                }
            }

            // Substring/Parenthesis handling
            // Check for "Name" vs "Name (Media)"
            if (t1.includes(t2) || t2.includes(t1)) {
                const shorter = t1.length < t2.length ? t1 : t2;
                const longer = t1.length < t2.length ? t2 : t1;

                // Check if the longer one starts with the shorter one and has parens
                // e.g. "Naruto" and "Naruto (Anime)"
                if (longer.startsWith(shorter)) {
                    const remainder = longer.substr(shorter.length).trim();
                    if (remainder.startsWith('(') && remainder.endsWith(')')) {
                        // It's a bracketed suffix. 
                        return true;
                    }
                }
            }

            return false;
        },

        /**
         * Basic Levenshtein implementation
         * @param {string} a First string
         * @param {string} b Second string
         * @returns {number} Edit distance
         */
        levenshteinDistance: function (a, b) {
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;

            const matrix = [];

            // increment along the first column of each row
            for (let i = 0; i <= b.length; i++) {
                matrix[i] = [i];
            }

            // increment each column in the first row
            for (let j = 0; j <= a.length; j++) {
                matrix[0][j] = j;
            }

            // Fill in the rest of the matrix
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                            Math.min(matrix[i][j - 1] + 1, // insertion
                                matrix[i - 1][j] + 1)); // deletion
                    }
                }
            }

            return matrix[b.length][a.length];
        }
    };

    // Expose globally
    window.RDSimilarity = RDSimilarity;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('RDSimilarity', RDSimilarity);
    }
})();
