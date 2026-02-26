/**
 * Discovery Module
 * Contains functions for discovering real Fandom wikis
 */

// Create the Discovery namespace
const Discovery = {};

/**
 * Initialize the Discovery module
 */
Discovery.init = function () {
    console.log('Initializing Discovery module');

    // Initialize PopularWikis if needed
    this.initPopularWikis();

    this._initialized = true;
    return this;
};

/**
 * Initialize PopularWikis module if needed
 */
Discovery.initPopularWikis = function () {
    // Check if PopularWikis exists but hasn't been initialized
    if (window.PopularWikis && typeof PopularWikis.init === 'function' && !PopularWikis._initialized) {
        console.log('Initializing PopularWikis module from Discovery');
        PopularWikis.init();
    }
};

// Array of CORS proxies to try
Discovery.CORS_PROXIES = []; // Deprecated: Moved to FandomAPI.CORS_PROXIES

// Local fallback for cases when all proxies fail
Discovery.LOCAL_SEARCH_ENABLED = true;

/**
 * Renders a Google-like search interface for Fandom wikis
 * @deprecated Use DiscoveryUI.renderGoogleSearchInterface instead
 * @param {string} searchTerm - The search term
 * @param {HTMLElement} container - The container to render in
 */
Discovery.renderGoogleSearchInterface = function (searchTerm, container) {
    if (window.DiscoveryUI && typeof DiscoveryUI.renderGoogleSearchInterface === 'function') {
        return DiscoveryUI.renderGoogleSearchInterface(searchTerm, container);
    }
    console.warn('DiscoveryUI not available, cannot render interface');
};

/**
 * Renders Google-style search results
 * @deprecated Use DiscoveryUI.renderGoogleSearchResults instead
 * @param {Array} results - The results to display
 * @param {HTMLElement} container - The container to render in
 * @param {string} searchTerm - The search term
 */
Discovery.renderGoogleSearchResults = function (results, container, searchTerm) {
    if (window.DiscoveryUI && typeof DiscoveryUI.renderGoogleSearchResults === 'function') {
        return DiscoveryUI.renderGoogleSearchResults(results, container, searchTerm);
    }
    console.warn('DiscoveryUI not available, cannot render results');
};

/**
 * Highlights search terms in text
 * @deprecated Use DiscoveryUI.highlightSearchTerms instead
 * @param {string} text - The text to highlight
 * @param {string} searchTerm - The search term
 * @returns {string} - Highlighted HTML
 */
Discovery.highlightSearchTerms = function (text, searchTerm) {
    if (window.DiscoveryUI && typeof DiscoveryUI.highlightSearchTerms === 'function') {
        return DiscoveryUI.highlightSearchTerms(text, searchTerm);
    }
    return text || '';
};

/**
 * Search for real Fandom wikis using Google scraping
 * @param {string} searchTerm - The search term to search for
 * @param {Array} [popularWikis=[]] - Optional array of popular wikis to search first
 * @returns {Promise<Array>} - Promise resolving to array of wiki results
 */
Discovery.searchForRealFandomWikis = async function (searchTerm, popularWikis = []) {
    if (window.DiscoverySearchOrchestrator && typeof DiscoverySearchOrchestrator.searchForRealFandomWikis === 'function') {
        return DiscoverySearchOrchestrator.searchForRealFandomWikis(searchTerm, popularWikis);
    }
    console.warn('DiscoverySearchOrchestrator not available');
    return [];
};

/**
 * Validates if a domain is a real Fandom community
 * @param {string} domain - The domain to validate
 * @param {string} proxy - The CORS proxy to use
 * @returns {Promise<boolean>} - A promise that resolves to true if the domain is a valid Fandom community
 */
Discovery.validateFandomCommunity = async function (domain, proxy) {
    if (window.DiscoveryDomains && typeof DiscoveryDomains.validateFandomCommunity === 'function') {
        return DiscoveryDomains.validateFandomCommunity(domain, proxy);
    }

    // Fallback if modules aren't loaded yet (though they should be)
    if (window.DomainValidator && typeof DomainValidator.checkDomainExists === 'function') {
        return new Promise(resolve => DomainValidator.checkDomainExists(domain, resolve));
    }

    console.warn('DiscoveryDomains and DomainValidator not available');
    return false;
};

