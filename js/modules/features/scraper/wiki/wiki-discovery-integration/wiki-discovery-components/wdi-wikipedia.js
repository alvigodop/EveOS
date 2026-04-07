/**
 * Wiki Discovery Integration - Wikipedia Module
 * 
 * Handles Wikipedia article and category search logic.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WDIWikipedia = {
        /**
         * Search for Wikipedia articles
         */
        searchWikiArticles: async function () {
            const searchTerm = document.getElementById('wikiDiscoveryInput').value.trim();

            if (!searchTerm) {
                return;
            }

            // Show loading indicator
            if (window.WDIUI) WDIUI.updateLoadingIndicator(true, 'Searching for Wikipedia articles...');

            try {
                // Save the search term to cache
                if (window.CacheManager) {
                    CacheManager.logSearch(searchTerm, 'wikipedia');
                }

                const searchPromises = [];

                // 1. Managed Entries Search (Local Knowledge Base)
                if (window.SWOrchestrator && window.WikiManager) {
                    const entries = WikiManager.wikiEntries || [];
                    if (entries.length > 0) {
                        searchPromises.push(SWOrchestrator.searchManagedWikipedia(entries, searchTerm, {
                            liveSearch: false, // Use cache for managed part for speed
                            hybridSearch: true
                        }));
                    } else {
                        searchPromises.push(Promise.resolve([]));
                    }
                } else {
                    searchPromises.push(Promise.resolve([]));
                }

                // 2. Live Discovery Search (External API)
                if (window.WikipediaDiscovery && typeof WikipediaDiscovery.discover === 'function') {
                    searchPromises.push(new Promise((resolve) => {
                        WikipediaDiscovery.discover(searchTerm, (res) => resolve(res || []));
                    }));
                } else {
                    searchPromises.push(Promise.resolve([]));
                }

                // Execute searches in parallel
                const [managedResults, discoveryResults] = await Promise.all(searchPromises);
                
                // --- Merge & Deduplicate ---
                const processedUrls = new Set();
                let mergedResults = [];

                // A. Prioritize Managed Results (Exact hits from sources)
                managedResults.forEach(res => {
                    const url = res.url;
                    if (!url || processedUrls.has(url)) return;
                    
                    mergedResults.push({
                        ...res,
                        isManaged: true // Flag for prioritization/highlighting
                    });
                    processedUrls.add(url);
                });

                // B. Add Discovery Results (New findings)
                let discoveryList = discoveryResults || [];
                
                // Fetch thumbnails for discovery results
                if (discoveryList.length > 0 && window.WikipediaDiscovery && typeof WikipediaDiscovery.fetchThumbnails === 'function') {
                    discoveryList = await WikipediaDiscovery.fetchThumbnails(discoveryList);
                }

                discoveryList.forEach(res => {
                    // Standardize URL logic
                    const url = res.url || `https://en.wikipedia.org/wiki/${encodeURIComponent((res.title || '').replace(/ /g, '_'))}`;
                    if (!url || processedUrls.has(url)) return;

                    mergedResults.push({
                        ...res,
                        url: url
                    });
                    processedUrls.add(url);
                });

                // C. Enrichment
                if (window.ResultProcessor && typeof ResultProcessor.enrich === 'function') {
                    mergedResults = ResultProcessor.enrich(mergedResults);
                }

                console.log('WDIWikipedia: Hybrid Wikipedia search results:', mergedResults);

                if (mergedResults.length > 0) {
                    // Hide loading indicator on success
                    if (window.WDIUI) WDIUI.updateLoadingIndicator(false);

                    // Render results using SearchUIRenderer mechanism
                    const container = document.getElementById('wikiDiscoveryResults');
                    if (container && window.SearchUIRenderer) {
                        SearchUIRenderer.renderWikipediaDiscoveryResults(mergedResults, container, {
                            isAdded: (item) => window.WikiManager && WikiManager.wikiEntries.some(entry => entry.title === item.title),
                            onAdd: (title, thumb, btnElement) => {
                                // Call the facade/public method for consistency
                                const newEntry = window.WikiDiscoveryIntegration ? WikiDiscoveryIntegration.addWikiEntryFromDiscovery(title, thumb) : null;

                                // Update button
                                if (newEntry && btnElement && window.WDIUI) {
                                    WDIUI.markButtonAsAdded(btnElement);
                                }
                            },
                            onItemClick: (e, url) => {
                                if (window.WikiManager) WikiManager.handleWikiResultClick(e, url);
                            }
                        });
                    }

                    // Deep Sync metadata to sidebar cache for existing entries
                    if (window.WikiManager && window.CacheWikipedia) {
                        const advancedNormalizeTitle = (t) => {
                            if (!t) return "";
                            return String(t)
                                .replace(/_/g, " ") // Standardize spaces
                                .replace(/\s*\([^)]+\)$/, "") // Remove Wikipedia parentheticals e.g. "(manga)", "(anime)"
                                .trim()
                                .toLowerCase();
                        };
                        
                        const sidebarEntries = WikiManager.wikiEntries || [];
                        
                        // Use for...of to properly await each sync operation
                        for (const item of mergedResults) {
                            const resultTitle = item.title || "";
                            const normalizedResultTitle = advancedNormalizeTitle(resultTitle);
                            const resultSnippet = (item.description || item.snippet || "").toLowerCase();
                            
                            for (const entry of sidebarEntries) {
                                const entryTitle = entry.title || "";
                                const normEntryTitle = advancedNormalizeTitle(entryTitle);
                                
                                const isExactMatch = normEntryTitle === normalizedResultTitle;
                                const isPrefixMatch = normalizedResultTitle.startsWith(normEntryTitle + ":") || normalizedResultTitle.startsWith(normEntryTitle + " ");
                                const isLinkedMatch = resultSnippet.includes(`linked from: ${normEntryTitle}`);
                                
                                if (isExactMatch || isPrefixMatch || isLinkedMatch) {
                                    await CacheWikipedia.updateWikipediaEntryData(entryTitle, {
                                        thumbnail: item.thumbnail,
                                        snippet: item.description || item.snippet,
                                        url: item.url,
                                        cachedAt: new Date().toISOString()
                                    });
                                    break; 
                                }
                            }
                        }
                    }

                    // Update sidebar cache status if WikiManager is available
                    setTimeout(() => {
                        if (window.WikiManager) {
                            if (typeof WikiManager.refreshCacheStores === 'function') WikiManager.refreshCacheStores();
                            if (typeof WikiManager.renderWikiEntryList === 'function') WikiManager.renderWikiEntryList(true);
                        }
                    }, 50);
                } else {
                    // Hide loading indicator
                    if (window.WDIUI) WDIUI.updateLoadingIndicator(false);
                    const container = document.getElementById('wikiDiscoveryResults');
                    if (container) container.innerHTML = '<p class="info">No results found in discovery or managed entries.</p>';
                }
            } catch (error) {
                console.error('Error searching for articles:', error);
                if (window.WDIUI) WDIUI.updateLoadingIndicator(false);
                if (window.WDIUI) WDIUI.showError('wikiDiscoveryResults', `Error searching for articles: ${error.message}`);
            }
        },

        /**
         * Add a Wikipedia entry from discovery results
         * @param {string} title 
         * @param {string} imageUrl 
         */
        addWikiEntryFromDiscovery: function (title, imageUrl) {
            if (!window.WikiManager) return null;

            const newEntry = WikiManager.addWikiEntry(title, null, imageUrl);
            if (newEntry) {
                // Find and update the button using WDIUI
                if (window.WDIUI) {
                    WDIUI.updateDiscoveryButtonStatus('wikipedia', title, true);
                }
            }
            return newEntry;
        },

        /**
         * Search Wikipedia Categories
         */
        searchWikiCategories: async function () {
            const searchTerm = document.getElementById('wikiDiscoveryInput').value.trim();
            const resultsDiv = document.getElementById('wikiDiscoveryResults');

            if (!searchTerm) {
                alert('Please enter a search term');
                return;
            }

            if (resultsDiv) resultsDiv.innerHTML = '<div class="loading">Searching categories...</div>';

            try {
                const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Category:${encodeURIComponent(searchTerm)}&format=json&origin=*&srnamespace=14`;
                const response = await fetch(searchUrl);
                const data = await response.json();

                if (resultsDiv) {
                    if (!data.query || !data.query.search || data.query.search.length === 0) {
                        resultsDiv.innerHTML = 'No categories found.';
                        return;
                    }

                    const categories = data.query.search;

                    // Delegate rendering to UI module
                    if (window.WDIUI) {
                        WDIUI.renderCategoryResults(categories, resultsDiv);
                    }
                }
            } catch (error) {
                console.error('Error searching categories:', error);
                if (resultsDiv) resultsDiv.innerHTML = 'Error searching categories.';
            }
        }
    };

    window.WDIWikipedia = WDIWikipedia;

})();
