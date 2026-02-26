/**
 * Wiki Manager Module (Facade)
 * Orchestrates Wiki operations by delegating to sub-modules.
 * 
 * Sub-modules:
 * - WikiManagerFandom: Fandom domain management
 * - WikiManagerEntries: Wiki entry management
 * - WikiManagerCategories: Wiki category management
 * - WikiManagerDelegates: Integration delegations
 * - WikiManagerInput: Input handling
 */
const WikiManager = {};

// Initialization tracking
WikiManager._initialized = false;

/**
 * Initialize the wiki manager
 */
WikiManager.init = function () {
    try {
        console.log('WikiManager initializing...');

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('WikiManager', WikiManager);
        }

        // Initialize Store and Renderer if they haven't been already
        if (window.WikiStore && typeof WikiStore.init === 'function') {
            WikiStore.init();
            WikiStore._initialized = true;
        }
        if (window.WikiUIRenderer && typeof WikiUIRenderer.init === 'function') {
            WikiUIRenderer.init();
            WikiUIRenderer._initialized = true;
        }

        // Initialize Sub-modules
        if (window.WikiManagerInput && typeof WikiManagerInput.init === 'function') {
            WikiManagerInput.init();
            WikiManagerInput._initialized = true;
        }
        if (window.WikiManagerDelegates && typeof WikiManagerDelegates.init === 'function') {
            WikiManagerDelegates.init();
            WikiManagerDelegates._initialized = true;
        }
        if (window.WikiManagerFandom && typeof WikiManagerFandom.init === 'function') {
            WikiManagerFandom.init();
            WikiManagerFandom._initialized = true;
        }
        if (window.WikiManagerEntries && typeof WikiManagerEntries.init === 'function') {
            WikiManagerEntries.init();
            WikiManagerEntries._initialized = true;
        }
        if (window.WikiManagerCategories && typeof WikiManagerCategories.init === 'function') {
            WikiManagerCategories.init();
            WikiManagerCategories._initialized = true;
        }

        // Cache stores (kept for backward compatibility with external calls that might access them directly)
        this.refreshCacheStores();

        // Check for default entries (Delegated)
        this.addDefaultWikiEntryIfNeeded();

        // Initialize DOM operations when ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(() => this.initDomOperations(), 0);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.initDomOperations(), 0);
            });
        }

        WikiManager._initialized = true;
        return this;
    } catch (error) {
        console.error('Error initializing WikiManager:', error);
        return null;
    }
};

/**
 * Define properties to delegate to WikiStore
 */
if (!Object.getOwnPropertyDescriptor(WikiManager, 'wikiEntries')) {
    Object.defineProperty(WikiManager, 'wikiEntries', {
        get: function () { return window.WikiStore ? WikiStore.getWikiEntries() : []; }
    });
}

if (!Object.getOwnPropertyDescriptor(WikiManager, 'fandomDomains')) {
    Object.defineProperty(WikiManager, 'fandomDomains', {
        get: function () { return window.WikiStore ? WikiStore.getFandomDomains() : []; }
    });
}

if (!Object.getOwnPropertyDescriptor(WikiManager, 'wikiCategories')) {
    Object.defineProperty(WikiManager, 'wikiCategories', {
        get: function () { return window.WikiStore ? WikiStore.getWikiCategories() : []; }
    });
}

/**
 * Refresh local cache store references
 */
WikiManager.refreshCacheStores = function () {
    if (window.StorageManager) {
        WikiManager.wikiCacheStore = StorageManager.loadFromCacheStore() || {};
        WikiManager.fandomCacheStore = StorageManager.loadFromDataStore() || { searchResults: {} };
    } else {
        // Fallbacks
        try {
            WikiManager.wikiCacheStore = JSON.parse(localStorage.getItem('wikiCacheStore')) || {};
            WikiManager.fandomCacheStore = JSON.parse(localStorage.getItem('wikiDataStore')) || { searchResults: {} };
        } catch (e) {
            WikiManager.wikiCacheStore = {};
            WikiManager.fandomCacheStore = { searchResults: {} };
        }
    }
};

/**
 * Initialize DOM-related operations
 */
WikiManager.initDomOperations = function () {
    // Render lists
    this.renderFandomDomainList();
    this.renderWikiEntryList();
    this.renderWikiCategoryList();

    // Setup button handlers via Input module
    if (window.WikiManagerInput) {
        WikiManagerInput.setupButtonHandlers();
    }
};

// ==========================================
// Delegation to WikiManagerFandom
// ==========================================

WikiManager.addFandomDomain = function (domain, name, imageUrl) {
    if (window.WikiManagerFandom) return WikiManagerFandom.addFandomDomain(domain, name, imageUrl);
};

WikiManager.removeFandomDomain = function (domain) {
    if (window.WikiManagerFandom) return WikiManagerFandom.removeFandomDomain(domain);
};

WikiManager.renderFandomDomainList = function (force) {
    if (window.WikiManagerFandom) return WikiManagerFandom.renderFandomDomainList(force);
};

