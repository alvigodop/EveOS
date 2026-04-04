const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

const genericCache = {};

const context = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    ModuleRegistry: {
        register() {}
    },
    window: {
        ModuleRegistry: null,
        CacheManager: {
            wikiDataStore: { searchResults: {} },
            wikiCacheStore: {},
            init() {
                return this;
            },
            async getGeneric(key) {
                return Object.prototype.hasOwnProperty.call(genericCache, key) ? genericCache[key] : null;
            },
            async updateGeneric(key, value) {
                genericCache[key] = value;
                return true;
            },
            async getWikipediaEntryData(title) {
                return this.wikiCacheStore.entryResults?.[title]?.main || null;
            },
            async updateWikipediaEntryData(title, data) {
                this.wikiCacheStore.entryResults = this.wikiCacheStore.entryResults || {};
                this.wikiCacheStore.entryResults[title] = this.wikiCacheStore.entryResults[title] || {};
                this.wikiCacheStore.entryResults[title].main = {
                    ...data,
                    lastFetch: Date.now(),
                    lastUpdate: new Date().toISOString()
                };
                return true;
            }
        },
        CacheCore: {
            saveWikiDataStore() {
                return true;
            },
            saveWikiCacheStore() {
                return true;
            }
        },
        WikiManager: {
            refreshCacheStores() {},
            renderWikiEntryList() {},
            renderFandomDomainList() {}
        },
        ModuleUtilities: {
            inferContentTypeFromTitle(title) {
                if (/naruto/i.test(title)) return 'Character';
                return 'Article';
            }
        },
        WikipediaAPI: {
            fetchCount: 0,
            async fetchLiveEntry(title) {
                this.fetchCount += 1;
                return {
                    title,
                    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
                    extract: 'Naruto is a ninja hero with chakra powers.',
                    categories: ['Characters', 'Shonen'],
                    thumbnail: 'https://example.com/naruto.png',
                    contentType: 'Character',
                    links: ['Naruto Uzumaki']
                };
            },
            async enrichResults(results) {
                results.forEach((result) => {
                    result.rating = 9.5;
                    result.genres = ['Action', 'Adventure'];
                    result.tags = ['Ninja', 'Shonen'];
                    result.names = [result.title, `${result.title} Alt`];
                });
                return results;
            }
        },
        SearchFandom: {
            searchCount: 0,
            detailsCount: 0,
            async fetchLiveFandomDomainSearch(domain, query) {
                this.searchCount += 1;
                return [{
                    title: 'Naruto',
                    snippet: `${query} fandom result`,
                    url: `https://${domain}/wiki/Naruto`
                }];
            },
            async fetchLiveFandomPageDetails() {
                this.detailsCount += 1;
                return {
                    extract: 'Naruto fandom page extract.',
                    categories: ['Characters', 'Anime'],
                    thumbnail: 'https://example.com/fandom-naruto.png',
                    contentType: 'Character',
                    rating: 8.7,
                    genres: ['Action'],
                    tags: ['Leaf Village']
                };
            }
        }
    }
};

context.window.window = context.window;
context.window.ModuleRegistry = context.ModuleRegistry;
context.CacheManager = context.window.CacheManager;
context.CacheCore = context.window.CacheCore;
context.WikiManager = context.window.WikiManager;
context.ModuleUtilities = context.window.ModuleUtilities;
context.WikipediaAPI = context.window.WikipediaAPI;
context.SearchFandom = context.window.SearchFandom;
const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const code = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    vm.runInContext(code, vmContext, { filename: relPath });
}

loadScript('js/modules/features/scraper/features/wikipedia-search/wikipedia-cache.js');
context.WikipediaCache = context.window.WikipediaCache;
loadScript('js/modules/features/scraper/features/wikipedia-search/wikipedia-processor.js');
context.WikipediaProcessor = context.window.WikipediaProcessor;
loadScript('js/modules/features/scraper/features/wikipedia-search/components/sw-orchestrator.js');
loadScript('js/modules/features/scraper/features/fandom-search-components/fsl-cache.js');
context.FSLCache = context.window.FSLCache;
loadScript('js/modules/features/scraper/features/fandom-search-components/fsl-live.js');
context.FSLLive = context.window.FSLLive;
loadScript('js/modules/features/scraper/features/fandom-search-components/fsl-core.js');
context.FSLCore = context.window.FSLCore;

