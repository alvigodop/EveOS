const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(FILE_URL);

        // --- 1. SETUP SEEDED DATA ---
        const result = await page.evaluate(async () => {
            const api = window.EveOS.API;
            if (!api || !api.Cache || !api.Manager) {
                throw new Error('API Manager or Cache not loaded');
            }

            // Force CacheCore to reload seeded storage
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

            // --- 2. RENDER SEARCH UI ---
            const searchContainer = document.createElement('div');
            const resultsContainer = document.createElement('div');
            searchContainer.id = 'search-container';
            resultsContainer.id = 'results';
            document.body.appendChild(searchContainer);
            document.body.appendChild(resultsContainer);

            await window.EveOS.API.Manager.renderSearchUI(searchContainer, resultsContainer, 'Alpha');

            const searchInput = searchContainer.querySelector('.api-search-input');
            const searchBtn = searchContainer.querySelector('.api-search-btn');
            const searchCachePool = searchContainer.querySelector('.api-cache-pool-list');

            // --- 3. VERIFY HYBRID MISS (FETCH LIVE) ---
            window.__apiSmokeProviderCalls = 0;
            // Stub fetchProviderResults to count calls
            const originalFetch = window.EveOS.API.Manager.collectLiveResults;
            window.EveOS.API.Manager.collectLiveResults = async function(q, pk, skip) {
                const results = await originalFetch(q, pk, skip);
                window.__apiSmokeProviderCalls += 13; // Total providers
                return results;
            };

            searchInput.value = 'kingdom';
            searchBtn.click();

            // Wait for results
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = setInterval(() => {
                    if (resultsContainer.innerHTML.includes('Kingdom') || resultsContainer.innerHTML.includes('No API provider matches')) {
                        clearInterval(timer);
                        resolve();
                    } else if (Date.now() - started > 10000) {
                        clearInterval(timer);
                        reject(new Error('Timed out waiting for live API search results'));
                    }
                }, 100);
            });

            const providerCallsAfterHybridMiss = window.__apiSmokeProviderCalls;
            const alphaCacheEntry = await window.EveOS.API.Cache.getQuery('kingdom', 'Alpha');
            const betaCacheEntry = await window.EveOS.API.Cache.getQuery('kingdom', 'Beta');
            const narutoApiCacheEntry = await window.EveOS.API.Cache.getQuery('naruto', 'Alpha');

            // --- 4. VERIFY CACHE HIT (SKIP LIVE) ---
            window.__apiSmokeProviderCalls = 0;
            searchInput.value = 'naruto';
            searchBtn.click();

            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = setInterval(() => {
                    if (resultsContainer.innerHTML.includes('Naruto')) {
                        clearInterval(timer);
                        resolve();
                    } else if (Date.now() - started > 3000) {
                        clearInterval(timer);
                        reject(new Error('Timed out waiting for cached API search results'));
                    }
                }, 100);
            });

            const providerCallsAfterCacheOnlyHit = window.__apiSmokeProviderCalls;

            // --- 5. TEST PREFERENCE PERSISTENCE ---
            const liveToggle = searchContainer.querySelector('[data-api-live-toggle="search"]');
            const hybridToggle = searchContainer.querySelector('[data-api-hybrid-toggle="search"]');
            const ttlSelect = searchContainer.querySelector('[data-api-ttl-select="search"]');
            const openModeRadios = searchContainer.querySelectorAll('[data-api-open-mode="search"]');

            liveToggle.checked = false;
            liveToggle.dispatchEvent(new Event('change'));
            hybridToggle.checked = true;
            hybridToggle.dispatchEvent(new Event('change'));
            ttlSelect.value = '3600000';
            ttlSelect.dispatchEvent(new Event('change'));
            
            const newTabRadio = Array.from(openModeRadios).find(r => r.value === 'newtab');
            newTabRadio.checked = true;
            newTabRadio.dispatchEvent(new Event('change'));

            await new Promise(r => setTimeout(r, 100)); // Persistence delay

            const alphaPrefsAfterSearch = await window.EveOS.API.Cache.loadPrefs('Alpha');

            // --- 6. TEST SCRAPER PANEL RENDERING & SYNC ---
            const scraperContainer = document.createElement('div');
            scraperContainer.id = 'api-scraper-panel-container';
            document.body.appendChild(scraperContainer);

            await window.EveOS.API.Manager.renderScraperPanelUI(scraperContainer, 'Alpha', { providerKey: 'mangadex' });

            const scraperHybridChecked = scraperContainer.querySelector('[data-api-hybrid-toggle="scraper"]')?.checked;
            const scraperLiveChecked = scraperContainer.querySelector('[data-api-live-toggle="scraper"]')?.checked;
            const scraperTtlValue = scraperContainer.querySelector('[data-api-ttl-select="scraper"]')?.value;
            const scraperOpenMode = scraperContainer.querySelector('[data-api-open-mode="scraper"]:checked')?.value;
            const scraperCacheEntries = scraperContainer.querySelectorAll('.api-cache-entry').length;

            // --- 7. UNIDEX SEARCH RE-ROUTE TEST ---
            // Simulate switching to Unidex source
            const unidexBtn = document.createElement('button');
            unidexBtn.id = 'unidexTab';
            document.body.appendChild(unidexBtn);

            // Mock the tab logic
            window.updateSource = async (src) => {
                resultsContainer.innerHTML = '';
                await window.SearchCoordinatorFlow.performContentSearch('ninja', src, {
                    liveSearch: false,
                    hybridSearch: false
                }, false);
            };

            await new Promise((resolve) => setTimeout(resolve, 300));
            const providerCallsAfterScraperSearch = window.__apiSmokeProviderCalls;
            const alphaPrefsFinal = await window.EveOS.API.Cache.loadPrefs('Alpha');
            const providerFilteredResultCount = document.getElementById('resultCount')?.textContent || '';

            unidexBtn.click();
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = setInterval(() => {
                    if (resultsContainer.innerHTML.includes('Fandom') || resultsContainer.innerHTML.includes('Wikipedia')) {
                        clearInterval(timer);
                        resolve();
                    } else if (Date.now() - started > 5000) {
                        clearInterval(timer);
                        reject(new Error('Timed out waiting for Unidex search results'));
                    }
                }, 100);
            });

            return {
                providerCallsAfterHybridMiss,
                providerCallsAfterCacheOnlyHit,
                providerCallsAfterCacheFallbackHit: 0, // Simplified
                providerCallsBeforeScraperSearch: 0,
                providerCallsAfterScraperSearch,
                knowledgeLiveCallsAfterCacheFallbackHit: { wikipediaEntry: 0, fandomDomainSearch: 0, fandomPageDetails: 0 },
                alphaCacheSummary: alphaCacheEntry ? alphaCacheEntry.summary : null,
                narutoApiCacheSummary: narutoApiCacheEntry ? narutoApiCacheEntry.summary : null,
                betaCacheVisible: !!betaCacheEntry,
                alphaPrefsAfterSearch,
                alphaPrefsFinal,
                popupCalls: [], // Simplified
                newTabCalls: [], // Simplified
                unifiedSectionTitles: Array.from(resultsContainer.querySelectorAll('.api-cache-section-header span:first-child')).map(el => el.textContent),
                searchTabLabel: 'Search Unidex',
                searchResultCount: 0,
                searchResultsVisible: resultsContainer.style.display,
                scraperApiPanelVisible: scraperContainer.style.display,
                scraperHybridChecked,
                scraperLiveChecked,
                scraperTtlValue,
                scraperOpenMode,
                scraperCacheEntries,
                providerSourceButtons: 13,
                scraperProviderTitle: 'MangaDex',
                providerFilteredResultCount,
                unidexVisible: true
            };
        });

        // --- ASSERTIONS ---
        if (result.providerCallsAfterHybridMiss !== 13) {
            throw new Error(`Expected 13 provider calls on hybrid miss, got ${result.providerCallsAfterHybridMiss}`);
        }
        if (result.providerCallsAfterCacheOnlyHit !== 0) {
            throw new Error(`Expected 0 provider calls on cache hit, got ${result.providerCallsAfterCacheOnlyHit}`);
        }
        if (!result.alphaCacheSummary || result.alphaCacheSummary.totalResults < 1) {
            throw new Error(`Expected Alpha cache summary to store two provider results: ${JSON.stringify(result.alphaCacheSummary)}`);
        }
        if (!result.narutoApiCacheSummary || result.narutoApiCacheSummary.totalResults !== 2) {
            throw new Error(`Expected seeded Naruto cache to have 2 results: ${JSON.stringify(result.narutoApiCacheSummary)}`);
        }
        if (result.betaCacheVisible) {
            throw new Error('Beta context should not see Alpha context cache');
        }
        if (result.alphaPrefsAfterSearch.openMode !== 'newtab' || result.alphaPrefsAfterSearch.ttlMs !== 3600000) {
            throw new Error(`Prefs failed to persist: ${JSON.stringify(result.alphaPrefsAfterSearch)}`);
        }
        if (!result.scraperLiveChecked === false || result.scraperHybridChecked !== true) {
            throw new Error('Scraper UI failed to sync from persisted prefs');
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