WikiManager._updateFandomData = function (domain) {
    // Delegate to Fandom component (or strictly speaking, Fandom component delegates to Delegates, so this is just a proxy)
    if (window.WikiManagerFandom && typeof WikiManagerFandom._updateFandomData === 'function') {
        WikiManagerFandom._updateFandomData(domain);
    } else if (window.WikiManagerDelegates) {
        WikiManagerDelegates.updateFandomData(domain);
    }
};

// ==========================================
// Delegation to WikiManagerEntries
// ==========================================

WikiManager.addWikiEntry = function (title, name, imageUrl) {
    if (window.WikiManagerEntries) return WikiManagerEntries.addWikiEntry(title, name, imageUrl);
};

WikiManager.removeWikiEntry = function (title) {
    if (window.WikiManagerEntries) return WikiManagerEntries.removeWikiEntry(title);
};

WikiManager.renderWikiEntryList = function (force) {
    if (window.WikiManagerEntries) return WikiManagerEntries.renderWikiEntryList(force);
};

WikiManager.addDefaultWikiEntryIfNeeded = function () {
    if (window.WikiManagerEntries) return WikiManagerEntries.addDefaultWikiEntryIfNeeded();
};

WikiManager._updateWikipediaData = function (title) {
    if (window.WikiManagerEntries && typeof WikiManagerEntries._updateWikipediaData === 'function') {
        WikiManagerEntries._updateWikipediaData(title);
    } else if (window.WikiManagerDelegates) {
        WikiManagerDelegates.updateWikipediaData(title);
    }
};

// ==========================================
// Delegation to WikiManagerCategories
// ==========================================

WikiManager.addWikiCategory = function (category, name) {
    if (window.WikiManagerCategories) return WikiManagerCategories.addWikiCategory(category, name);
};

WikiManager.removeWikiCategory = function (category) {
    if (window.WikiManagerCategories) return WikiManagerCategories.removeWikiCategory(category);
};

WikiManager.renderWikiCategoryList = function (force) {
    if (window.WikiManagerCategories) return WikiManagerCategories.renderWikiCategoryList(force);
};

// ==========================================
// Delegation to WikiManagerDelegates (Helpers)
// ==========================================

WikiManager._handleVisit = function (url, name) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.handleVisit(url, name);
};

WikiManager._handleItemClick = function (e, url, name) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.handleItemClick(e, url, name);
};

WikiManager._notify = function (message, type) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.notify(message, type);
};

// ==========================================
// Delegations (Public-facing Proxy for other modules)
// ==========================================

WikiManager.searchFandomWikis = function () {
    if (window.WikiManagerDelegates) WikiManagerDelegates.searchFandomWikis();
};

WikiManager.searchWikiArticles = function () {
    if (window.WikiManagerDelegates) WikiManagerDelegates.searchWikiArticles();
};

WikiManager.addFandomDomainFromDiscovery = function (url, name, imageUrl) {
    if (window.WikiManagerDelegates) return WikiManagerDelegates.addFandomDomainFromDiscovery(url, name, imageUrl);
};

WikiManager.addWikiEntryFromDiscovery = function (title, imageUrl) {
    if (window.WikiManagerDelegates) return WikiManagerDelegates.addWikiEntryFromDiscovery(title, imageUrl);
};

WikiManager.viewFandomCachedData = function (domain) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.viewFandomCachedData(domain);
};

WikiManager.viewWikiCachedData = function (title) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.viewWikiCachedData(title);
};

WikiManager.clearFandomCache = function (domain) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.clearFandomCache(domain);
};

WikiManager.clearWikiCache = function (title) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.clearWikiCache(title);
};

WikiManager.clearAllFandomCaches = function () {
    if (window.WikiManagerDelegates) WikiManagerDelegates.clearAllFandomCaches();
};

WikiManager.clearAllWikiCaches = function () {
    if (window.WikiManagerDelegates) WikiManagerDelegates.clearAllWikiCaches();
};

WikiManager.reloadFandomWikiStatus = function (domain, btn) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.reloadFandomWikiStatus(domain, btn);
};

WikiManager.reloadAllFandomWikiStatus = function () {
    if (window.WikiManagerDelegates) WikiManagerDelegates.reloadAllFandomWikiStatus();
};

WikiManager.reloadWikiEntryStatus = function (title, btn) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.reloadWikiEntryStatus(title, btn);
};

WikiManager.reloadAllWikiStatus = function () {
    if (window.WikiManagerDelegates) WikiManagerDelegates.reloadAllWikiStatus();
};

WikiManager.updateDiscoveryButtonStatus = function (type, id, isAdded) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.updateDiscoveryButtonStatus(type, id, isAdded);
};

WikiManager.resetWikiDiscovery = function () {
    if (window.WikiManagerDelegates) WikiManagerDelegates.resetWikiDiscovery();
};

WikiManager.setWikiOpenMode = function (mode) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.setWikiOpenMode(mode);
};

// Global Exports
window.WikiManager = WikiManager;
window.addWikiFromDiscovery = WikiManager.addFandomDomainFromDiscovery;
window.addWikiEntryFromDiscovery = WikiManager.addWikiEntryFromDiscovery;
WikiManager.handleWikiResultClick = WikiManager._handleItemClick;