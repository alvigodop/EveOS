/**
 * Fandom Search Components - API
 * Handles direct API requests and CORS proxies.
 */
(function () {
    'use strict';

    // Ensure namespace exists
    window.FandomSearch = window.FandomSearch || {};
    const FandomSearch = window.FandomSearch;

    /**
     * List of CORS proxies to try for Fandom API requests
     */
    FandomSearch.CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cors-anywhere-mjml.onrender.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://corsproxy.org/?',
        'https://api.allorigins.win/get?url='
    ];

    /**
     * Performs a direct search for Fandom wikis using local API
     * @param {string} searchTerm - The term to search for
     * @returns {Promise<Array>} - A promise resolving to the search results
     */
    FandomSearch.directSearchFandom = async function (searchTerm) {
        try {
            console.log(`Performing direct search for Fandom wikis with term: ${searchTerm}`);

            // Construct API URL
            const apiUrl = `/api/v1/Search/List?q=${encodeURIComponent(searchTerm)}`;

            // Make the request
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            console.log('Direct search API response:', data);

            // Check if the response includes results
            if (data && data.status === 'success' && Array.isArray(data.results)) {
                // Transform the results to match our expected format
                return data.results.map(wiki => ({
                    name: wiki.title || '',
                    domain: wiki.url || '',
                    url: wiki.url || '',
                    description: wiki.description || '',
                    favicon: wiki.favicon || '',
                    verified: wiki.verified || false,
                    source: 'Fandom Direct API',
                    type: 'fandom'
                }));
            }

            // No results found
            console.log('No results found from direct search API');
            return [];
        } catch (error) {
            console.error('Error in directSearchFandom:', error);
            // If there's an error, return an empty array instead of throwing
            // This allows the search process to continue with other methods
            return [];
        }
    };

    console.log('[FandomSearch.API] Loaded');
})();
