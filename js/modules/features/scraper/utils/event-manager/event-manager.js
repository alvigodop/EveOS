/**
 * Event Manager Module (Facade)
 * 
 * Centralizes event listener setup for the application
 * Delegates specific functionality to sub-modules.
 * 
 * @version 1.1.0
 */

// Create EventManager namespace if it doesn't exist
window.EventManager = window.EventManager || {};
const EventManager = window.EventManager;

// Add version and installation status flag
EventManager.version = '1.1.0';
EventManager.installed = true;

/**
 * Initialize the module and set up event listeners
 */
EventManager.init = function () {
    // EventManager init

    // Set up essential handlers immediately
    this.setupPopupHandlers();

    // Set up event listeners when DOM is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => this.setupEventListeners(), 50);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => this.setupEventListeners(), 50);
        });
    }

    // Ensure wiki lists are properly rendered
    setTimeout(() => {
        this.ensureWikiListsRendered();
    }, 800);

    // Handle reload requests
    window.reloadApp = this.reloadApp;

    // Set up global keyboard shortcuts
    this.setupKeyboardShortcuts();

    this._initialized = true;
    return this;
};

/**
 * Set up all event listeners for the application
 */
EventManager.setupEventListeners = function () {
    // Setting up listeners via sub-modules

    // Main search button
    this.setupSearchButton();

    // Tab switching
    this.setupTabSwitching();

    // Wiki management
    this.setupWikiManagement();

    // Discovery search
    this.setupDiscoverySearch();

    // Setup input events (like Enter key support)
    this.setupInputEvents();

    // Setup module status button events
    this.setupModuleStatusEvents();
};

/**
 * Set up search button event handler
 * NOTE: SearchManager is the sole owner of search button handlers.
 */
EventManager.setupSearchButton = function () {
    // IMPORTANT: Do NOT set up search handlers here.
    // SearchManager is the sole owner of search button and input handlers.
};

/**
 * Perform search using available search functionality
 */
EventManager.performSearch = function () {
    // Get query from input first
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.trim() : '';

    if (!query) return;

    console.log(`EventManager: Performing search for query: "${query}"`);

    // Try to use SearchManager if available
    if (window.SearchManager && typeof SearchManager.performSearch === 'function') {
        console.log('Using SearchManager.performSearch');
        const activeTabId = (window.TabManager && typeof TabManager.getActiveTabId === 'function')
            ? TabManager.getActiveTabId()
            : (document.getElementById('fandomTab')?.classList.contains('active') ? 'fandomTab' : 'wikipediaTab');

        const source = (activeTabId === 'fandomTab') ? 'fandom' : 'wikipedia';

        SearchManager.performSearch(query, source);
    }
    // Fall back to legacy search content function
    else if (typeof window.searchContent === 'function') {
        console.log('Using window.searchContent');
        window.searchContent(query);
    }
    // Try direct search as another fallback
    else if (window.DirectSearch && typeof DirectSearch.executeSearch === 'function') {
        console.log('Using DirectSearch.executeSearch');
        const isWikipedia = TabManager ?
            TabManager.getCurrentSource() === 'wikipedia' :
            document.querySelector('.tab.active')?.id === 'wikipediaTab';

        DirectSearch.executeSearch(query, isWikipedia);
    }
    else {
        console.error('No search function available');
        alert('Search function not available. Please check console for errors.');
    }
};

/**
 * Reload the application
 */
EventManager.reloadApp = function () {
    if (window.EventManagerInput && typeof EventManagerInput.reloadApp === 'function') {
        EventManagerInput.reloadApp();
    } else {
        window.location.reload();
    }
};

/**
 * DELEGATED METHODS
 */

// Tabs
EventManager.setupTabSwitching = function () {
    if (window.EventManagerTabs) window.EventManagerTabs.setupTabSwitching();
};

EventManager.handleTabSwitch = function (tabName) {
    if (window.EventManagerTabs) window.EventManagerTabs.handleTabSwitch(tabName);
};

// Wiki Management
EventManager.setupWikiManagement = function () {
    if (window.EventManagerWiki) window.EventManagerWiki.setupWikiManagement();
};

EventManager.ensureWikiListsRendered = function () {
    if (window.EventManagerWiki) window.EventManagerWiki.ensureWikiListsRendered();
};

// Discovery
EventManager.setupDiscoverySearch = function () {
    if (window.EventManagerDiscovery) window.EventManagerDiscovery.setupDiscoverySearch.call(this); // Pass this context if needed, though module uses "this.performWikipediaSearch" which refers to module if called on module
    // Actually, em-discovery.js functions use "this.performWikipediaSearch".
    // If I call window.EventManagerDiscovery.setupDiscoverySearch(), "this" inside it will be window.EventManagerDiscovery.
    // And that module has performWikipediaSearch. So it works.
};

EventManager.performWikipediaSearch = function (searchTerm) {
    if (window.EventManagerDiscovery) return window.EventManagerDiscovery.performWikipediaSearch(searchTerm);
};

EventManager.performFandomSearch = function (searchTerm) {
    if (window.EventManagerDiscovery) return window.EventManagerDiscovery.performFandomSearch(searchTerm);
};

// Popups
EventManager.setupPopupHandlers = function () {
    if (window.EventManagerPopups) window.EventManagerPopups.setupPopupHandlers();
};

// Input
EventManager.setupInputEvents = function () {
    if (window.EventManagerInput) window.EventManagerInput.setupInputEvents();
};

EventManager.setupModuleStatusEvents = function () {
    if (window.EventManagerInput) window.EventManagerInput.setupModuleStatusEvents();
};

EventManager.setupKeyboardShortcuts = function () {
    if (window.EventManagerInput) {
        // We need to bind the reloadApp call in em-input.js if it uses "this.reloadApp"
        // em-input.js: if (e.altKey && e.key === 'r') { this.reloadApp(); }
        // The listener is arrow function or bound?
        // em-input.js uses: document.addEventListener('keydown', (e) => { ... this.reloadApp() })
        // Inside arrow function in setupKeyboardShortcuts, 'this' is the module scope (EventManagerInput).
        // EventManagerInput has reloadApp. So it should work.
        window.EventManagerInput.setupKeyboardShortcuts();
    }
};

/**
 * Register a custom event listener
 */
EventManager.registerListener = function (elementId, eventType, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(eventType, handler);
        return true;
    }
    return false;
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('EventManager', EventManager);
}

// Make globally available
window.EventManager = EventManager;

// Auto-initialize when the DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', EventManager.init.bind(EventManager));
} else {
    setTimeout(EventManager.init.bind(EventManager), 0);
}