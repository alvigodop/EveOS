/**
 * Google Scraper Core Module (Facade)
 * 
 * Delegates to:
 * - GSCEmulator: Browser emulator checks
 * - GSCConnectivity: Google connectivity checks
 * - GSCScraping: Search scraping logic
 * 
 * @version 1.1.0-facade
 */

window.GoogleScraperCore = window.GoogleScraperCore || {};
const GoogleScraperCore = window.GoogleScraperCore;

GoogleScraperCore.isEmulatorReady = function () {
    if (window.GSCEmulator) {
        return GSCEmulator.isEmulatorReady();
    }
    return false;
};

GoogleScraperCore.init = function () {
    if (window.GSCEmulator && typeof GSCEmulator.init === 'function') {
        GSCEmulator.init();
        GSCEmulator._initialized = true;
    }
    if (window.GSCConnectivity && typeof GSCConnectivity.init === 'function') {
        GSCConnectivity.init();
        GSCConnectivity._initialized = true;
    }
    if (window.GSCScraping && typeof GSCScraping.init === 'function') {
        GSCScraping.init();
        GSCScraping._initialized = true;
    }
    this._initialized = true;
    return this;
};

GoogleScraperCore.checkGoogleConnectivity = async function () {
    if (window.GSCConnectivity) {
        return GSCConnectivity.checkGoogleConnectivity();
    }
    // Fallback if module missing
    console.warn('GoogleScraperCore: GSCConnectivity module missing');
};

GoogleScraperCore.scrapeGoogleForFandomWikis = async function (query, options = {}) {
    if (window.GSCScraping) {
        return GSCScraping.scrapeGoogleForFandomWikis(query, options);
    }
    return { success: false, error: 'GSCScraping module missing', results: [] };
};

console.log('GoogleScraperCore module loaded');