/**
 * Check if a domain exists
 * @param {string} domain - The domain to check
 * @param {Function} callback - Callback function(exists) to call when check is complete
 */
Discovery.checkDomainExists = function (domain, callback) {
    if (window.DiscoveryDomains && typeof DiscoveryDomains.checkDomainExists === 'function') {
        DiscoveryDomains.checkDomainExists(domain, callback);
        return;
    }

    if (window.DomainValidator && typeof DomainValidator.checkDomainExists === 'function') {
        DomainValidator.checkDomainExists(domain, callback);
        return;
    }

    console.warn('DiscoveryDomains not available for checkDomainExists');
    if (callback) callback(false);
};

/**
 * Gets special variations of a search term
 * @param {string} searchTerm - The search term to get variations for
 * @returns {Array} - An array of special variations
 */
Discovery.getSpecialVariations = function (searchTerm) {
    if (window.DiscoveryLogic && typeof DiscoveryLogic.getSpecialVariations === 'function') {
        return DiscoveryLogic.getSpecialVariations(searchTerm);
    }
    return [];
};

/**
 * Sorts wiki results by relevance to the search term
 * @param {Array} results - Array of wiki objects to sort
 * @param {string} searchTerm - The search term to compare against
 * @returns {Array} - Sorted array of wiki objects
 */
Discovery.sortWikiResults = function (results, searchTerm) {
    if (window.DiscoveryLogic && typeof DiscoveryLogic.sortWikiResults === 'function') {
        return DiscoveryLogic.sortWikiResults(results, searchTerm);
    }
    return results;
};

/**
 * Generates potential Fandom domains based on a search term
 * @param {string} searchTerm - The search term to generate domains for
 * @returns {Array} - An array of potential domains
 */
Discovery.generatePotentialDomains = function (searchTerm) {
    if (window.DiscoveryDomains && typeof DiscoveryDomains.generatePotentialDomains === 'function') {
        return DiscoveryDomains.generatePotentialDomains(searchTerm);
    }
    return [];
};

/**
 * Formats a search term into a valid Fandom domain
 * @param {string} searchTerm - The search term to format
 * @returns {string} - The formatted domain
 */
Discovery.formatFandomDomain = function (searchTerm) {
    if (window.DiscoveryDomains && typeof DiscoveryDomains.formatFandomDomain === 'function') {
        return DiscoveryDomains.formatFandomDomain(searchTerm);
    }
    return '';
};

/**
 * Cleans HTML snippets by removing tags
 * @param {string} html - The HTML snippet to clean
 * @returns {string} - The cleaned snippet
 */
Discovery.cleanHtmlSnippet = function (html) {
    if (window.DiscoveryLogic && typeof DiscoveryLogic.cleanHtmlSnippet === 'function') {
        return DiscoveryLogic.cleanHtmlSnippet(html);
    }
    if (!html) return '';
    return html.replace(/<\/?[^>]+(>|$)/g, '');
};

/**
 * Gets articles from a Fandom wiki
 * @param {string} domain - The domain of the wiki
 * @returns {Promise<Array>} - A promise that resolves to an array of article objects
 */
Discovery.getWikiArticles = async function (domain) {
    if (window.FandomAPI && typeof FandomAPI.getWikiArticles === 'function') {
        return FandomAPI.getWikiArticles(domain);
    }
    console.warn('FandomAPI not available');
    throw new Error('FandomAPI not available');
};

/**
 * Find matching wikis from the popular wikis list
 * @param {string} searchTerm - The search term
 * @param {Array} popularWikis - List of popular wikis to check
 * @returns {Array} - Array of matching wikis
 */
Discovery.findMatchingPopularWikis = function (searchTerm, popularWikis = []) {
    if (window.DiscoverySearchOrchestrator && typeof DiscoverySearchOrchestrator.findMatchingPopularWikis === 'function') {
        return DiscoverySearchOrchestrator.findMatchingPopularWikis(searchTerm, popularWikis);
    }
    return [];
};

// Check for ModuleRegistry and register this module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('Discovery', Discovery);
}

// Ensure global availability
window.Discovery = Discovery;