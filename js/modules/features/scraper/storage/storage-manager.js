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
StorageManager._getPrefixedKey = function (key, contextOverride = null) {
    const context = contextOverride || this.categoryContext || 'global';
    const normalized = context.toLowerCase().replace(/\s+/g, '_');
    return `${normalized}_${key}`;
};

/**
 * Initialize the storage manager
 */
StorageManager.init = function () {
    console.log('Initializing StorageManager');
    // Ensure LZString is available globally if needed, but we check per call
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

/**
 * [NEW] Smart Compression Helpers
 */
StorageManager._smartCompress = function (data) {
    if (typeof LZString === 'undefined' || !data) return typeof data === 'string' ? data : JSON.stringify(data);
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    if (json.length < 1024) return json;
    try {
        const compressed = LZString.compressToUTF16(json);
        const packed = '_LZ_' + compressed;
        
        if (packed.length < json.length) {
            const savings = Math.round((1 - packed.length / json.length) * 100);
            console.log(`Storage: Compressed [${savings}% saved] from ${(json.length / 1024).toFixed(1)}KB to ${(packed.length / 1024).toFixed(1)}KB.`);
            return packed;
        }
    } catch (e) {
        console.warn('StorageManager: Compression failed:', e);
        return json;
    }
    return json;
};

StorageManager._smartDecompress = function (str, fallback = null) {
    if (typeof str !== 'string' || !str || !str.startsWith('_LZ_')) return str;
    if (typeof LZString === 'undefined') {
        console.warn('StorageManager: LZString missing during decompression attempt.');
        return fallback;
    }
    try {
        const decompressed = LZString.decompressFromUTF16(str.slice(4));
        return decompressed || fallback;
    } catch (e) {
        console.warn('StorageManager: Decompression failed:', e);
        return fallback;
    }
};

StorageManager.saveData = function (key, data) {
    const prefixedKey = this._getPrefixedKey(key);
    const stringifiedData = this._smartCompress(data);
    
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

/**
 * Save heavy data to IndexedDB asynchronously, falling back to localStorage
 */
StorageManager.saveHeavyData = async function(key, data, context = null) {
    if (window.IDBStore) {
        try {
            const prefixedKey = this._getPrefixedKey(key, context);
            await window.IDBStore.set(prefixedKey, data);
            console.log(`StorageManager (IDB): Saved massive payload for [${key}]`);
            // GC the old maxed out payload to free up the 5MB localStorage limit cleanly
            try { localStorage.removeItem(prefixedKey); } catch(e) {}
            return true;
        } catch (e) {
            console.warn(`StorageManager (IDB): Save failed for ${key}, falling back`, e);
        }
    }
    return this.saveData(key, data);
};

/**
 * Load heavy data from IndexedDB asynchronously, falling back to localStorage
 */
StorageManager.loadHeavyData = async function(key, defaultValue, context = null) {
    if (window.IDBStore) {
        try {
            const val = await window.IDBStore.get(this._getPrefixedKey(key, context));
            if (val !== undefined) return val;
        } catch (e) {
            console.warn(`StorageManager (IDB): Load failed for ${key}, falling back`, e);
        }
    }
    return this.loadData(key, defaultValue);
};

/**
 * Delete heavy data from IndexedDB asynchronously
 */
StorageManager.deleteHeavyData = async function(key) {
    if (window.IDBStore) {
        try {
            await window.IDBStore.remove(this._getPrefixedKey(key));
        } catch (e) {}
    }
    this.deleteData(key);
};

/**
 * Get internal storage statistics
 * @returns {object} - Statistics about localStorage usage
 */
StorageManager.getStats = function () {
    let totalSize = 0;
    let items = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        if (key && val) {
            totalSize += (key.length + val.length);
            items++;
        }
    }
    const usedMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`Storage Stats: ${items} items, ${usedMB}MB / 5.00MB used.`);
    return { items, usedBytes: totalSize, usedMB };
};

StorageManager.loadData = function (key, defaultValue) {
    const prefixedKey = this._getPrefixedKey(key);
    try {
        const raw = localStorage.getItem(prefixedKey);
        const data = this._smartDecompress(raw, null);
        
        // If we have a compressed prefix but no data/library, fail over to defaultValue
        if (data === null) return defaultValue;
        
        try {
            return JSON.parse(data);
        } catch (parseError) {
            console.error(`Error parsing JSON for ${prefixedKey}:`, parseError);
            return defaultValue;
        }
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