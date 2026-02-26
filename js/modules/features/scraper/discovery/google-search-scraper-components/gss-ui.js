/**
 * Google Search Scraper UI Component
 * Handles rendering of search results in Google-like style.
 */
const GoogleScraperUI = {};

/**
 * Initialize the module
 */
GoogleScraperUI.init = function () {
    console.log('GoogleScraperUI initialized');
};

/**
 * Initialize search toggle controls
 */
GoogleScraperUI.initSearchToggles = function () {
    const googleToggle = document.getElementById('googleSearchToggle');
    const localToggle = document.getElementById('localSearchToggle');
    const discoveryToggle = document.getElementById('discoverySearchToggle');

    // Default options
    GoogleScraperUI.searchOptions = {
        googleSearchEnabled: true,
        prioritizeGoogleSearch: true
    };

    // Load from local storage
    if (localStorage.getItem('googleSearchEnabled')) {
        GoogleScraperUI.searchOptions.googleSearchEnabled = localStorage.getItem('googleSearchEnabled') === 'true';
    }

    // Set initial UI state
    if (googleToggle) googleToggle.checked = GoogleScraperUI.searchOptions.googleSearchEnabled;

    // Listeners
    if (googleToggle) {
        googleToggle.addEventListener('change', (e) => {
            GoogleScraperUI.searchOptions.googleSearchEnabled = e.target.checked;
            localStorage.setItem('googleSearchEnabled', e.target.checked);
        });
    }

    // Note: Other toggles handled elsewhere or shared, but this init is specific to scraper prefs.
};

/**
 * Render search results in Google-like style
 * @param {Array} results - The search results to render
 * @param {string} searchTerm - The search term used
 * @param {HTMLElement} container - The container to render results in
 */
GoogleScraperUI.renderGoogleStyleResults = function (results, searchTerm, container) {
    if (!container) return;

    container.innerHTML = '';

    if (!results || results.length === 0) {
        container.innerHTML = '<div class="no-results">No results found via Google Search.</div>';
        return;
    }

    const list = document.createElement('div');
    list.className = 'google-results-list';

    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'google-result-item';

        const title = result.title || 'No Title';
        const link = result.url || '#';
        const snippet = result.description || result.snippet || '';
        const displayLink = result.domain || (link !== '#' ? new URL(link).hostname : '');

        item.innerHTML = `
            <div class="g-result-header">
                <div class="g-result-url">${displayLink}</div>
                <a href="${link}" class="g-result-title" target="_blank">${title}</a>
            </div>
            <div class="g-result-snippet">${snippet}</div>
        `;
        list.appendChild(item);
    });

    container.appendChild(list);
};

/**
 * Display search results in the specified container
 * @param {Array} results - Array of search results to display
 * @param {string} containerId - ID of the container element
 * @param {string} query - The search query
 */
GoogleScraperUI.displayResults = function (results, containerId = 'search-results', query = '') {
    const container = document.getElementById(containerId);
    if (container) {
        this.renderGoogleStyleResults(results, query, container);
    }
};

window.GoogleScraperUI = GoogleScraperUI;
