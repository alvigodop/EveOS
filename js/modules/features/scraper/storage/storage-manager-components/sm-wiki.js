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
         * Save Fandom domains to localStorage
         */
        saveFandomDomains: function (domains) {
            return this._save(this.KEYS.FANDOM_DOMAINS, domains);
        },

        /**
         * Load Fandom domains from localStorage
         */
        loadFandomDomains: function () {
            return this._load(this.KEYS.FANDOM_DOMAINS, []);
        },

        /**
         * Save Wiki entries to localStorage
         */
        saveWikiEntries: function (entries) {
            return this._save(this.KEYS.WIKI_ENTRIES, entries);
        },

        /**
         * Load Wiki entries from localStorage
         */
        loadWikiEntries: function () {
            return this._load(this.KEYS.WIKI_ENTRIES, []);
        },

        /**
         * Save Wiki categories to localStorage
         */
        saveWikiCategories: function (categories) {
            return this._save(this.KEYS.WIKI_CATEGORIES, categories);
        },

        /**
         * Load Wiki categories from localStorage
         */
        loadWikiCategories: function () {
            return this._load(this.KEYS.WIKI_CATEGORIES, []);
        },

        /**
         * Save data to the wiki data store
         */
        saveToDataStore: function (data) {
            return this._save(this.KEYS.WIKI_DATA_STORE, data);
        },

        /**
         * Load data from the wiki data store
         */
        loadFromDataStore: function () {
            return this._load(this.KEYS.WIKI_DATA_STORE, {});
        },

        /**
         * Save data to the wiki cache store
         */
        saveToCacheStore: function (data) {
            return this._save(this.KEYS.WIKI_CACHE_STORE, data);
        },

        /**
         * Load data from the wiki cache store
         */
        loadFromCacheStore: function () {
            return this._load(this.KEYS.WIKI_CACHE_STORE, {});
        },

        // Internal helpers
        _save: function (key, data) {
            return window.StorageManager ? StorageManager.saveData(key, data) : false;
        },

        _load: function (key, defaultValue) {
            return window.StorageManager ? StorageManager.loadData(key, defaultValue) : defaultValue;
        }
    };

    // Expose globally
    window.SMWiki = SMWiki;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SMWiki', SMWiki);
    }
})();
