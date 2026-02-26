/**
 * Search Options Module
 * 
 * Handles reading search configuration and filters from the DOM.
 * Extracted from SearchManager.js to separate UI state reading from search logic.
 */

window.SearchOptions = window.SearchOptions || {};
const SearchOptions = window.SearchOptions;

/**
 * Gathers search options from the UI elements for the current source.
 * @param {string} source - 'wikipedia' or 'fandom'
 * @returns {object} Object containing filter/display options.
 */
SearchOptions.getOptions = function (source) {
    const options = {};

    const getElementValue = (id, defaultValue, isCheckbox = false) => {
        const element = document.getElementById(id);
        if (!element) {
            return defaultValue;
        }
        return isCheckbox ? element.checked : element.value;
    };

    // Layout & Grouping (Global)
    // Check for active layout button first (New UI)
    const activeLayoutBtn = document.querySelector('.layout-btn.active');
    if (activeLayoutBtn) {
        options.layout = activeLayoutBtn.id.includes('List') ? 'list' : 'grid';
    } else {
        // Fallback to old select if buttons not found
        options.layout = getElementValue('layoutSelect', 'grid');
    }

    options.groupBy = getElementValue('groupBySelect', 'none');

    // Search Strategy & Filters (Global)
    options.hybridSearch = getElementValue('hybridSearchToggle', true, true);
    options.liveSearch = getElementValue('liveSearchToggle', false, true);
    options.hidePersons = getElementValue('hidePersonsToggle', true, true);
    options.hideTextMatches = getElementValue('hideTextMatchesToggle', true, true);
    options.hideSourceArticles = getElementValue('hideSourceArticlesToggle', true, true);
    options.smartDedup = getElementValue('smartDedupToggle', true, true);

    // General Filters
    options.mangaFilter = getElementValue('mangaFilter', false, true);
    options.webNovelFilter = getElementValue('webNovelFilter', false, true);

    // Add other potential options like cache preferences, etc.
    options.useCache = !(options.liveSearch); // Simplistic mapping for now

    return options;
};

/**
 * Get global search options from UI toggles (e.g. Google vs Fandom search)
 * @returns {Object} The search options
 */
SearchOptions.getGlobalOptions = function () {
    const options = {
        useGoogleSearch: true,
        useFandomSearch: true,
        prioritizeGoogleSearch: true
    };

    // Get toggle states from GoogleSearchScraper if available
    if (window.GoogleSearchScraper && GoogleSearchScraper.config) {
        options.useGoogleSearch = GoogleSearchScraper.config.useGoogleSearch !== false;
        options.useFandomSearch = GoogleSearchScraper.config.useFandomSearch !== false;
        options.prioritizeGoogleSearch = options.useGoogleSearch;
    }

    // Get toggle elements
    const googleToggle = document.getElementById('use-google-search');
    const fandomToggle = document.getElementById('use-fandom-search');

    // Override with toggle values if available
    if (googleToggle) {
        options.useGoogleSearch = googleToggle.checked;
        // Prioritize Google search if the toggle is enabled
        options.prioritizeGoogleSearch = googleToggle.checked;
    }

    if (fandomToggle) {
        options.useFandomSearch = fandomToggle.checked;
    }

    console.log('SearchOptions: Global options:',
        'useGoogleSearch:', options.useGoogleSearch,
        'useFandomSearch:', options.useFandomSearch,
        'prioritizeGoogleSearch:', options.prioritizeGoogleSearch
    );

    return options;
};

console.log('SearchOptions module loaded');
