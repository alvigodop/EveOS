/**
 * Search Fandom API Module (Facade)
 * 
 * Handles API interactions with Fandom domains.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - FSASearch: Search strategies.
 * - FSADetails: Detail fetching and processing.
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    const SearchFandom = window.SearchFandom;

    if (!SearchFandom) {
        console.error('SearchFandom API: Core module not loaded!');
        return;
    }

    /**
     * Fetch live search results from a Fandom domain API
     * Delegates to FSASearch
     */
    SearchFandom.fetchLiveFandomDomainSearch = async function (domain, query) {
        if (window.FSASearch) {
            return await FSASearch.fetchLiveFandomDomainSearch(domain, query);
        }
        console.error('SearchFandom: FSASearch module not loaded');
        return [];
    };

    /**
     * Fetch live page details from a Fandom domain API
     * Delegates to FSADetails
     */
    SearchFandom.fetchLiveFandomPageDetails = async function (domain, pageTitle) {
        if (window.FSADetails) {
            return await FSADetails.fetchLiveFandomPageDetails(domain, pageTitle);
        }
        console.error('SearchFandom: FSADetails module not loaded');
        return null;
    };

})();
