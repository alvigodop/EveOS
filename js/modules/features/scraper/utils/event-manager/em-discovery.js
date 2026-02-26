/**
 * Event Manager - Discovery Sub-module
 * Handles discovery search events and logic
 */

window.EventManagerDiscovery = window.EventManagerDiscovery || {};

(function (module) {

    /**
     * Set up discovery search event handlers
     */
    module.setupDiscoverySearch = function () {
        // Discovery search handlers (silent)

        // Wikipedia discovery search - only setup if WikipediaDiscovery is not available
        const searchWikiArticlesBtn = document.getElementById('searchWikiArticlesBtn');
        if (searchWikiArticlesBtn) {
            // Check if WikipediaDiscovery module exists and is properly initialized
            const isWikipediaDiscoveryAvailable =
                window.WikipediaDiscovery &&
                typeof WikipediaDiscovery.handleSearch === 'function';

            if (isWikipediaDiscoveryAvailable) {
                console.log('Using WikipediaDiscovery module for Wikipedia search - skipping EventManager handler');
                // The event handler is setup by the WikipediaDiscovery module itself
            } else {
                // Only add event listener if WikipediaDiscovery module is not available
                // Using fallback handler

                // First remove any existing click listeners to prevent duplicates
                const oldClickHandler = searchWikiArticlesBtn._eventManagerClickHandler;
                if (oldClickHandler) {
                    searchWikiArticlesBtn.removeEventListener('click', oldClickHandler);
                }

                // Create new handler and store reference for future removal
                const clickHandler = () => {
                    const wikiDiscoveryInput = document.getElementById('wikiDiscoveryInput');
                    if (!wikiDiscoveryInput || !wikiDiscoveryInput.value.trim()) {
                        alert('Please enter a search term');
                        return;
                    }

                    this.performWikipediaSearch(wikiDiscoveryInput.value.trim());
                };

                // Save reference to handler
                searchWikiArticlesBtn._eventManagerClickHandler = clickHandler;

                // Add the new click handler
                searchWikiArticlesBtn.addEventListener('click', clickHandler);
            }
        }

        // Fandom discovery search setup
        module.setupFandomDiscoverySearch();
    };

    /**
     * Set up Fandom discovery search event handlers
     */
    module.setupFandomDiscoverySearch = function () {
        const searchWikisBtn = document.getElementById('searchWikisBtn');
        if (searchWikisBtn) {
            // First remove any existing click listeners to prevent duplicates
            const oldClickHandler = searchWikisBtn._eventManagerClickHandler;
            if (oldClickHandler) {
                searchWikisBtn.removeEventListener('click', oldClickHandler);
            }

            // Create new handler and store reference for future removal
            const clickHandler = () => {
                const discoveryInput = document.getElementById('discoveryInput');
                if (!discoveryInput || !discoveryInput.value.trim()) {
                    alert('Please enter a search term');
                    return;
                }

                this.performFandomSearch(discoveryInput.value.trim());
            };

            // Save reference to handler
            searchWikisBtn._eventManagerClickHandler = clickHandler;

            // Add the new click handler
            searchWikisBtn.addEventListener('click', clickHandler);
        }
    };

    /**
     * Perform Wikipedia search
     * @param {string} searchTerm - The term to search for
     */
    module.performWikipediaSearch = function (searchTerm) {
        if (!searchTerm) return;

        console.log(`EventManager performing Wikipedia search for: ${searchTerm}`);

        const resultsContainer = document.getElementById('wikiDiscoveryResults');
        const loadingIndicator = document.getElementById('loading-indicator-wiki');

        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }

        // Try to use WikipediaDiscovery if available
        if (window.WikipediaDiscovery && typeof WikipediaDiscovery.discover === 'function') {
            try {
                return new Promise((resolve, reject) => {
                    WikipediaDiscovery.discover(searchTerm, (results) => {
                        resolve(results || []);
                    });
                });
            } catch (error) {
                console.error('EventManager: Error during fallback Wikipedia discovery:', error);
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
                if (resultsContainer) {
                    resultsContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                }
            }
        } else {
            // Try to use WikiManager as backup
            if (window.WikiManager && typeof WikiManager.searchWikiArticles === 'function') {
                // Store the search term so WikiManager can use it
                const inputField = document.getElementById('wikiDiscoveryInput');
                if (inputField) {
                    inputField.value = searchTerm;
                }

                WikiManager.searchWikiArticles();
            } else {
                console.error('No Wikipedia search functionality available');

                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }

                if (resultsContainer) {
                    resultsContainer.innerHTML = '<div class="error">Search function not available</div>';
                }
            }
        }
    };

    /**
     * Perform Fandom search
     * @param {string} searchTerm - The term to search for
     */
    module.performFandomSearch = function (searchTerm) {
        if (!searchTerm) return;

        console.log(`EventManager performing Fandom search for: ${searchTerm}`);

        const resultsContainer = document.getElementById('discoveryResults');
        const loadingIndicator = document.getElementById('loading-indicator');

        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }

        // Try to use FandomSearch if available
        if (window.FandomSearch && typeof FandomSearch.search === 'function') {
            FandomSearch.search(searchTerm)
                .then(results => {
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }

                    if (window.UI && typeof UI.displayDiscoveryResults === 'function' && resultsContainer) {
                        UI.displayDiscoveryResults(results, searchTerm, resultsContainer);
                    }
                })
                .catch(error => {
                    console.error('Fandom discovery search error:', error);
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }
                    if (resultsContainer) {
                        resultsContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                    }
                });
        } else {
            console.error('Fandom search is not available');

            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }

            if (resultsContainer) {
                resultsContainer.innerHTML = '<div class="error">Search function not available</div>';
            }
        }
    };

})(window.EventManagerDiscovery);
