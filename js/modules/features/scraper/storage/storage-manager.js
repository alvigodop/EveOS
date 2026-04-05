/**
 * Storage Manager Module (Facade)
 * Handles all localStorage operations
 * 
 * Delegates to:
 * - SMWiki: Wiki-specific storage operations
 * 
 * @version 1.1.0-facade
 */
const StorageManager = {
    categoryContext: null
};

StorageManager.version = '1.1.0-facade';

/**
 * Storage keys used in localStorage
 */
StorageManager.KEYS = {
    FANDOM_DOMAINS: 'fandomDomains',
    WIKI_ENTRIES: 'wikiEntries',
    WIKI_CATEGORIES: 'wikiCategories',
    WIKI_DATA_STORE: 'wikiDataStore',
    WIKI_CACHE_STORE: 'wikiCacheStore'
};

/**
 * Set the current category context for storage
 */
StorageManager.setCategoryContext = function (context) {
    console.log(`StorageManager: Context set to [${context}]`);
    this.categoryContext = context;
};

/**
 * Get the prefixed key based on current context
 */
StorageManager._getPrefixedKey = function (key) {
    if (!this.categoryContext) return key;
    // Normalize context (lowercase, no spaces)
    const normalized = this.categoryContext.toLowerCase().replace(/\s+/g, '_');
    return `${normalized}_${key}`;
};

/**
 * Initialize the storage manager
 */
StorageManager.init = function () {
    console.log('Initializing StorageManager');
    try {
        localStorage.setItem('sm_test', 'test');
        localStorage.removeItem('sm_test');
        
        // Restore last context from storage if available
        const lastContext = localStorage.getItem('eve_current_category_context');
        if (lastContext) {
            this.categoryContext = lastContext;
            window.currentCategoryCtx = lastContext;
            console.log(`StorageManager: Restored last context [${lastContext}]`);
        }
    } catch (e) {
        console.error('LocalStorage is not available:', e);
    }

    if (window.SMWiki && typeof SMWiki.init === 'function') {
        SMWiki.init();
        SMWiki._initialized = true;
    }

    this._initialized = true;
    return this;
};

// Core operations
StorageManager.get = function (key, defaultValue) {
    return this.loadData(key, defaultValue);
};

StorageManager.set = function (key, value) {
    return this.saveData(key, value);
};

StorageManager.remove = function (key) {
    return this.deleteData(key);
};

StorageManager.saveData = function (key, data) {
    const prefixedKey = this._getPrefixedKey(key);
    const stringifiedData = JSON.stringify(data);
    
    try {
        localStorage.setItem(prefixedKey, stringifiedData);
        return true;
    } catch (error) {
        if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22) {
            console.warn(`StorageManager: Quota exceeded for ${prefixedKey}. Attempting emergency prune and retry...`);
            
            if (window.CCMaintenance && typeof CCMaintenance.emergencyPrune === 'function') {
                window.CCMaintenance.emergencyPrune(0.5); // Clear 50%
                
                // Retry once
                try {
                    localStorage.setItem(prefixedKey, stringifiedData);
                    console.log(`StorageManager: Successfully saved ${prefixedKey} after emergency prune.`);
                    return true;
                } catch (retryError) {
                    console.error(`StorageManager: Final save failure after prune for ${prefixedKey}:`, retryError);
                }
            }
        }
        
        console.error(`Error saving data to localStorage (${prefixedKey}):`, error);
        return false;
    }
};

StorageManager.loadData = function (key, defaultValue) {
    const prefixedKey = this._getPrefixedKey(key);
    try {
        const data = localStorage.getItem(prefixedKey);
        return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
        console.error(`Error loading data from localStorage (${prefixedKey}):`, error);
        return defaultValue;
    }
};

StorageManager.deleteData = function (key) {
    const prefixedKey = this._getPrefixedKey(key);
    try {
        localStorage.removeItem(prefixedKey);
        return true;
    } catch (error) {
        console.error(`Error deleting data from localStorage (${prefixedKey}):`, error);
        return false;
    }
};

StorageManager.hasData = function (key) {
    const prefixedKey = this._getPrefixedKey(key);
    return localStorage.getItem(prefixedKey) !== null;
};

StorageManager.clearAllData = function () {
    // Only clear prefixed data if context is set
    if (this.categoryContext) {
        const prefix = this.categoryContext.toLowerCase().replace(/\s+/g, '_') + '_';
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(prefix)) {
                localStorage.removeItem(key);
            }
        });
        console.log(`Cleared data for category: ${this.categoryContext}`);
        return true;
    }
    
    // Fallback: Clear nothing to be safe if no context
    console.warn('StorageManager: clearAllData called without context, doing nothing for safety.');
    return false;
};

// Wiki operations - delegate to SMWiki if available
StorageManager.saveFandomDomains = function (domains) {
    if (window.SMWiki) return SMWiki.saveFandomDomains(domains);
    return this.saveData(this.KEYS.FANDOM_DOMAINS, domains);
};

StorageManager.loadFandomDomains = function () {
    if (window.SMWiki) return SMWiki.loadFandomDomains();
    return this.loadData(this.KEYS.FANDOM_DOMAINS, []);
};

StorageManager.saveWikiEntries = function (entries) {
    if (window.SMWiki) return SMWiki.saveWikiEntries(entries);
    return this.saveData(this.KEYS.WIKI_ENTRIES, entries);
};

StorageManager.loadWikiEntries = function () {
    if (window.SMWiki) return SMWiki.loadWikiEntries();
    return this.loadData(this.KEYS.WIKI_ENTRIES, []);
};

StorageManager.saveWikiCategories = function (categories) {
    if (window.SMWiki) return SMWiki.saveWikiCategories(categories);
    return this.saveData(this.KEYS.WIKI_CATEGORIES, categories);
};

StorageManager.loadWikiCategories = function () {
    if (window.SMWiki) return SMWiki.loadWikiCategories();
    return this.loadData(this.KEYS.WIKI_CATEGORIES, []);
};

StorageManager.saveToDataStore = function (data) {
    if (window.SMWiki) return SMWiki.saveToDataStore(data);
    return this.saveData(this.KEYS.WIKI_DATA_STORE, data);
};

StorageManager.loadFromDataStore = function () {
    if (window.SMWiki) return SMWiki.loadFromDataStore();
    return this.loadData(this.KEYS.WIKI_DATA_STORE, {});
};

StorageManager.saveToCacheStore = function (data) {
    if (window.SMWiki) return SMWiki.saveToCacheStore(data);
    return this.saveData(this.KEYS.WIKI_CACHE_STORE, data);
};

StorageManager.loadFromCacheStore = function () {
    if (window.SMWiki) return SMWiki.loadFromCacheStore();
    return this.loadData(this.KEYS.WIKI_CACHE_STORE, {});
};

// Register
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('StorageManager', StorageManager);
}
window.StorageManager = StorageManager;

// Auto-init
if (StorageManager.init) StorageManager.init();