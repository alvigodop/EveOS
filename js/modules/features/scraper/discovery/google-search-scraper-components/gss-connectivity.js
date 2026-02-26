/**
 * Google Search Scraper Connectivity Component
 * Handles connectivity checks and emulator status.
 */
const GoogleScraperConnectivity = {};

/**
 * Initialize the module
 */
GoogleScraperConnectivity.init = function () {
    console.log('GoogleScraperConnectivity initialized');
};

/**
 * Check Google connectivity to help diagnose search issues
 */
GoogleScraperConnectivity.checkGoogleConnectivity = async function () {
    if (window.ConnectivityTest && typeof ConnectivityTest.testGoogleConnectivity === 'function') {
        const isAccessible = await ConnectivityTest.testGoogleConnectivity();
        if (window.GoogleSearchScraper) {
            GoogleSearchScraper.googleAccessible = isAccessible;
        }
        return isAccessible;
    }
    return false;
};

/**
 * Check if the BrowserEmulator is ready for JS rendering
 * @returns {boolean} - Whether the BrowserEmulator is ready
 */
GoogleScraperConnectivity.isEmulatorReady = function () {
    // Check global BrowserEmulator directly (it's a global dependency)
    if (window.BrowserEmulator) {
        return true;
    }

    // Also check if the script tag exists as fallback
    if (document.querySelector('script[src*="browser-emulator.js"]')) {
        return true;
    }

    return false;
};

window.GoogleScraperConnectivity = GoogleScraperConnectivity;
