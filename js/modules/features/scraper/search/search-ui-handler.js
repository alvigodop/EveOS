/**
 * Search UI Handler Module (Facade)
 * 
 * Manages UI event listeners and form interactions for the search features.
 * Delegates to:
 * - SUHSearchControl: Search forms, buttons, and toggles
 * - SUHOptions: Option listeners
 * 
 * @version 1.1.0-facade
 */

window.SearchUIHandler = window.SearchUIHandler || {};
const SearchUIHandler = window.SearchUIHandler;

SearchUIHandler.init = function () {
    console.log('SearchUIHandler (Facade): Initializing UI listeners');

    // Initialize components
    if (window.SUHSearchControl && typeof SUHSearchControl.init === 'function') {
        SUHSearchControl.init();
        SUHSearchControl._initialized = true;
    } else {
        console.warn('SearchUIHandler: SUHSearchControl sub-module not found');
    }

    if (window.SUHOptions && typeof SUHOptions.init === 'function') {
        SUHOptions.init();
        SUHOptions._initialized = true;
    } else {
        console.warn('SearchUIHandler: SUHOptions sub-module not found');
    }

    this._initialized = true;
    return this;
};

console.log('SearchUIHandler module loaded');
if (SearchUIHandler.init) SearchUIHandler.init();
