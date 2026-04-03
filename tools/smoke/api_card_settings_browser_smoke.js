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
                ['MangaDex', 'searchMangaDex', () => ({ data: [{ id: 'md-1', title: 'Kingdom' }] })],
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
                ['OpenLibrary', 'searchOpenLibrary', () => ({ docs: [] })],
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

            window.openCategorySettings('Alpha', 'search');
            await new Promise((resolve) => setTimeout(resolve, 500));

            const modal = document.getElementById('categorySettingsModal');
            const searchInput = modal.querySelector('.api-search-input');
            const searchButton = modal.querySelector('.api-search-btn');
            const searchHybridToggle = modal.querySelector('[data-api-hybrid-toggle="search"]');
            const searchLiveToggle = modal.querySelector('[data-api-live-toggle="search"]');
            const searchCachePool = modal.querySelector('.api-cache-pool-list');
            const searchResults = document.getElementById('modal-api-results-container');

            if (!searchInput || !searchButton || !searchHybridToggle || !searchLiveToggle || !searchCachePool || !searchResults) {
                throw new Error('Search tab API UI failed to render');
            }

            searchHybridToggle.checked = true;
            searchHybridToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchLiveToggle.checked = false;
            searchLiveToggle.dispatchEvent(new Event('change', { bubbles: true }));

            searchInput.value = 'kingdom';
            searchButton.click();

            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const hasEntry = searchCachePool.querySelectorAll('.api-cache-entry').length > 0;
                    const hasRenderedResults = String(searchResults.innerHTML || '').trim().length > 0;
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
            const alphaPrefsAfterSearch = window.EveOS.API.Cache.loadPrefs('Alpha');

            searchHybridToggle.checked = false;
            searchHybridToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchLiveToggle.checked = false;
            searchLiveToggle.dispatchEvent(new Event('change', { bubbles: true }));
            searchButton.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const providerCallsAfterCacheOnlyHit = window.__apiSmokeProviderCalls;

            window.switchCategoryTab('scraper');
            await new Promise((resolve) => setTimeout(resolve, 800));

            const sourceApiBtn = modal.querySelector('.source-toggle-btn[data-source="api"]');
            if (!sourceApiBtn) {
                throw new Error('Scraper tab missing API source toggle');
            }
            sourceApiBtn.click();

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
            const scraperCacheEntries = modal.querySelectorAll('#api-scraper-panel-container .api-cache-entry').length;
            const apiManagementDisplay = window.getComputedStyle(document.getElementById('apiManagement')).display;

            const scraperSearchInput = modal.querySelector('#searchInput');
            if (!scraperSearchInput) {
                throw new Error('Scraper search input missing');
            }
            scraperSearchInput.value = 'kingdom';

            const providerCallsBeforeScraperSearch = window.__apiSmokeProviderCalls;
            await window.SearchCoordinatorFlow.performContentSearch('kingdom', 'api', {
                layout: 'grid',
                liveSearch: false,
                hybridSearch: false
            }, false);
            await new Promise((resolve) => setTimeout(resolve, 300));
            const providerCallsAfterScraperSearch = window.__apiSmokeProviderCalls;
            const alphaPrefsFinal = window.EveOS.API.Cache.loadPrefs('Alpha');

            return {
                providerCallsAfterHybridMiss,
                providerCallsAfterCacheOnlyHit,
                providerCallsBeforeScraperSearch,
                providerCallsAfterScraperSearch,
                alphaCacheSummary: alphaCacheEntry?.summary || null,
                betaCacheVisible: !!betaCacheEntry,
                alphaPrefsAfterSearch,
                alphaPrefsFinal,
                searchResultCount: document.getElementById('resultCount')?.textContent || '',
                searchResultsVisible: window.getComputedStyle(searchResults).display,
                scraperApiPanelVisible: apiManagementDisplay,
                scraperHybridChecked: !!scraperHybridToggle?.checked,
                scraperLiveChecked: !!scraperLiveToggle?.checked,
                scraperCacheEntries
            };
        });

        if (result.providerCallsAfterHybridMiss !== 13) {
            throw new Error(`Expected 13 provider calls on hybrid cache miss, saw ${result.providerCallsAfterHybridMiss}`);
        }
        if (result.providerCallsAfterCacheOnlyHit !== result.providerCallsAfterHybridMiss) {
            throw new Error(`Cache-only search should not fetch live providers again: ${JSON.stringify(result)}`);
        }
        if (result.providerCallsAfterScraperSearch !== result.providerCallsBeforeScraperSearch) {
            throw new Error(`Scraper API cache-only path should not fetch live providers: ${JSON.stringify(result)}`);
        }
        if (!result.alphaCacheSummary || result.alphaCacheSummary.totalResults !== 1) {
            throw new Error(`Expected Alpha cache summary to store one result: ${JSON.stringify(result.alphaCacheSummary)}`);
        }
        if (result.betaCacheVisible) {
            throw new Error('Beta card should not see Alpha cache entries');
        }
        if (result.alphaPrefsAfterSearch.liveResults !== false || result.alphaPrefsAfterSearch.hybridResults !== true) {
            throw new Error(`Alpha prefs not persisted as expected: ${JSON.stringify(result.alphaPrefsAfterSearch)}`);
        }
        if (result.alphaPrefsFinal.liveResults !== false || result.alphaPrefsFinal.hybridResults !== false) {
            throw new Error(`Final Alpha prefs should reflect cache-only retest: ${JSON.stringify(result.alphaPrefsFinal)}`);
        }
        if (String(result.searchResultCount).trim() !== '1') {
            throw new Error(`Expected result count to remain 1, saw ${result.searchResultCount}`);
        }
        if (result.searchResultsVisible === 'none') {
            throw new Error('Expected API search results container to be visible');
        }
        if (result.scraperApiPanelVisible === 'none') {
            throw new Error('Expected scraper API management panel to be visible');
        }
        if (result.scraperHybridChecked || result.scraperLiveChecked) {
            throw new Error(`Expected scraper API toggles to reflect cached Alpha prefs: ${JSON.stringify(result)}`);
        }
        if (result.scraperCacheEntries < 1) {
            throw new Error(`Expected scraper API panel to show cached entries: ${JSON.stringify(result)}`);
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
