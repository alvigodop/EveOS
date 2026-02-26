/**
 * Google Search Scraper Module (Facade)
 * 
 * Provides functionality to scrape Google search results for Fandom wikis.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - GoogleScraperConfig: Configuration
 * - GoogleScraperCore: Scraping logic
 * - GoogleScraperConnectivity: Connectivity checks
 * - GoogleScraperUI: UI rendering
 * 
 * @version 2.1.0-facade
 */

const GoogleSearchScraper = {};

/**
 * Initialize the GoogleSearchScraper module
 */
GoogleSearchScraper.init = function (options = {}) {
    console.log('Initializing GoogleSearchScraper module (Facade v2.1.0)');

    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('GoogleSearchScraper', GoogleSearchScraper);
    }

    // Initialize sub-modules
    if (window.GoogleScraperConfig && typeof GoogleScraperConfig.init === 'function') {
        GoogleScraperConfig.init();
    }
    if (window.GoogleScraperCore && typeof GoogleScraperCore.init === 'function') {
        GoogleScraperCore.init();
    }
    if (window.GoogleScraperConnectivity && typeof GoogleScraperConnectivity.init === 'function') {
        GoogleScraperConnectivity.init();
    }
    if (window.GoogleScraperUI && typeof GoogleScraperUI.init === 'function') {
        GoogleScraperUI.init();
    }

    // Initialize search toggles
    this.initSearchToggles();

    // Check connectivity
    this.checkGoogleConnectivity();

    GoogleSearchScraper._initialized = true;
    return true;
};

/**
 * List of CORS proxies (Delegated)
 */
if (!Object.getOwnPropertyDescriptor(GoogleSearchScraper, 'CORS_PROXIES')) {
    Object.defineProperty(GoogleSearchScraper, 'CORS_PROXIES', {
        get: function () { return window.GoogleScraperConfig ? GoogleScraperConfig.CORS_PROXIES : []; }
    });
}

/**
 * Initialize search toggle controls
 */
GoogleSearchScraper.initSearchToggles = function () {
    if (window.GoogleScraperUI) {
        GoogleScraperUI.initSearchToggles();
        // Sync options
        GoogleSearchScraper.searchOptions = GoogleScraperUI.searchOptions;
    }
};

/**
 * Scrape Google search for Fandom wikis
 */
GoogleSearchScraper.scrapeGoogleForFandomWikis = async function (query, options = {}) {
    if (window.GoogleScraperCore) {
        return GoogleScraperCore.scrapeGoogleForFandomWikis(query, options);
    }
    return { success: false, error: 'GoogleScraperCore missing', results: [] };
};

/**
 * Generate potential wiki results based on search term (Fallback)
 */
GoogleSearchScraper.generatePotentialWikis = function (searchTerm) {
    if (window.GoogleScraperCore) {
        return GoogleScraperCore.generatePotentialWikis(searchTerm);
    }
    return [];
};

/**
 * Check Google connectivity
 */
GoogleSearchScraper.checkGoogleConnectivity = async function () {
    if (window.GoogleScraperConnectivity) {
        return GoogleScraperConnectivity.checkGoogleConnectivity();
    }
};

/**
 * Check if the BrowserEmulator is ready
 */
GoogleSearchScraper.isEmulatorReady = function () {
    if (window.GoogleScraperConnectivity) {
        return GoogleScraperConnectivity.isEmulatorReady();
    }
    return false;
};

/**
 * Render search results in Google-like style
 */
GoogleSearchScraper.renderGoogleStyleResults = function (results, searchTerm, container) {
    if (window.GoogleScraperUI) {
        return GoogleScraperUI.renderGoogleStyleResults(results, searchTerm, container);
    }
};

/**
 * Display search results in the specified container
 */
GoogleSearchScraper.displayResults = function (results, containerId = 'search-results', query = '') {
    if (window.GoogleScraperUI) {
        return GoogleScraperUI.displayResults(results, containerId, query);
    }
};

// Global Exposure
window.GoogleSearchScraper = GoogleSearchScraper;

// Auto-init check
if (window.GoogleScraperConfig && GoogleScraperConfig.autoInit !== false) {
    // We wait a tick to ensure all sub-modules are loaded if this runs inline
    setTimeout(() => {
        if (!GoogleSearchScraper._initialized) GoogleSearchScraper.init();
    }, 0);
}