(async () => {
    const entries = [{ title: 'Naruto', name: 'Naruto' }];
    const wikiOptions = {
        liveSearch: false,
        hidePersons: false,
        hideTextMatches: false,
        hideSourceArticles: false
    };

    const wikiFirst = await context.window.SWOrchestrator.searchManagedWikipedia(entries, 'naruto', wikiOptions, null);
    const wikiSecond = await context.window.SWOrchestrator.searchManagedWikipedia(entries, 'naruto', wikiOptions, null);

    assert(context.window.WikipediaAPI.fetchCount === 1, 'Wikipedia search should reuse cached query results on repeat searches');
    assert(Array.isArray(wikiSecond) && wikiSecond.length > 0, 'Wikipedia cached search should still return results');
    assert(wikiSecond.every((result) => result.fromCache === true), 'Wikipedia cached query results should be marked fromCache');

    const wikiStored = context.window.CacheManager.wikiCacheStore.entryResults?.Naruto?.searchResults || {};
    const wikiStoredKey = Object.keys(wikiStored)[0];
    assert(!!wikiStoredKey, 'Wikipedia search results should be stored under the scoped entry cache');
    assert(Array.isArray(wikiStored[wikiStoredKey].genres), 'Wikipedia cache should preserve genres');
    assert(Array.isArray(wikiStored[wikiStoredKey].tags), 'Wikipedia cache should preserve tags');
    assert(Array.isArray(wikiStored[wikiStoredKey].names), 'Wikipedia cache should preserve alternate names');
    assert(typeof wikiStored[wikiStoredKey].rating === 'number', 'Wikipedia cache should preserve rating-like metadata');

    const domains = [{ domain: 'naruto.fandom.com', name: 'Narutopedia' }];
    const fandomOptions = {
        liveSearch: false,
        hybridSearch: true
    };

    const fandomFirst = await context.window.FSLCore.searchManagedFandom(domains, 'naruto', fandomOptions, null);
    const fandomSecond = await context.window.FSLCore.searchManagedFandom(domains, 'naruto', fandomOptions, null);
    const fandomRelated = await context.window.FSLCore.searchManagedFandom(domains, 'leaf', fandomOptions, null);

    assert(context.window.SearchFandom.searchCount === 1, 'Fandom search should reuse aggregate cache on repeat searches');
    assert(context.window.SearchFandom.detailsCount === 1, 'Fandom detail enrichment should not rerun on aggregate cache hits');
    assert(Array.isArray(fandomSecond) && fandomSecond.length > 0, 'Fandom aggregate cache should return stored results');
    assert(fandomSecond.every((result) => result.fromCache === true), 'Fandom aggregate cache results should be marked fromCache');
    assert(Array.isArray(fandomRelated) && fandomRelated.length > 0, 'Fandom domain-store fallback cache should return related cached matches');
    assert(fandomRelated.every((result) => result.fromCache === true), 'Fandom related cache fallback should mark results fromCache');
    assert(context.window.SearchFandom.searchCount === 1, 'Fandom related-query cache fallback should avoid another live search');

    const fandomStored = context.window.CacheManager.wikiDataStore.searchResults?.['naruto.fandom.com']?.Naruto;
    assert(!!fandomStored, 'Fandom domain cache should store the enriched result');
    assert(fandomStored.domain === 'naruto.fandom.com', 'Fandom cache should preserve the source domain');
    assert(Array.isArray(fandomStored.categories), 'Fandom cache should preserve categories');
    assert(Array.isArray(fandomStored.genres), 'Fandom cache should preserve genres');
    assert(Array.isArray(fandomStored.tags), 'Fandom cache should preserve tags');
    assert(typeof fandomStored.rating === 'number', 'Fandom cache should preserve rating-like metadata');

    const fandomAggregate = genericCache['fandom_managed_search_naruto'];
    assert(Array.isArray(fandomAggregate?.results) && fandomAggregate.results.length === fandomFirst.length, 'Fandom aggregate query cache should persist the full result set');

    console.log('WIKI_FANDOM_CACHE_RICHNESS_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
