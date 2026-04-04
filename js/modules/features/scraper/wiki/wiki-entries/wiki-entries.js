/**
 * Wiki Entries Module (Facade)
 * 
 * Manages Wikipedia entry list, additions, and removals.
 * 
 * Delegates to:
 * - WEFetcher: Wikipedia API data fetching
 * 
 * @version 1.1.0-facade
 */

(function () {
    const WikiEntries = {
        name: 'WikiEntries',
        version: '1.1.0-facade',
        _initialized: false,

        /**
         * Initialize the WikiEntries module
         */
        init: function () {
            if (this._initialized) return;
            if (window.WEFetcher && typeof WEFetcher.init === 'function') {
                WEFetcher.init();
                WEFetcher._initialized = true;
            }
            this._initialized = true;
            console.log('WikiEntries initialized');
        },

        /**
         * Add a Wikipedia entry to the managed list
         * @param {string} title - The title of the Wikipedia entry
         * @param {string} name - Optional custom name for the entry
         * @param {string} imageUrl - Optional image URL to preset
         */
        addEntry: function (title, name, imageUrl) {
            // Get current entries
            const currentEntries = this.getEntries();

            // If called from event listener, get values from inputs
            if (!title || typeof title === 'object') {
                const titleInput = document.getElementById('wikiEntryInput');
                const nameInput = document.getElementById('wikiNameInput');

                if (titleInput) title = titleInput.value.trim();
                if (nameInput) name = nameInput.value.trim();
            }

            // Validate title
            if (!title) {
                alert('Please enter a valid Wikipedia entry title');
                return null;
            }

            // Check if entry already exists
            if (currentEntries.some(entry => entry.title.toLowerCase() === title.toLowerCase())) {
                alert('This entry is already in your list');
                return null;
            }

            // Add entry to list
            const newEntry = {
                title: title,
                name: name || title,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
                imageUrl: imageUrl || null,
                addedAt: new Date().toISOString()
            };

            currentEntries.push(newEntry);
            this.saveEntries(currentEntries);

            // Clear inputs
            const titleInput = document.getElementById('wikiEntryInput');
            const nameInput = document.getElementById('wikiNameInput');
            if (titleInput) titleInput.value = '';
            if (nameInput) nameInput.value = '';

            // Update UI
            if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                WikiManager.renderWikiEntryList(true);
            }

            // If no image provided, trigger a background update
            if (!imageUrl) {
                setTimeout(() => this.updateWikipediaData(title), 500);
            }

            return newEntry;
        },

        /**
         * Remove a Wikipedia entry from the managed list
         * @param {string} title - The title of the entry to remove
         */
        removeEntry: function (title) {
            let currentEntries = this.getEntries();
            currentEntries = currentEntries.filter(entry => entry.title !== title);
            this.saveEntries(currentEntries);

            // Clear cache
            if (window.CacheManager && window.CacheManager.deleteWikipediaEntryData) {
                window.CacheManager.deleteWikipediaEntryData(title);
                window.CacheManager.delete(`wiki_entry_${title}`);
            } else if (window.StorageManager) {
                StorageManager.deleteData(`wiki_entry_${title}`);
            } else {
                localStorage.removeItem(`wiki_entry_${title}`);
            }

            // Update UI
            if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                WikiManager.renderWikiEntryList(true);
            }

            // Update discovery button state
            if (window.WikiManager && typeof WikiManager.updateDiscoveryButtonStatus === 'function') {
                WikiManager.updateDiscoveryButtonStatus('wikipedia', title, false);
            }
        },

        /**
         * Fetch data for a Wikipedia entry - delegates to WEFetcher
         * @param {string} title - The title to update
         */
        updateWikipediaData: async function (title) {
            console.log(`Fetching data for Wikipedia: ${title}`);

            // Delegate to WEFetcher if available
            if (window.WEFetcher) {
                const result = await WEFetcher.fetchWikipediaData(title, (data) => {
                    this._handleFetchResult(title, data);
                });
                if (result) {
                    this._handleFetchResult(title, result);
                }
            } else {
                // Fallback: basic fetch logic
                console.warn('WikiEntries: WEFetcher not available, using legacy fetch');
                await this._legacyFetch(title);
            }
        },

        /**
         * Handle fetch result - update cache and entries
         */
        _handleFetchResult: async function (originalTitle, data) {
            if (!data) return;
            console.log(`WikiEntries: Processing fetch result for ${originalTitle}`);

            // 1. Centralized Cache Update (Delegated to CacheWikipedia)
            if (window.CacheWikipedia && typeof CacheWikipedia.updateWikipediaEntryData === 'function') {
                await CacheWikipedia.updateWikipediaEntryData(originalTitle, {
                    title: data.title,
                    snippet: data.snippet,
                    imageUrl: data.imageUrl,
                    lastUpdate: data.lastUpdate || new Date().toISOString()
                });
            } else if (window.WikiManager && WikiManager.wikiCacheStore) {
                // Fallback for missing facade: direct store update (Less ideal but compatible)
                if (!WikiManager.wikiCacheStore.entryResults) WikiManager.wikiCacheStore.entryResults = {};
                if (!WikiManager.wikiCacheStore.entryResults[originalTitle]) WikiManager.wikiCacheStore.entryResults[originalTitle] = {};

                WikiManager.wikiCacheStore.entryResults[originalTitle].main = {
                    title: data.title,
                    snippet: data.snippet,
                    imageUrl: data.imageUrl,
                    lastUpdate: data.lastUpdate || new Date().toISOString()
                };
                if (window.StorageManager) {
                    StorageManager.saveData('wikiCacheStore', WikiManager.wikiCacheStore);
                }
            }

            // Update the entry in the list
            const currentEntries = this.getEntries();
            let entryIndex = currentEntries.findIndex(e => e.title === originalTitle);
            if (entryIndex === -1) {
                entryIndex = currentEntries.findIndex(e => e.title === data.title);
            }

            if (entryIndex !== -1) {
                currentEntries[entryIndex].imageUrl = data.imageUrl;
                this.saveEntries(currentEntries);

                console.log(`Updated data for ${originalTitle}, re-rendering list.`);
                if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                    WikiManager.renderWikiEntryList(true);
                }
            }
        },

        /**
         * Legacy fetch fallback
         */
        _legacyFetch: async function (title) {
            let url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|pageimages&exintro=1&pithumbsize=300&redirects=1&pilicense=any&format=json&origin=*`;
            try {
                let response = await fetch(url);
                let data = await response.json();
                let page = Object.values(data.query?.pages || {})[0];
                if (page && !page.missing) {
                    this._handleFetchResult(title, {
                        title: page.title,
                        snippet: page.extract,
                        imageUrl: page.thumbnail ? page.thumbnail.source : null,
                        lastUpdate: new Date().toISOString()
                    });
                }
            } catch (e) {
                console.error(`WikiEntries: Legacy fetch error for ${title}:`, e);
            }
        },

        // Helper to get entries from storage
        getEntries: function () {
            if (window.WikiManager && WikiManager.wikiEntries && WikiManager.wikiEntries.length > 0) {
                return WikiManager.wikiEntries;
            }
            return window.StorageManager ? StorageManager.loadData('wikiEntries', []) : [];
        },

        // Helper to save entries to storage
        saveEntries: function (entries) {
            if (window.WikiManager) {
                WikiManager.wikiEntries = entries;
            }
            if (window.StorageManager) {
                StorageManager.saveData('wikiEntries', entries);
            } else {
                localStorage.setItem('wikiEntries', JSON.stringify(entries));
            }
        }
    };

    // Initialize
    window.WikiEntries = WikiEntries;
    WikiEntries.init();

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('WikiEntries', WikiEntries);
    }
})();
