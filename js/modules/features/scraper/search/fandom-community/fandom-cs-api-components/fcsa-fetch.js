/**
 * Fandom Community Search API - Fetch Component
 * Handles the logic for fetching results from various sources (Google API, Scrapers).
 */
(function () {
    'use strict';

    const FCSAFetch = {
        // Credentials (Scoped to this component)
        API_KEY: '***REMOVED-GOOGLE-API-KEY***',
        CX: '646ca4244f3524a8e',

        /**
         * Fetch search results based on current state
         */
        fetchResults: function (page) {
            // Dependency check
            if (!window.FandomCSCore || !window.FandomCSUI) {
                console.error('FCSAFetch: Core or UI not ready');
                return;
            }

            if (FandomCSCore.state.isLoading) return;

            const selectedEngine = FandomCSCore.state.searchEngine;
            const userInput = FandomCSCore.state.lastSearchTerm;

            if (!userInput) return;

            FandomCSCore.setLoading(true);

            // Routing based on selected engine
            if (window.FandomCSScraper) {
                if (selectedEngine === 'domain-guess') {
                    console.log('Fandom Search: Mode = Domain Guess');
                    FandomCSScraper.performDomainGuessSearch(userInput);
                    return;
                } else if (selectedEngine === 'yahoo') {
                    console.log('Fandom Search: Mode = Yahoo Scraper');
                    FandomCSScraper.performYahooSearchFallback(userInput);
                    return;
                } else if (selectedEngine === 'brave') {
                    console.log('Fandom Search: Mode = Brave Scraper');
                    FandomCSScraper.performBraveSearchFallback(userInput);
                    return;
                }
            }

            // Default: Google API
            console.log('Fandom Search: Mode = Google API');

            const RESULTS_PER_PAGE = FandomCSCore.config.RESULTS_PER_PAGE;
            const start = (page - 1) * RESULTS_PER_PAGE + 1;
            const maxApiStart = 101 - RESULTS_PER_PAGE;

            if (start > maxApiStart) {
                console.warn(`Fandom Search: Requested start index ${start} exceeds Google API limits.`);
                FandomCSUI.showInfoMessage('Cannot fetch beyond ~100 results due to API limitations.');
                FandomCSUI.updatePagination(page, Math.ceil(FandomCSCore.state.totalResults / RESULTS_PER_PAGE));
                FandomCSCore.setLoading(false);
                return;
            }

            const currentQuery = userInput
                ? `${userInput} site:fandom.com -site:www.fandom.com`
                : 'site:fandom.com -site:www.fandom.com';

            const firstNum = Math.min(10, RESULTS_PER_PAGE);
            const url1 = `https://www.googleapis.com/customsearch/v1?key=${this.API_KEY}&cx=${this.CX}&q=${encodeURIComponent(currentQuery)}&start=${start}&num=${firstNum}`;
            console.log(`Fandom Search: Fetching Google results: ${url1}`);

            fetch(url1)
                .then(response => response.json())
                .then(data1 => {
                    console.log('Fandom Search: API Response 1:', data1);
                    if (data1.error) {
                        this._handleApiError(data1.error);
                        return;
                    }

                    let combinedResults = data1.items || [];
                    const total = Math.min(parseInt(data1.searchInformation?.totalResults || 0), 100);
                    FandomCSCore.state.totalResults = total;

                    const resultsFetchedPart1 = combinedResults.length;
                    const stillNeeded = RESULTS_PER_PAGE - resultsFetchedPart1;
                    const nextStart = start + resultsFetchedPart1;

                    if (stillNeeded > 0 && resultsFetchedPart1 === 10 && nextStart <= maxApiStart) {
                        const secondNum = Math.min(10, stillNeeded);
                        const url2 = `https://www.googleapis.com/customsearch/v1?key=${this.API_KEY}&cx=${this.CX}&q=${encodeURIComponent(currentQuery)}&start=${nextStart}&num=${secondNum}`;

                        fetch(url2)
                            .then(response2 => response2.json())
                            .then(data2 => {
                                if (data2.items) combinedResults = combinedResults.concat(data2.items);
                                this._dispatchResults(combinedResults, page);
                            })
                            .catch(error => {
                                console.error('Fandom Search: Second fetch error:', error);
                                this._dispatchResults(combinedResults, page);
                            })
                            .finally(() => FandomCSCore.setLoading(false));
                    } else {
                        this._dispatchResults(combinedResults, page);
                        FandomCSCore.setLoading(false);
                    }
                })
                .catch(error => {
                    console.error('Fandom Search: First fetch network error:', error);
                    FandomCSUI.showError('Error fetching results. Check your network connection.');
                    FandomCSCore.setLoading(false);
                });
        },

        _dispatchResults: function (results, page) {
            if (window.FCSAProcess) {
                FCSAProcess.processAndDisplay(results, page);
            } else {
                console.error("FCSAProcess not loaded");
            }
        },

        _handleApiError: function (error) {
            console.error('Fandom Search: API Error:', error);

            const engine = FandomCSCore.state.searchEngine;

            // Auto-fallback for Quota Exceeded
            if (engine === 'google' && (error.code === 429 || error.code === 403 || error.code >= 500)) {
                console.log('Fandom Search: Google Quota exceeded. Switching to fallback...');

                if (window.FandomCSUI) {
                    FandomCSUI.showInfoMessage('🔄 Google API limit reached. Using Yahoo Search fallback...');
                    // Update visual selector if exists
                    if (FandomCSUI.elements.searchEngineSelector) {
                        FandomCSUI.elements.searchEngineSelector.value = 'yahoo';
                    }
                }

                if (window.FandomCSCore) FandomCSCore.setSearchEngine('yahoo');

                if (window.FandomCSScraper) {
                    FandomCSScraper.performYahooSearchFallback(FandomCSCore.state.lastSearchTerm);
                } else {
                    // Fallback fallback...
                    FandomCSUI.showManualSearchMessage(FandomCSCore.state.lastSearchTerm);
                }
                return;
            }

            let message = `Search Error: ${error.message}`;
            FandomCSUI.showError(message);
            FandomCSCore.setLoading(false);
        }
    };

    window.FCSAFetch = FCSAFetch;
})();
