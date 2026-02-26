/**
 * Google Search Scraper Configuration Component
 * Defines configuration and constants for the scraper.
 */
const GoogleScraperConfig = {};

/**
 * List of CORS proxies to try for Google search
 */
GoogleScraperConfig.CORS_PROXIES = [
    'https://corsproxy.org/?',
    'https://cors-proxy.htmldriven.com/?url=',
    'https://corsproxy.io/?',
    'https://cors.eu.org/',
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere-production-7b17.up.railway.app/',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-proxy.fringe.zone/',
    // New proxies
    'https://corsmirror.onrender.com/v1/',
    'https://corsproxy.vercel.app/?url=',
    'https://proxy.cors.sh/',
    'https://corsanywhere.herokuapp.com/',
    'https://api.scraperapi.com/?api_key=free&url=',
    'https://api.codepal.ai/proxy/',
    'https://api.chronoly.io/v1/proxy/raw?url=',
    'https://worker-deluxe-river-4334.peter89.workers.dev/?'
];

/**
 * Initialize the module
 */
GoogleScraperConfig.init = function () {
    console.log('GoogleScraperConfig initialized');
};

window.GoogleScraperConfig = GoogleScraperConfig;
