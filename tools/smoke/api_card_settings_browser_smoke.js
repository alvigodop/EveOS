const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openCategorySettings === 'function'
        && typeof window.switchCategoryTab === 'function'
        && !!window.EveOS?.API?.Manager?.runSearch
        && !!window.EveOS?.API?.Cache
        && !!window.CategoryScraperPanel
        && !!document.getElementById('categorySettingsModal')
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (error) => {
        pageErrors.push(error && error.stack ? error.stack : String(error));
    });
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await waitForApp(page);
        await page.waitForTimeout(2000);

        const result = await page.evaluate(async () => {
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
                window.StorageManager.saveData('wikiCacheStore', {
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
                    searchResults: {
                        'naruto.fandom.com': {
                            lastUpdate: '2026-04-04T09:05:00.000Z',
                            ninja: { title: 'Ninja', snippet: 'Shinobi article.', url: 'https://naruto.fandom.com/wiki/Ninja', domain: 'naruto.fandom.com' }
                        }
                    }
                });
            }
            // Force CacheCore to reload seeded wikiCacheStore and wikiDataStore
            if (window.CacheCore) {
                CacheCore._initialized = false;
                CacheCore.init();
            }
            if (window.EveOS?.API?.Cache?.storeQuery) {
                window.EveOS.API.Cache.storeQuery('naruto', {
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
                    snippet: 'Naruto Uzumaki fandom page.',
                    url: 'https://naruto.fandom.com/wiki/Naruto_Uzumaki',
                    domain: 'naruto.fandom.com',
                    wiki_name: 'Narutopedia',
                    contentType: 'character',
                    categories: ['Characters'],
                    tags: ['Shinobi'],
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
                    const hasRenderedResults = !!searchResults.querySelector('.api-unidex-provider-sections .manga-item');
                    if (hasEntry && hasRenderedResults) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 8000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for cached API search results'));
                    }
                }, 80);
            });

            const providerCallsAfterHybridMiss = window.__apiSmokeProviderCalls;
            const alphaCacheEntry = window.EveOS.API.Cache.getQuery('kingdom', 'Alpha');
            const betaCacheEntry = window.EveOS.API.Cache.getQuery('kingdom', 'Beta');
            const narutoApiCacheEntry = window.EveOS.API.Cache.getQuery('naruto', 'Alpha');
            const alphaPrefsAfterSearch = window.EveOS.API.Cache.loadPrefs('Alpha');
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
                    const hasApiCard = apiSection?.querySelector('.manga-item');
                    if (hasWikiCard && hasFandomCard && hasApiCard) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 8000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for unified Search Unidex results'));
                    }
                }, 80);
            });
            const unifiedSectionTitles = Array.from(searchResults.querySelectorAll('.api-cache-section-header > span:first-child')).map((node) => node.textContent.trim());
            const unifiedWikiText = searchResults.querySelector('[data-unidex-section="wikipedia"]')?.textContent || '';
            const unifiedFandomText = searchResults.querySelector('[data-unidex-section="fandom"]')?.textContent || '';
            const unifiedApiText = searchResults.querySelector('[data-unidex-section="api"]')?.textContent || '';
            const fandomTitleRepaired = unifiedFandomText.includes('Naruto Uzumaki') && !unifiedFandomText.includes('Naruto WikiNarutopedia');

            searchHybridToggle.checked = false;
            searchHybridToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchLiveToggle.checked = false;
            searchLiveToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchButton.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const providerCallsAfterCacheOnlyHit = window.__apiSmokeProviderCalls;

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
                    const hasApiCard = apiSection?.querySelector('.manga-item');
                    if (hasWikiCard && hasFandomCard && hasApiCard) {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 8000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for Search Unidex cache-backed ninja results'));
                    }
                }, 80);
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

            const providerSourceButtons = Array.from(modal.querySelectorAll('#apiSourceToggleCluster .source-toggle-btn'));
            const sourceMangaDexBtn = modal.querySelector('.source-toggle-btn[data-source="mangadex"]');
            const unidexBtn = modal.querySelector('.source-toggle-btn[data-source="unidex"]');
            if (!sourceMangaDexBtn || !unidexBtn || providerSourceButtons.length < 13) {
                throw new Error('Scraper tab missing provider source toggles or Unidex');
            }
            sourceMangaDexBtn.click();

            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const panel = document.getElementById('apiManagement');
                    if (panel && window.getComputedStyle(panel).display !== 'none') {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 6000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for API scraper management panel'));
                    }
                }, 80);
            });
            await new Promise((resolve) => setTimeout(resolve, 450));

            const scraperHybridToggle = modal.querySelector('[data-api-hybrid-toggle="scraper"]');
            const scraperLiveToggle = modal.querySelector('[data-api-live-toggle="scraper"]');
            const scraperTtlSelect = modal.querySelector('[data-api-ttl-select="scraper"]');
            const scraperNewTabRadio = modal.querySelector('[data-api-open-mode="scraper"][value="newtab"]');
            const scraperCacheEntries = modal.querySelectorAll('#api-scraper-panel-container .api-cache-entry').length;
            const apiManagementDisplay = window.getComputedStyle(document.getElementById('apiManagement')).display;
            const scraperProviderTitle = modal.querySelector('#apiManagement .api-scraper-provider-title')?.textContent?.trim() || '';

            const scraperSearchInput = modal.querySelector('#searchInput');
            if (!scraperSearchInput) {
                throw new Error('Scraper search input missing');
            }
            scraperSearchInput.value = 'kingdom';

            const providerCallsBeforeScraperSearch = window.__apiSmokeProviderCalls;
            await window.SearchCoordinatorFlow.performContentSearch('kingdom', 'mangadex', {
                layout: 'grid',
                liveSearch: false,
                hybridSearch: false
            }, false);
            await new Promise((resolve) => setTimeout(resolve, 300));
            const providerCallsAfterScraperSearch = window.__apiSmokeProviderCalls;
            const alphaPrefsFinal = window.EveOS.API.Cache.loadPrefs('Alpha');
            const providerFilteredResultCount = document.getElementById('resultCount')?.textContent || '';

            unidexBtn.click();
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
                        reject(new Error('Timed out waiting for Unidex management panel'));
                    }
                }, 80);
            });
            await new Promise((resolve) => setTimeout(resolve, 400));

            const unidexPanel = document.getElementById('unidexManagement');
            const unidexNarutoCard = Array.from(unidexPanel.querySelectorAll('.unidex-source-card')).find((entry) => {
                return (entry.textContent || '').includes('Naruto');
            });
            const unidexProviderRows = unidexNarutoCard ? unidexNarutoCard.querySelectorAll('.unidex-api-provider-row').length : 0;
            const unidexLaneTitles = unidexNarutoCard
                ? Array.from(unidexNarutoCard.querySelectorAll('.unidex-lane-title')).map((node) => node.textContent.trim())
                : [];
            const unidexHasProviderOpen = !!unidexNarutoCard?.querySelector('.api-cache-open-provider-btn[data-provider-key="mangadex"][data-query="naruto"]');

            return {
                providerCallsAfterHybridMiss,
                providerCallsAfterCacheOnlyHit,
                providerCallsAfterCacheFallbackHit,
                providerCallsBeforeScraperSearch,
                providerCallsAfterScraperSearch,
                knowledgeLiveCallsAfterCacheFallbackHit,
                alphaCacheSummary: alphaCacheEntry?.summary || null,
                narutoApiCacheSummary: narutoApiCacheEntry?.summary || null,
                betaCacheVisible: !!betaCacheEntry,
                alphaPrefsAfterSearch,
                alphaPrefsFinal,
                popupCalls,
                newTabCalls,
                unifiedSectionTitles,
                unifiedWikiText,
                unifiedFandomText,
                unifiedApiText,
                fandomTitleRepaired,
                ninjaWikiText,
                ninjaFandomText,
                ninjaApiText,
                searchTabLabel,
                searchResultCount: allProviderRenderedCards,
                searchResultsVisible: window.getComputedStyle(searchResults).display,
                dataPopupVisible,
                dataPopupParentTag,
                dataPopupText,
                wikiCacheVisible,
                fandomCacheVisible,
                apiCacheVisible,
                knowledgeActionButtons,
                scraperApiPanelVisible: apiManagementDisplay,
                scraperHybridChecked: !!scraperHybridToggle?.checked,
                scraperLiveChecked: !!scraperLiveToggle?.checked,
                scraperTtlValue: scraperTtlSelect?.value || '',
                scraperOpenMode: scraperNewTabRadio?.checked ? 'newtab' : 'popup',
                searchTtlValue: searchTtlSelect?.value || '',
                scraperCacheEntries,
                providerSourceButtons: providerSourceButtons.length,
                scraperProviderTitle,
                providerFilteredResultCount,
                unidexVisible: window.getComputedStyle(unidexPanel).display !== 'none',
                unidexProviderRows,
                unidexLaneTitles,
                unidexHasProviderOpen
            };
        });

        if (result.providerCallsAfterHybridMiss !== 13) {
            throw new Error(`Expected 13 provider calls on hybrid cache miss, saw ${result.providerCallsAfterHybridMiss}`);
        }
        if (result.providerCallsAfterCacheOnlyHit !== result.providerCallsAfterHybridMiss) {
            throw new Error(`Cache-only search should not fetch live providers again: ${JSON.stringify(result)}`);
        }
        if (result.providerCallsAfterCacheFallbackHit !== result.providerCallsAfterHybridMiss) {
            throw new Error(`Search Unidex cache fallback should not fetch live API providers again: ${JSON.stringify(result)}`);
        }
        if (result.providerCallsAfterScraperSearch !== result.providerCallsBeforeScraperSearch) {
            throw new Error(`Scraper API cache-only path should not fetch live providers: ${JSON.stringify(result)}`);
        }
        if (Number(result.knowledgeLiveCallsAfterCacheFallbackHit?.wikipediaEntry || 0) !== 0
            || Number(result.knowledgeLiveCallsAfterCacheFallbackHit?.fandomDomainSearch || 0) !== 0
            || Number(result.knowledgeLiveCallsAfterCacheFallbackHit?.fandomPageDetails || 0) !== 0) {
            throw new Error(`Search Unidex cache-backed knowledge search should not fetch live wiki/fandom data: ${JSON.stringify(result.knowledgeLiveCallsAfterCacheFallbackHit)}`);
        }
        if (!result.alphaCacheSummary || result.alphaCacheSummary.totalResults !== 2) {
            throw new Error(`Expected Alpha cache summary to store two provider results: ${JSON.stringify(result.alphaCacheSummary)}`);
        }
        if (result.betaCacheVisible) {
            throw new Error('Beta card should not see Alpha cache entries');
        }
        if (result.alphaPrefsAfterSearch.liveResults !== false || result.alphaPrefsAfterSearch.hybridResults !== true || result.alphaPrefsAfterSearch.ttlMs !== 60 * 60 * 1000) {
            throw new Error(`Alpha prefs not persisted as expected: ${JSON.stringify(result.alphaPrefsAfterSearch)}`);
        }
        if (result.alphaPrefsFinal.liveResults !== false || result.alphaPrefsFinal.hybridResults !== false || result.alphaPrefsFinal.ttlMs !== 60 * 60 * 1000) {
            throw new Error(`Final Alpha prefs should reflect cache-only retest: ${JSON.stringify(result.alphaPrefsFinal)}`);
        }
        if (result.alphaPrefsAfterSearch.openMode !== 'popup' || result.alphaPrefsFinal.openMode !== 'newtab') {
            throw new Error(`Expected API open-mode preference to persist and update: ${JSON.stringify({ after: result.alphaPrefsAfterSearch, final: result.alphaPrefsFinal })}`);
        }
        if (!Array.isArray(result.popupCalls) || result.popupCalls.length !== 1) {
            throw new Error(`Expected popup mode to route API result links through PopupManager: ${JSON.stringify(result.popupCalls)}`);
        }
        if (!String(result.popupCalls[0].url || '').startsWith('http://127.0.0.1:3037/api/lightpanda?url=')) {
            throw new Error(`Expected popup mode to use a local popup viewer URL for API results: ${JSON.stringify(result.popupCalls)}`);
        }
        if (!Array.isArray(result.newTabCalls) || result.newTabCalls.length !== 1) {
            throw new Error(`Expected new-tab mode to route API result links through window.open: ${JSON.stringify(result.newTabCalls)}`);
        }
        if (!String(result.newTabCalls[0].url || '').includes('mangadex.org/title/md-1')) {
            throw new Error(`Expected new-tab mode to preserve the raw provider URL: ${JSON.stringify(result.newTabCalls)}`);
        }
        if (!Array.isArray(result.unifiedSectionTitles) || !result.unifiedSectionTitles.includes('Wikipedia Saved Sources') || !result.unifiedSectionTitles.includes('Fandom Saved Sources') || !result.unifiedSectionTitles.includes('API Providers')) {
            throw new Error(`Expected Search Unidex to render Wikipedia, Fandom, and API result sections: ${JSON.stringify(result.unifiedSectionTitles)}`);
        }
        if (!/Naruto/i.test(result.unifiedWikiText) || !/Naruto/i.test(result.unifiedFandomText) || !/Naruto/i.test(result.unifiedApiText)) {
            throw new Error(`Expected Search Unidex to render cached Naruto results across all source lanes: ${JSON.stringify({ wiki: result.unifiedWikiText, fandom: result.unifiedFandomText, api: result.unifiedApiText })}`);
        }
        if (!result.fandomTitleRepaired) {
            throw new Error(`Expected Search Unidex to repair generic cached Fandom titles from the page URL: ${JSON.stringify({ fandom: result.unifiedFandomText })}`);
        }
        if (!/Naruto|Ninja/i.test(result.ninjaWikiText) || !/Ninja/i.test(result.ninjaFandomText) || !/Naruto Archive/i.test(result.ninjaApiText)) {
            throw new Error(`Expected Search Unidex to draw cache-backed ninja matches from Wikipedia, Fandom, and API source data: ${JSON.stringify({ wiki: result.ninjaWikiText, fandom: result.ninjaFandomText, api: result.ninjaApiText })}`);
        }
        if (Number(result.searchResultCount) !== 2) {
            throw new Error(`Expected all-provider result count to remain 2, saw ${result.searchResultCount}`);
        }
        if (result.searchTabLabel !== 'Search Unidex') {
            throw new Error(`Expected category settings tab to be renamed to Search Unidex: ${JSON.stringify(result)}`);
        }
        if (result.searchResultsVisible === 'none') {
            throw new Error('Expected API search results container to be visible');
        }
        if (!result.wikiCacheVisible || !result.fandomCacheVisible || !result.apiCacheVisible) {
            throw new Error(`Expected unified cache pool to include grouped Wikipedia, Fandom, and API entries: ${JSON.stringify(result)}`);
        }
        if (!result.knowledgeActionButtons?.openGroup || !result.knowledgeActionButtons?.viewGroup) {
            throw new Error(`Expected unified group cache actions to render in the Search tab: ${JSON.stringify(result)}`);
        }
        if (!result.dataPopupVisible || !/Naruto/i.test(result.dataPopupText)) {
            throw new Error(`Expected Search Unidex View to open cached data popup content from the Search tab: ${JSON.stringify({ visible: result.dataPopupVisible, text: result.dataPopupText })}`);
        }
        if (result.dataPopupParentTag !== 'BODY') {
            throw new Error(`Expected Search Unidex View popup to be hoisted to document.body: ${JSON.stringify({ parent: result.dataPopupParentTag })}`);
        }
        if (!result.narutoApiCacheSummary || result.narutoApiCacheSummary.totalResults !== 2) {
            throw new Error(`Expected seeded Naruto API cache summary to remain available for Unidex: ${JSON.stringify(result.narutoApiCacheSummary)}`);
        }
        if (result.scraperApiPanelVisible === 'none') {
            throw new Error('Expected scraper API management panel to be visible');
        }
        if (result.scraperHybridChecked || result.scraperLiveChecked) {
            throw new Error(`Expected scraper API toggles to reflect cached Alpha prefs: ${JSON.stringify(result)}`);
        }
        if (result.scraperTtlValue !== String(60 * 60 * 1000) || result.searchTtlValue !== String(60 * 60 * 1000)) {
            throw new Error(`Expected TTL select sync between search and scraper panels: ${JSON.stringify(result)}`);
        }
        if (result.scraperOpenMode !== 'newtab') {
            throw new Error(`Expected scraper API link mode control to stay in sync with Search Unidex: ${JSON.stringify(result)}`);
        }
        if (result.scraperCacheEntries < 1) {
            throw new Error(`Expected scraper API panel to show cached entries: ${JSON.stringify(result)}`);
        }
        if (result.providerSourceButtons < 13) {
            throw new Error(`Expected all provider source tabs to render: ${JSON.stringify(result)}`);
        }
        if (result.scraperProviderTitle !== 'MangaDex') {
            throw new Error(`Expected scraper provider title to reflect selected source: ${JSON.stringify(result)}`);
        }
        if (String(result.providerFilteredResultCount).trim() !== '1') {
            throw new Error(`Expected provider-filtered result count of 1 for MangaDex cache-only search: ${JSON.stringify(result)}`);
        }
        if (!result.unidexVisible) {
            throw new Error(`Expected Unidex panel to render in scraper tab: ${JSON.stringify(result)}`);
        }
        if (result.unidexProviderRows < 2) {
            throw new Error(`Expected Unidex Naruto card to list per-provider API rows: ${JSON.stringify(result)}`);
        }
        if (!result.unidexLaneTitles.includes('Wikipedia') || !result.unidexLaneTitles.includes('Fandom') || !result.unidexLaneTitles.includes('API Cache')) {
            throw new Error(`Expected Unidex Naruto card to include Wikipedia, Fandom, and API lanes: ${JSON.stringify(result)}`);
        }
        if (!result.unidexHasProviderOpen) {
            throw new Error(`Expected Unidex provider row to include provider open action: ${JSON.stringify(result)}`);
        }

        const criticalConsoleErrors = consoleErrors.filter((entry) => {
            if (/Tracking Prevention blocked access to storage/i.test(entry)) return false;
            if (/Failed to load resource/i.test(entry)) return false;
            if (/Access to fetch at/i.test(entry)) return false;
            if (/QuotaExceededError/i.test(entry)) return false;
            if (/Critical module CacheManager is missing/i.test(entry)) return false;
            return true;
        });
        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`API_CARD_SETTINGS_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
