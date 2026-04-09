/**
 * Direct Search Wikipedia API Module
 * 
 * Handles API interactions for Wikipedia search.
 * Part of the modularized DirectSearchWikipedia feature.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DirectSearchWikipedia = window.DirectSearchWikipedia;

    if (!DirectSearchWikipedia) {
        console.error('DirectSearchWikipedia API: Core module not loaded!');
        return;
    }

    /**
     * Search Wikipedia directly using the Wikipedia API
     * @param {string} query - The search query
     * @returns {Promise<Array>} - A promise resolving to an array of search results
     */
    DirectSearchWikipedia.discoverWikipedia = async function (query) {
        console.log('Performing direct Wikipedia search for:', query);

        try {
            // Try to use direct Wikipedia API with origin=* parameter that allows CORS
            // Added srnamespace=0 to only return main article namespace
            // Added profile=strict to focus on relevance to the actual search term
            const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srnamespace=0&profile=strict&origin=*`;

            // Try using CORSProxyManager if available
            if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                console.log('Using CORSProxyManager for Wikipedia search');
                try {
                    const response = await CORSProxyManager.fetch(endpoint);

                    // Check if response is a valid JSON response
                    let data;
                    try {
                        data = await response.json();
                    } catch (parseError) {
                        console.warn('Failed to parse Wikipedia API response:', parseError);
                        throw new Error('Invalid JSON response from Wikipedia API');
                    }

                    if (!data || !data.query || !data.query.search) {
                        console.warn('Wikipedia API returned unexpected format:', data);
                        throw new Error('Invalid response format from Wikipedia API');
                    }

                    const searchResults = data.query.search || [];
                    console.log(`Found ${searchResults.length} Wikipedia articles using CORSProxyManager`);

                    // Format and filter results (using Logic module)
                    return this.filterWikipediaResults(searchResults, query);
                } catch (proxyError) {
                    console.warn('CORSProxyManager failed for Wikipedia search:', proxyError);
                    // Fall back to direct approach below
                }
            }

            // Try direct approach with origin=*
            console.log('Trying direct Wikipedia API call with origin=*');
            const fetchWikimediaResponse = window.EveOS?.API?.Core?.fetchWikimediaResponse;
            const response = typeof fetchWikimediaResponse === 'function'
                ? await fetchWikimediaResponse(endpoint, {
                    mode: 'cors',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                : await fetch(endpoint, {
                    mode: 'cors',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

            if (response.ok) {
                const data = await response.json();

                if (!data || !data.query || !data.query.search) {
                    console.warn('Wikipedia API returned unexpected format:', data);
                    throw new Error('Invalid response format from Wikipedia API');
                }

                const searchResults = data.query.search || [];

                console.log(`Found ${searchResults.length} Wikipedia articles using direct API call`);

                // Format and filter results
                return this.filterWikipediaResults(searchResults, query);
            } else {
                console.error('Wikipedia API returned status:', response.status);
                throw new Error(`Wikipedia API error: ${response.status}`);
            }
        } catch (error) {
            console.error('Error with direct Wikipedia API call:', error);

            // Try to use WikipediaDiscovery if available
            if (window.WikipediaDiscovery && typeof WikipediaDiscovery.discover === 'function') {
                console.log('Using WikipediaDiscovery for search');
                try {
                    return await WikipediaDiscovery.discover(query);
                } catch (fallbackError) {
                    console.error('Error using WikipediaDiscovery:', fallbackError);
                }
            }

            // Last resort: Generate sample results with a fallback search URL
            console.log('Using fallback search URL for Wikipedia');
            return [
                {
                    title: `Search results for "${query}"`,
                    url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}&ns0=1`,
                    snippet: 'Click to search on Wikipedia',
                    source: 'wikipedia',
                    type: 'article',
                    fallback: true
                },
                {
                    title: `Google search for "${query} wikipedia"`,
                    url: `https://www.google.com/search?q=${encodeURIComponent(query)}+wikipedia`,
                    snippet: 'Try searching on Google',
                    source: 'external',
                    type: 'search',
                    fallback: true
                }
            ];
        }
    };

})();
