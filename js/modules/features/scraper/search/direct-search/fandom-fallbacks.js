/**
 * Direct Search Fandom Fallbacks Module
 * 
 * Handles fallback search strategies (Bing, Offline, Suggestions) for Fandom.
 * Part of the modularized DirectSearchFandom feature.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DirectSearchFandom = window.DirectSearchFandom;

    if (!DirectSearchFandom) {
        console.error('DirectSearchFandom Fallbacks: Core module not loaded!');
        return;
    }

    /**
     * Toggle Bing search fallback on/off
     * @param {boolean} enabled - Whether to enable Bing fallback (optional, toggles if not provided)
     * @returns {boolean} - New state of Bing fallback
     */
    DirectSearchFandom.toggleBingFallback = function (enabled) {
        if (typeof enabled === 'boolean') {
            this._useBingFallback = enabled;
        } else {
            this._useBingFallback = !this._useBingFallback;
        }

        // Persist to localStorage
        localStorage.setItem('directSearch_useBingFallback', this._useBingFallback.toString());

        console.log(`DirectSearch: Bing fallback ${this._useBingFallback ? 'enabled' : 'disabled'}`);
        return this._useBingFallback;
    };

    /**
     * Check if Bing fallback is enabled
     * @returns {boolean} - Whether Bing fallback is enabled
     */
    DirectSearchFandom.isBingFallbackEnabled = function () {
        return this._useBingFallback;
    };

    /**
     * Perform Bing search fallback for Fandom wikis
     * @param {string} query - The search query
     * @returns {Promise<Array|null>} - Array of results or null if failed/disabled
     */
    DirectSearchFandom.performBingFallback = async function (query) {
        if (!this._useBingFallback || !window.CORSProxyManager || typeof CORSProxyManager.fetch !== 'function') {
            return null;
        }

        try {
            console.log('Trying Bing search fallback for Fandom wikis');
            const bingQuery = `${query} wiki fandom`;
            const bingSearchUrl = `https://www.bing.com/search?q=${encodeURIComponent(bingQuery)}&count=30`;

            const bingResponse = await CORSProxyManager.fetch(bingSearchUrl, {
                cache: 'no-store'
            });
            const bingHtml = await bingResponse.text();

            // Parse Bing HTML results
            const parser = new DOMParser();
            const bingDoc = parser.parseFromString(bingHtml, 'text/html');

            const bingResults = bingDoc.querySelectorAll('.b_algo');
            const foundWikis = [];

            bingResults.forEach(result => {
                try {
                    const linkElement = result.querySelector('h2 a');
                    if (linkElement && linkElement.href) {
                        const url = new URL(linkElement.href);
                        // Check if it's a Fandom wiki (not community.fandom.com)
                        if (url.hostname.includes('fandom.com') &&
                            !url.hostname.includes('community.fandom.com') &&
                            !url.hostname.includes('www.fandom.com')) {
                            const title = linkElement.textContent;
                            const description = result.querySelector('.b_caption p')?.textContent ||
                                result.querySelector('p')?.textContent ||
                                'No description available';

                            // Avoid duplicates by checking origin
                            if (!foundWikis.some(wiki => wiki.url === url.origin)) {
                                foundWikis.push({
                                    title: title.replace(' | Fandom', '').replace(' Wiki', '').trim() + ' Wiki',
                                    url: url.origin,
                                    domain: url.hostname,
                                    snippet: description.substring(0, 200),
                                    source: 'fandom',
                                    type: 'wiki',
                                    fromBing: true
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Error processing Bing result:', error);
                }
            });

            if (foundWikis.length > 0) {
                console.log(`Found ${foundWikis.length} Fandom wikis via Bing search fallback`);
                return foundWikis;
            }
        } catch (bingError) {
            console.warn('Bing search fallback failed:', bingError.message);
        }
        return null;
    };

    /**
     * Get a fallback Fandom search function
     * @returns {Function} A fallback search function
     */
    DirectSearchFandom.getFallbackSearch = function () {
        return async function (query) {
            // Check offline mode via DirectSearchCore if available
            const offlineMode = window.DirectSearchCore && typeof DirectSearchCore.checkOfflineMode === 'function'
                ? DirectSearchCore.checkOfflineMode()
                : false;

            console.log('Using fallback Fandom search for:', query);

            // Try online search first if available
            if (!offlineMode && typeof fetch === 'function' && navigator.onLine) {
                try {
                    // Try direct Fandom search if CORSProxyManager is available
                    if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                        const endpoint = `https://www.fandom.com/api/v1/search/wikis?query=${encodeURIComponent(query)}&limit=10`;
                        const response = await CORSProxyManager.fetch(endpoint);

                        if (response.ok) {
                            const data = await response.json();
                            if (data && data.items) {
                                return data.items.map(item => {
                                    return {
                                        title: item.name || item.title || `Fandom Wiki: ${query}`,
                                        url: item.url || `https://www.fandom.com/search?query=${encodeURIComponent(query)}`,
                                        snippet: item.description || 'A Fandom wiki',
                                        source: 'fandom',
                                        type: 'community'
                                    };
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.log('Online Fandom search failed, using offline fallback:', e.message);
                }
            }

            // Fallback results for offline mode
            return [
                {
                    title: `Search results for "${query}"`,
                    url: `https://www.fandom.com/search?query=${encodeURIComponent(query)}`,
                    snippet: 'Click to search on Fandom',
                    source: 'fandom',
                    type: 'community',
                    fallback: true
                },
                {
                    title: `Google search for "${query} fandom wiki"`,
                    url: `https://www.google.com/search?q=${encodeURIComponent(query)}+fandom+wiki`,
                    snippet: 'Try searching on Google',
                    source: 'external',
                    type: 'search',
                    fallback: true
                }
            ];
        };
    };

})();
