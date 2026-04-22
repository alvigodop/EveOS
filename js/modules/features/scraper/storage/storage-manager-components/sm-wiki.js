/**
 * Storage Manager - Wiki Storage
 * Wiki-specific storage operations extracted from storage-manager.js
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SMWiki = {
        version: '1.0.0',

        // Storage keys
        KEYS: {
            FANDOM_DOMAINS: 'fandomDomains',
            WIKI_ENTRIES: 'wikiEntries',
            WIKI_CATEGORIES: 'wikiCategories',
            WIKI_DATA_STORE: 'wikiDataStore',
            WIKI_CACHE_STORE: 'wikiCacheStore'
        },

        init: function () {
            console.log('SMWiki component initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Save Fandom domains to localStorage/IDB
         */
        saveFandomDomains: async function (domains) {
            return await this._saveHeavy(this.KEYS.FANDOM_DOMAINS, domains);
        },

        /**
         * Load Fandom domains from localStorage/IDB
         */
        loadFandomDomains: async function () {
            return await this._loadHeavy(this.KEYS.FANDOM_DOMAINS, []);
        },


        /**
         * Save Wiki entries to localStorage/IDB
         */
        saveWikiEntries: async function (entries) {
            return await this._saveHeavy(this.KEYS.WIKI_ENTRIES, entries);
        },

        /**
         * Load Wiki entries from localStorage/IDB
         */
        loadWikiEntries: async function () {
            return await this._loadHeavy(this.KEYS.WIKI_ENTRIES, []);
        },


        /**
         * Save Wiki categories to localStorage/IDB
         */
        saveWikiCategories: async function (categories) {
            return await this._saveHeavy(this.KEYS.WIKI_CATEGORIES, categories);
        },

        /**
         * Load Wiki categories from localStorage/IDB
         */
        loadWikiCategories: async function () {
            return await this._loadHeavy(this.KEYS.WIKI_CATEGORIES, []);
        },


        /**
         * Save data to the wiki data store
         */
        saveToDataStore: async function (data) {
            return this._saveHeavy(this.KEYS.WIKI_DATA_STORE, data);
        },

        /**
         * Load data from the wiki data store
         */
        loadFromDataStore: async function () {
            return this._loadHeavy(this.KEYS.WIKI_DATA_STORE, {});
        },

        /**
         * Save data to the wiki cache store
         */
        saveToCacheStore: async function (data) {
            return this._saveHeavy(this.KEYS.WIKI_CACHE_STORE, data);
        },

        /**
         * Load data from the wiki cache store
         */
        loadFromCacheStore: async function () {
            return this._loadHeavy(this.KEYS.WIKI_CACHE_STORE, {});
        },

        // Internal helpers
        _save: function (key, data) {
            return window.StorageManager ? StorageManager.saveData(key, data, StorageManager.categoryContext) : false;
        },

        _load: function (key, defaultValue) {
            return window.StorageManager ? StorageManager.loadData(key, defaultValue, StorageManager.categoryContext) : defaultValue;
        },

        _saveHeavy: async function (key, data) {
            if (!window.StorageManager) return false;
            if (typeof StorageManager.saveHeavyData === 'function') {
                return await StorageManager.saveHeavyData(key, data, StorageManager.categoryContext);
            }
            return StorageManager.saveData(key, data, StorageManager.categoryContext);
        },

        _loadHeavy: async function (key, defaultValue) {
            if (!window.StorageManager) return defaultValue;
            if (typeof StorageManager.loadHeavyData === 'function') {
                return await StorageManager.loadHeavyData(key, defaultValue, StorageManager.categoryContext);
            }
            return StorageManager.loadData(key, defaultValue, StorageManager.categoryContext);
        }
    };

    // Expose globally
    window.SMWiki = SMWiki;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SMWiki', SMWiki);
    }
})();
