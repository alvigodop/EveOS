/**
 * Fandom Search Components - Logic (Facade)
 * Handles the core search algorithm, scoring, and workflow.
 * Delegates to specialized components.
 */
(function () {
    'use strict';

    // Ensure namespace exists
    window.FandomSearch = window.FandomSearch || {};
    const FandomSearch = window.FandomSearch;

    // Helper: Normalize search term
    FandomSearch.normalizeSearchTerm = function (term) {
        return term ? term.trim().toLowerCase() : '';
    };

    // Helper: Prepare search terms
    FandomSearch.prepareSearchTerms = function (term) {
        return {
            original: term,
            terms: term.split(/\s+/).filter(t => t.length > 0)
        };
    };

    // Helper: Format wiki name from query
    FandomSearch._formatWikiName = function (q) {
        if (!q) return 'Wiki';
        return q.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' Wiki';
    };

    /**
     * Searches for Fandom wikis using the provided search term.
     * Delegates to FandomSearchWorkflow.
     */
    FandomSearch.search = async function (searchTerm) {
        if (window.FandomSearchWorkflow) {
            return FandomSearchWorkflow.search(searchTerm);
        } else {
            console.error('FandomSearch: FandomSearchWorkflow module not loaded');
            throw new Error('Search functionality unavailable (Module missing)');
        }
    };

    /**
     * Search for Fandom wikis using all available methods
     * Delegates to FandomSearchStrategy.
     */
    FandomSearch.searchFandomWikis = async function (query, options = {}) {
        if (window.FandomSearchStrategy) {
            return FandomSearchStrategy.searchFandomWikis(query, options);
        } else {
            console.error('FandomSearch: FandomSearchStrategy module not loaded');
            return [];
        }
    };

    console.log('[FandomSearch.Logic] Loaded (Facade)');
})();
