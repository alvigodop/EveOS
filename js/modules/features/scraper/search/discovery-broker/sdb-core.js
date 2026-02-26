/**
 * Search Discovery Broker Core
 * 
 * Core structural component for the SearchDiscoveryBroker.
 * Sets up the namespace and initialization logic.
 */

window.SearchDiscoveryBroker = window.SearchDiscoveryBroker || {};
const SearchDiscoveryBroker = window.SearchDiscoveryBroker;

// Version info
SearchDiscoveryBroker.version = '1.1.0';
SearchDiscoveryBroker._components = {
    fandom: null,    // Will be populated by SDBFandom
    wikipedia: null, // Will be populated by SDBWikipedia
    ui: null         // Will be populated by SDBUI
};

/**
 * Initialize the Search Discovery Broker
 */
SearchDiscoveryBroker.init = function () {
    console.log('SearchDiscoveryBroker: Initializing (Modularized)');

    // Check for components
    if (window.SDBFandom) this._components.fandom = window.SDBFandom;
    if (window.SDBWikipedia) this._components.wikipedia = window.SDBWikipedia;
    if (window.SDBUI) this._components.ui = window.SDBUI;

    this._initialized = true;
    return this;
};
