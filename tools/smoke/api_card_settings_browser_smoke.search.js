async function runApiSearchScenario(page) {
    return page.evaluate(async () => {
            const providers = [
                ['MangaDex', 'searchMangaDex', () => ({ data: [{ id: 'md-1', title: "JoJo's Kingdom" }] })],
                ['Jikan', 'searchJikanManga', () => ({ data: [] })],
                ['Jikan', 'searchJikanAnime', () => ({ data: [] })],
                ['AniList', 'searchAniListManga', () => ({ data: { Page: { media: [] } } })],
                ['AniList', 'searchAniListAnime', () => ({ data: { Page: { media: [] } } })],
                ['MangaUpdates', 'searchMangaUpdates', () => ({ results: [] })],
                ['Kitsu', 'searchKitsuAnime', () => ({ data: [] })],
                ['Kitsu', 'searchKitsuManga', () => ({ data: [] })],
                ['TVmaze', 'searchTVmaze', () => ([])],
                ['iTunes', 'searchiTunes', () => ({ results: [] })],
                ['WlnUpdates', 'searchWlnUpdates', () => ({ data: [] })],
                ['OpenLibrary', 'searchOpenLibrary', () => ({ docs: [{ key: '/works/OL1W', title: 'Kingdom Atlas' }] })],
                ['ComicK', 'searchComicK', () => ([])]
            ];
            window.__apiSmokeProviderCalls = 0;
            providers.forEach(([namespace, method, factory]) => {
                window.EveOS.API[namespace] = window.EveOS.API[namespace] || {};
                window.EveOS.API[namespace][method] = async function () {
                    window.__apiSmokeProviderCalls += 1;
                    return factory();
                };
            });
            window.currentCategoryCtx = 'Alpha';
            if (window.StorageManager?.setCategoryContext) {
                window.StorageManager.setCategoryContext('Alpha');
            }
            if (window.StorageManager?.saveData) {
                window.StorageManager.saveData('wikiEntries', [{ title: 'Naruto', name: 'Naruto' }]);   
                window.StorageManager.saveData('fandomDomains', [{ domain: 'naruto.fandom.com', name: 'Narutopedia' }]);
                window.StorageManager.saveData('fandomCacheIndex', {
                    'naruto.fandom.com': {
                        domain: 'naruto.fandom.com',
                        itemCount: 1,
                        updatedAt: '2026-04-04T09:05:00.000Z',
                        sampleTitles: ['Naruto Wiki']
                    }
                });
                window.StorageManager.saveData('wikiCacheStore', {
                    // Root level key satisfies legacy CWStorage.getWikipediaEntryData
                    Naruto: { title: 'Naruto', extract: 'Leaf village ninja.', lastUpdate: '2026-04-04T09:00:00.000Z' },
                    entryResults: {
                        Naruto: {
                            main: { title: 'Naruto', extract: 'Leaf village ninja.' },
                            searchResults: {
                                chakra: { title: 'Chakra', snippet: 'Energy system.' }
                            },
                            lastUpdate: '2026-04-04T09:00:00.000Z'
                        }
                    }
                });
                window.StorageManager.saveData('wikiDataStore', {
                    searchResults: {}
                });
            }
            // Force CacheCore to reload seeded wikiCacheStore and wikiDataStore
            if (window.CacheCore) {
                CacheCore._initialized = false;
                CacheCore.init();
            }
            if (window.EveOS?.API?.Cache?.storeQuery) {
                await window.EveOS.API.Cache.storeQuery('naruto', {
                    mangadex: {
                        data: [{
                            id: 'md-naruto',
                            attributes: {
                                title: { en: 'Naruto' },
                                description: { en: 'Naruto manga overview.' },
                                year: 1999,
                                status: 'completed',
                                tags: [{
                                    attributes: {
                                        name: { en: 'Action' },
                                        group: 'genre'
                                    }
                                }]
                            },
                            relationships: [],
                            stats: {
                                follows: 250
                            }
                        }]
                    },
                    openlibrary: {
                        docs: [{
                            key: '/works/OLNARUTO',
                            title: 'Naruto Archive',
                            author_name: ['Masashi Kishimoto'],
                            subject: ['Ninja']
                        }]
                    }
                }, 'Alpha');
            }
            if (window.FSLCache?.updateAggregateCache) {
                await window.FSLCache.updateAggregateCache('naruto', [{
                    title: 'Naruto Wiki',
                    snippet: 'Naruto Uzumaki ninja profile page.',
                    url: 'https://naruto.fandom.com/wiki/Naruto_Uzumaki',
                    domain: 'naruto.fandom.com',
                    wiki_name: 'Narutopedia',
                    contentType: 'character',
                    categories: ['Characters'],
                    tags: ['Ninja'],
                    rating: 8.8
                }]);
            }
            window.__knowledgeLiveCalls = {
                wikipediaEntry: 0,
                fandomDomainSearch: 0,
                fandomPageDetails: 0
            };
            if (window.WikipediaAPI?.fetchLiveEntry) {
                const originalFetchLiveEntry = window.WikipediaAPI.fetchLiveEntry.bind(window.WikipediaAPI);
                window.WikipediaAPI.fetchLiveEntry = async function () {
                    window.__knowledgeLiveCalls.wikipediaEntry += 1;
                    return originalFetchLiveEntry.apply(this, arguments);
                };
            }
            if (window.SearchFandom?.fetchLiveFandomDomainSearch) {
                const originalFetchLiveFandomDomainSearch = window.SearchFandom.fetchLiveFandomDomainSearch.bind(window.SearchFandom);
                window.SearchFandom.fetchLiveFandomDomainSearch = async function () {
                    window.__knowledgeLiveCalls.fandomDomainSearch += 1;
                    return originalFetchLiveFandomDomainSearch.apply(this, arguments);
                };
            }
            if (window.SearchFandom?.fetchLiveFandomPageDetails) {
                const originalFetchLiveFandomPageDetails = window.SearchFandom.fetchLiveFandomPageDetails.bind(window.SearchFandom);
                window.SearchFandom.fetchLiveFandomPageDetails = async function () {
                    window.__knowledgeLiveCalls.fandomPageDetails += 1;
                    return originalFetchLiveFandomPageDetails.apply(this, arguments);
                };
            }
            window.openCategorySettings('Alpha', 'search');
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (window.WikiManager?.refreshCacheStores) {
                await window.WikiManager.refreshCacheStores();
            }
            if (window.WikiManager?.renderFandomDomainList) {
                await window.WikiManager.renderFandomDomainList(true);
            }
            const modal = document.getElementById('categorySettingsModal');
            const searchInput = modal.querySelector('.api-search-input');
            const searchButton = modal.querySelector('.api-search-btn');
            const searchHybridToggle = modal.querySelector('[data-api-hybrid-toggle="search"]');        
            const searchLiveToggle = modal.querySelector('[data-api-live-toggle="search"]');
            const searchTtlSelect = modal.querySelector('[data-api-ttl-select="search"]');
            const searchPopupRadio = modal.querySelector('[data-api-open-mode="search"][value="popup"]');
            const searchNewTabRadio = modal.querySelector('[data-api-open-mode="search"][value="newtab"]');
            const openUnidexButton = modal.querySelector('.api-search-open-unidex-btn');
            const searchCachePool = modal.querySelector('.api-cache-pool-list');
            const searchResults = document.getElementById('modal-api-results-container');
            const searchTabLabel = document.getElementById('tab-btn-search')?.textContent?.trim() || '';
            if (!searchInput || !searchButton || !searchHybridToggle || !searchLiveToggle || !searchTtlSelect || !searchPopupRadio || !searchNewTabRadio || !openUnidexButton || !searchCachePool || !searchResults) {
                throw new Error('Search tab API UI failed to render');
            }
            searchHybridToggle.checked = true;
            searchHybridToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchLiveToggle.checked = false;
            searchLiveToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchTtlSelect.value = String(60 * 60 * 1000);
            searchTtlSelect.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.value = 'kingdom';
            searchButton.click();
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const hasEntry = searchCachePool.querySelectorAll('.api-cache-entry').length > 0;   
                    const hasRenderedResults = !!searchResults.querySelector('.api-unidex-provider-sections .api-unidex-provider-results');
                    if (hasEntry && hasRenderedResults) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 30000) {
                        console.log('[Smoke-Debug] Timeout Details:', {
                            entries: searchCachePool.querySelectorAll('.api-cache-entry').length,
                            sections: searchResults.querySelectorAll('.api-unidex-provider-section').length,
                            html: searchResults.innerHTML.slice(0, 500)
                        });
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for cached API search results'));
                    }
                }, 200);
            });
            const providerCallsAfterHybridMiss = window.__apiSmokeProviderCalls;
            const alphaCacheEntry = await window.EveOS.API.Cache.getQuery('kingdom', 'Alpha');
            const betaCacheEntry = await window.EveOS.API.Cache.getQuery('kingdom', 'Beta');
            const narutoApiCacheEntry = await window.EveOS.API.Cache.getQuery('naruto', 'Alpha');       
            const alphaPrefsAfterSearch = await window.EveOS.API.Cache.loadPrefs('Alpha');
            const allProviderRenderedCards = searchResults.querySelectorAll('.manga-item').length;      
            const searchPoolText = searchCachePool.textContent || '';
            const narutoSourceCard = Array.from(searchCachePool.querySelectorAll('.api-cache-entry-source')).find((entry) => {
                return (entry.textContent || '').includes('Naruto');
            });
            const wikiCacheVisible = !!narutoSourceCard && (narutoSourceCard.textContent || '').includes('Wiki: Naruto');
            const fandomCacheVisible = !!narutoSourceCard && (narutoSourceCard.textContent || '').includes('Fandom: naruto.fandom.com');
            const apiCacheVisible = !!narutoSourceCard && (narutoSourceCard.textContent || '').includes('API query: naruto');
            const knowledgeActionButtons = {
                openGroup: !!narutoSourceCard?.querySelector('.api-cache-open-group-btn'),
                viewGroup: !!narutoSourceCard?.querySelector('.api-cache-view-group-btn')
            };
            const viewGroupButton = narutoSourceCard?.querySelector('.api-cache-view-group-btn');       
            if (!viewGroupButton) {
                throw new Error('Expected Search Unidex card to expose a group View button');
            }
            viewGroupButton.click();
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const popup = document.getElementById('dataPopup');
                    const popupContent = document.getElementById('dataPopupContent');
                    if (popup && window.getComputedStyle(popup).display !== 'none' && popupContent && String(popupContent.textContent || '').trim().length > 0) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 4000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for Search Unidex cache popup content'));   
                    }
                }, 60);
            });
            const dataPopupVisible = window.getComputedStyle(document.getElementById('dataPopup')).display !== 'none';
            const dataPopupText = String(document.getElementById('dataPopupContent')?.textContent || '').trim();
            const dataPopupParentTag = String(document.getElementById('dataPopup')?.parentElement?.tagName || '');
            document.getElementById('dataPopup').style.display = 'none';
            const originalPopupOpen = window.PopupManager?.openPopup;
            const originalWindowOpen = window.open;
            const originalResolvePopupUrl = window.EveOS?.API?.Core?.getPopupViewerUrl;
            window.__apiPopupCalls = [];
            window.__apiNewTabCalls = [];
            window.PopupManager = window.PopupManager || {};
            window.PopupManager.openPopup = function (url, title) {
                window.__apiPopupCalls.push({ url, title });
            };
            window.open = function (url, target) {
                window.__apiNewTabCalls.push({ url, target });
                return null;
            };
            if (window.EveOS?.API?.Core) {
                window.EveOS.API.Core.getPopupViewerUrl = async function (url) {
                    return `http://127.0.0.1:3037/api/lightpanda?url=${encodeURIComponent(url)}`;       
                };
            }
            const firstResultLink = searchResults.querySelector('.manga-title a');
            if (!firstResultLink) {
                throw new Error('Expected an API result title link');
            }
            searchPopupRadio.checked = true;
            searchPopupRadio.dispatchEvent(new Event('change', { bubbles: true }));
            firstResultLink.click();
            await new Promise((resolve) => setTimeout(resolve, 80));
            searchNewTabRadio.checked = true;
            searchNewTabRadio.dispatchEvent(new Event('change', { bubbles: true }));
            firstResultLink.click();
            await new Promise((resolve) => setTimeout(resolve, 80));
            const popupCalls = window.__apiPopupCalls.slice();
            const newTabCalls = window.__apiNewTabCalls.slice();
            window.PopupManager.openPopup = originalPopupOpen;
            window.open = originalWindowOpen;
            if (window.EveOS?.API?.Core) {
                window.EveOS.API.Core.getPopupViewerUrl = originalResolvePopupUrl;
            }
            searchHybridToggle.checked = true;
            searchHybridToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchLiveToggle.checked = false;
            searchLiveToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.value = 'naruto';
            searchButton.click();
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const wikiSection = searchResults.querySelector('[data-unidex-section="wikipedia"]');
                    const fandomSection = searchResults.querySelector('[data-unidex-section="fandom"]');
                    const apiSection = searchResults.querySelector('[data-unidex-section="api"]');      
                    const hasWikiCard = wikiSection?.querySelector('.unidex-search-card');
                    const hasFandomCard = fandomSection?.querySelector('.unidex-search-card');
                    const hasApiCard = apiSection?.querySelector('.manga-item') || apiSection?.querySelector('.api-unidex-provider-row');
                    if (hasWikiCard && hasFandomCard && hasApiCard) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 25000) {
                        console.log('[Smoke-Debug] Unified Timeout:', {
                            wiki: !!hasWikiCard,
                            fandom: !!hasFandomCard,
                            api: !!hasApiCard,
                            html: searchResults.innerHTML.slice(0, 500)
                        });
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for unified Search Unidex results'));       
                    }
                }, 200);
            });
            const unifiedSectionTitles = Array.from(searchResults.querySelectorAll('.api-cache-section-header > span:first-child')).map((node) => node.textContent.trim());
            const unifiedWikiText = searchResults.querySelector('[data-unidex-section="wikipedia"]')?.textContent || '';
            const unifiedFandomText = searchResults.querySelector('[data-unidex-section="fandom"]')?.textContent || '';
            const unifiedApiText = searchResults.querySelector('[data-unidex-section="api"]')?.textContent || '';
            const unifiedWikiTitles = Array.from(searchResults.querySelectorAll('[data-unidex-section="wikipedia"] .unidex-search-card-title')).slice(0, 8).map((node) => node.textContent.trim());
            const fandomTitleRepaired = unifiedFandomText.includes('Naruto Uzumaki') && !unifiedFandomText.includes('Naruto WikiNarutopedia');
            searchHybridToggle.checked = false;
            searchHybridToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchLiveToggle.checked = false;
            searchLiveToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchButton.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const providerCallsAfterCacheOnlyHit = window.__apiSmokeProviderCalls;
            window.__knowledgeLiveCalls = {
                wikipediaEntry: 0,
                fandomDomainSearch: 0,
                fandomPageDetails: 0
            };
            searchInput.value = 'ninja';
            searchButton.click();
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const wikiSection = searchResults.querySelector('[data-unidex-section="wikipedia"]');
                    const fandomSection = searchResults.querySelector('[data-unidex-section="fandom"]');
                    const apiSection = searchResults.querySelector('[data-unidex-section="api"]');      
                    const hasWikiCard = wikiSection?.querySelector('.unidex-search-card');
                    const hasFandomCard = fandomSection?.querySelector('.unidex-search-card');
                    const hasApiCard = apiSection?.querySelector('.manga-item') || apiSection?.querySelector('.unidex-api-provider-row');
                    if (hasWikiCard && hasFandomCard && hasApiCard) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 25000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for Search Unidex cache-backed ninja results'));
                    }
                }, 100);
            });
            const providerCallsAfterCacheFallbackHit = window.__apiSmokeProviderCalls;
            const knowledgeLiveCallsAfterCacheFallbackHit = { ...window.__knowledgeLiveCalls };
            const ninjaWikiText = searchResults.querySelector('[data-unidex-section="wikipedia"]')?.textContent || '';
            const ninjaFandomText = searchResults.querySelector('[data-unidex-section="fandom"]')?.textContent || '';
            const ninjaApiText = searchResults.querySelector('[data-unidex-section="api"]')?.textContent || '';
            openUnidexButton.click();
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const panel = document.getElementById('unidexManagement');
                    if (panel && window.getComputedStyle(panel).display !== 'none') {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 6000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for Search Unidex button to open scraper Unidex panel'));
                    }
                }, 80);
            });
            await new Promise((resolve) => setTimeout(resolve, 800));
            if (typeof window.updateSource === 'function') {
                window.updateSource('fandom');
            }
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const fandomManagement = document.getElementById('fandomManagement');
                    const fandomDomainList = document.getElementById('fandomDomainList');
                    if (fandomManagement && window.getComputedStyle(fandomManagement).display !== 'none' && fandomDomainList) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 10000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for scraper fandom management panel'));
                    }
                }, 100);
            });
            if (window.WikiManager?.refreshCacheStores) {
                await window.WikiManager.refreshCacheStores();
            }
            if (window.WikiManager?.renderFandomDomainList) {
                await window.WikiManager.renderFandomDomainList(true);
            }
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const fandomSidebarCard = Array.from(document.querySelectorAll('#fandomDomainList .entry-item')).find((entry) => {
                        return (entry.textContent || '').includes('naruto.fandom.com');
                    });
                    const statusText = String(fandomSidebarCard?.querySelector('.entry-status')?.textContent || '').trim();
                    if (fandomSidebarCard && /Cached/i.test(statusText) && !/Not Cached/i.test(statusText)) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 12000) {
                        window.clearInterval(timer);
                        reject(new Error(`Timed out waiting for Fandom sidebar cache state to hydrate: ${statusText}`));
                    }
                }, 100);
            });
            const fandomSidebarCard = Array.from(document.querySelectorAll('#fandomDomainList .entry-item')).find((entry) => {
                return (entry.textContent || '').includes('naruto.fandom.com');
            });
            const fandomSidebarStatusText = String(fandomSidebarCard?.querySelector('.entry-status')?.textContent || '').trim();
            const fandomSidebarViewButton = fandomSidebarCard?.querySelector('.cache-btn');
            if (!fandomSidebarViewButton) {
                throw new Error('Expected Fandom sidebar card to expose a View Cache button');
            }
            const fandomSidebarHasViewButton = !!fandomSidebarViewButton;
        return {
            alphaCacheSummary: alphaCacheEntry?.summary || null,
            alphaPrefsAfterSearch,
            apiCacheVisible,
            betaCacheVisible: !!betaCacheEntry,
            dataPopupParentTag,
            dataPopupText,
            dataPopupVisible,
            fandomCacheVisible,
            fandomSidebarHasViewButton,
            fandomSidebarStatusText,
            fandomTitleRepaired,
            knowledgeActionButtons,
            knowledgeLiveCallsAfterCacheFallbackHit,
            narutoApiCacheSummary: narutoApiCacheEntry?.summary || null,
            newTabCalls,
            ninjaApiText,
            ninjaFandomText,
            ninjaWikiText,
            popupCalls,
            providerCallsAfterCacheFallbackHit,
            providerCallsAfterCacheOnlyHit,
            providerCallsAfterHybridMiss,
            searchResultCount: allProviderRenderedCards,
            searchResultsVisible: window.getComputedStyle(searchResults).display,
            searchTabLabel,
            searchTtlValue: searchTtlSelect?.value || '',
            unifiedApiText,
            unifiedFandomText,
            unifiedSectionTitles,
            unifiedWikiText,
            unifiedWikiTitles,
            wikiCacheVisible
        };
    });
}
module.exports = {
    runApiSearchScenario
};
