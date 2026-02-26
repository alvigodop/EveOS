/**
 * UI Result Display - Functions for displaying search results in various formats
 * Split from original ui.js for better modularity
 * Requires ui-core.js to be loaded first
 * 
 * @version 1.0.1 (Modularized)
 */

// Create UIResultDisplay namespace
const UIResultDisplay = {};

// Ensure UI namespace exists
if (!window.UI) {
    console.error('UI namespace not found! ui-core.js should be loaded before ui-result-display.js');
    window.UI = {};
}

// Check for submodules
const checkComponents = () => {
    if (!window.URDCore) console.warn('UIResultDisplay: URDCore not found');
    if (!window.URDGrid) console.warn('UIResultDisplay: URDGrid not found');
    if (!window.URDList) console.warn('UIResultDisplay: URDList not found');
};

/**
 * Initialize the UIResultDisplay module
 */
UIResultDisplay.init = function () {
    console.log('Initializing UIResultDisplay (Facade)');
    checkComponents();
    this._initialized = true;
    return this;
};

// Add all the UI.displayResults functions to both UI and UIResultDisplay namespaces
// for backward compatibility and proper modularization

/**
 * Displays search results in the specified layout and grouping
 * @param {Array|Object} results - The search results to display
 * @param {string} layout - The layout to use ('grid' or 'list')
 * @param {string} groupBy - How to group results ('none', 'type', 'domain', etc.)
 * @param {HTMLElement} resultsDiv - The container to display results in
 */
UIResultDisplay.displayResults = UI.displayResults = function (results, layout, groupBy, resultsDiv) {
    if (!results) {
        resultsDiv.innerHTML = '<div class="no-results">No results to display.</div>';
        return;
    }

    // If we need to group the results, group them by the specified attribute
    if (groupBy !== 'none' && Array.isArray(results)) {
        if (window.URDCore) {
            results = URDCore.groupResultsBy(results, groupBy);
        } else {
            console.error('UIResultDisplay: URDCore missing, cannot group results');
        }
    }

    // Display the results in the specified layout
    if (layout === 'grid') {
        if (window.URDGrid) {
            URDGrid.displayGridResults(results, groupBy, resultsDiv);
        } else {
            console.error('UIResultDisplay: URDGrid missing');
        }
    } else {
        if (window.URDList) {
            URDList.displayListResults(results, groupBy, resultsDiv);
        } else {
            console.error('UIResultDisplay: URDList missing');
        }
    }
};

// Delegating lower level methods back to UI for compatibility if modules exist
UI.groupResultsBy = function (results, groupBy) {
    return window.URDCore ? URDCore.groupResultsBy(results, groupBy) : {};
};

UI.displayGridResults = function (results, groupBy, resultsDiv) {
    if (window.URDGrid) URDGrid.displayGridResults(results, groupBy, resultsDiv);
};

UI.displayListResults = function (results, groupBy, resultsDiv) {
    if (window.URDList) URDList.displayListResults(results, groupBy, resultsDiv);
};

UI.createResultCard = function (result) {
    return window.URDGrid ? URDGrid.createResultCard(result) : '';
};

UI.createResultListItem = function (result) {
    return window.URDList ? URDList.createResultListItem(result) : '';
};

// Copy all method definitions from UI to UIResultDisplay for module completeness
Object.keys(UI).forEach(key => {
    if (typeof UI[key] === 'function' && !UIResultDisplay[key]) {
        UIResultDisplay[key] = UI[key];
    }
});

// Make UIResultDisplay globally available
window.UIResultDisplay = UIResultDisplay;

// Auto-register with ModuleRegistry if available
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('UIResultDisplay', UIResultDisplay);
}

console.log('UI Result Display components loaded');