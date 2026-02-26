/**
 * Discovery UI Module (Facade)
 * Handles rendering of the Google-like search interface and results
 * Delegates to specialized components
 */

const DiscoveryUI = {};

/**
 * Initialize DiscoveryUI
 */
DiscoveryUI.init = function () {
    console.log('Initializing DiscoveryUI module (Facade)');

    // Check components
    if (!window.DUIUtils || !window.DUIInterface || !window.DUIResults) {
        console.warn('DiscoveryUI: Some sub-modules are missing.');
    }

    return this;
};

// -- Delegation to DUIInterface --

/**
 * Renders a Google-like search interface for Fandom wikis
 * @param {string} searchTerm - The search term
 * @param {HTMLElement} container - The container to render in
 */
DiscoveryUI.renderGoogleSearchInterface = function (searchTerm, container) {
    if (window.DUIInterface) {
        return DUIInterface.renderGoogleSearchInterface(searchTerm, container);
    } else {
        console.error('DiscoveryUI: DUIInterface module not loaded');
    }
};

// -- Delegation to DUIResults --

/**
 * Renders Google-style search results
 * @param {Array} results - The results to display
 * @param {HTMLElement} container - The container to render in
 * @param {string} searchTerm - The search term
 */
DiscoveryUI.renderGoogleSearchResults = function (results, container, searchTerm) {
    if (window.DUIResults) {
        return DUIResults.renderGoogleSearchResults(results, container, searchTerm);
    } else {
        console.error('DiscoveryUI: DUIResults module not loaded');
    }
};

// -- Delegation to DUIUtils --

/**
 * Highlights search terms in text
 * @param {string} text - The text to highlight
 * @param {string} searchTerm - The search term
 * @returns {string} - Highlighted HTML
 */
DiscoveryUI.highlightSearchTerms = function (text, searchTerm) {
    if (window.DUIUtils) {
        return DUIUtils.highlightSearchTerms(text, searchTerm);
    } else {
        console.warn('DiscoveryUI: DUIUtils not loaded, returning original text');
        return text || '';
    }
};

// Helper for escaping HTML (exposed in case used elsewhere, though primarily internal to utils)
DiscoveryUI.highlightSearchTerms.escapeHtml = function (unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Check for ModuleRegistry and register this module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DiscoveryUI', DiscoveryUI);
}

// Ensure global availability
window.DiscoveryUI = DiscoveryUI;
console.log('DiscoveryUI module loaded (Facade)');
