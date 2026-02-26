/**
 * Result Enricher - Fandom
 * Handles Fandom-specific content type inference and override logic
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const REFandom = {
        version: '1.0.0',

        init: function () {
            console.log('REFandom initialized');
            return this;
        },

        /**
         * Check if domain is Fandom
         */
        isFandomDomain: function (domain) {
            return domain && domain.includes('fandom.com');
        },

        /**
         * Apply Fandom-specific title inference
         * Returns type OR null to fall back to standard logic
         */
        inferFandomTitleType: function (result, typeFromTitle, snippet, hasSnippet, hasCategories) {
            // On Fandom: If title inference returns 'other' or 'Real-Person' but we have
            // NO snippet and NO categories, default to Fictional-Character
            if (typeFromTitle === 'other' || typeFromTitle === 'Real-Person') {
                if (!hasSnippet && !hasCategories) {
                    // No reliable data - check title pattern
                    if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(result.title)) {
                        return 'Fictional-Character';
                    } else {
                        return 'article';
                    }
                }
            }
            return typeFromTitle;
        },

        /**
         * Apply Fandom override for Real-Person detection
         * Called after standard enrichment when result.contentType === 'Real-Person'
         */
        applyFandomRealPersonOverride: function (result, snippet) {
            const hasSnippet = snippet && snippet.trim() && !snippet.toLowerCase().includes('no snippet');
            const hasCategories = result.categories && result.categories.length > 0;
            const title = result.title || '';
            const titleLower = title.toLowerCase();

            // Check for real-person role keywords
            const hasRealPersonKeyword = this.hasRealPersonKeyword(titleLower);

            // Check title pattern
            const isLikelyRealPerson = this.isLikelyRealPersonName(title);

            // Check for clearly fictional patterns
            const isClearlyFictional = this.isClearlyFictional(title, titleLower);

            // Only override if clearly fictional, NOT if it looks like a real person
            if (!hasSnippet && !hasCategories && !hasRealPersonKeyword && !isLikelyRealPerson && isClearlyFictional) {
                return 'Fictional-Character';
            } else if (!hasSnippet && !hasCategories && !hasRealPersonKeyword && !isLikelyRealPerson) {
                // Ambiguous - default to Fictional-Character on Fandom
                return 'Fictional-Character';
            }

            return result.contentType; // Keep original
        },

        /**
         * Check if title contains real-person role keywords
         */
        hasRealPersonKeyword: function (titleLower) {
            const keywords = [
                'mangaka', 'author', 'creator', 'writer', 'artist', 'director',
                'producer', 'actor', 'actress', 'voice actor', 'animator',
                'illustrator', 'seiyū', 'seiyu'
            ];
            return keywords.some(kw => titleLower.includes(kw));
        },

        /**
         * Check if title follows "First Last" pattern (likely real person)
         * Excludes fictional descriptors
         */
        isLikelyRealPersonName: function (title) {
            const isFirstLastPattern = /^[A-Z][a-zō]+\s+[A-Z][a-zō]+$/.test(title);
            if (!isFirstLastPattern) return false;

            const words = title.split(/\s+/);
            const fictionalDescriptors = [
                'black', 'white', 'red', 'blue', 'green', 'gold', 'silver', 'dark', 'light',
                'jr', 'jr.', 'sr', 'sr.', 'super', 'ultra', 'mega', 'mini', 'baby', 'kid',
                'king', 'queen', 'prince', 'princess', 'lord', 'lady', 'master', 'sage',
                'god', 'demon', 'devil', 'angel', 'dragon', 'shadow', 'phantom', 'ghost'
            ];
            const hasDescriptorAsLastName = words.length >= 2 &&
                fictionalDescriptors.includes(words[words.length - 1].toLowerCase().replace('.', ''));

            return !hasDescriptorAsLastName;
        },

        /**
         * Check for clearly fictional patterns in title
         */
        isClearlyFictional: function (title, titleLower) {
            const words = title.split(/\s+/);
            const fictionalDescriptors = [
                'black', 'white', 'red', 'blue', 'green', 'gold', 'silver', 'dark', 'light',
                'king', 'queen', 'prince', 'princess', 'lord', 'lady', 'master', 'sage',
                'god', 'demon', 'devil', 'angel', 'dragon', 'shadow', 'phantom', 'ghost'
            ];
            const hasDescriptorAsLastName = words.length >= 2 &&
                fictionalDescriptors.includes(words[words.length - 1].toLowerCase().replace('.', ''));

            return (
                titleLower.includes('(character)') ||
                titleLower.includes('(dragon ball)') ||
                titleLower.includes('(naruto)') ||
                titleLower.includes('(one piece)') ||
                hasDescriptorAsLastName ||
                /^[A-Z][a-z]+$/.test(title) // Single word like "Goku", "Naruto"
            );
        }
    };

    // Expose globally
    window.REFandom = REFandom;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('REFandom', REFandom);
    }
})();
