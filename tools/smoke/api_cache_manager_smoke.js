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

const storageBuckets = {};
const resultsCounter = { textContent: '0' };
const resultsContainer = { style: { display: 'none' }, innerHTML: '' };
let displayCalls = 0;
let providerCalls = 0;

const context = {
    console,
    localStorage: {
        _store: {},
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null;
        },
        setItem(key, value) {
            this._store[key] = String(value);
        },
        removeItem(key) {
            delete this._store[key];
        }
    },
    document: {
        getElementById(id) {
            if (id === 'resultCount') return resultsCounter;
            return null;
        },
        querySelectorAll() {
            return [];
        }
    },
    window: {
        currentCategoryCtx: '',
        setTimeout,
        document: null,
        StorageManager: {
            categoryContext: null,
            setCategoryContext(categoryName) {
                this.categoryContext = categoryName;
            },
            loadData(key, defaultValue) {
                const ctx = this.categoryContext || '__global__';
                const bucket = storageBuckets[ctx] || {};
                return Object.prototype.hasOwnProperty.call(bucket, key) ? bucket[key] : defaultValue;
            },
            saveData(key, value) {
                const ctx = this.categoryContext || '__global__';
                storageBuckets[ctx] = storageBuckets[ctx] || {};
                storageBuckets[ctx][key] = value;
                return true;
            },
            deleteData(key) {
                const ctx = this.categoryContext || '__global__';
                if (storageBuckets[ctx]) {
                    delete storageBuckets[ctx][key];
                }
                return true;
            }
        },
        EveOS: {
            API: {
                Display: {
                    displayResults(sourceResults, container) {
                        displayCalls += 1;
                        container.innerHTML = JSON.stringify(sourceResults);
                    }
                },
                Core: {},
                MangaDex: {
                    async searchMangaDex() {
                        providerCalls += 1;
                        return { data: [{ id: 'md-1', title: 'Kingdom' }] };
                    }
                },
                Jikan: {
                    async searchJikanManga() {
                        providerCalls += 1;
                        return { data: [] };
                    },
                    async searchJikanAnime() {
                        providerCalls += 1;
                        return { data: [] };
                    }
                },
                AniList: {
                    async searchAniListManga() {
                        providerCalls += 1;
                        return { data: { Page: { media: [] } } };
                    },
                    async searchAniListAnime() {
                        providerCalls += 1;
                        return { data: { Page: { media: [] } } };
                    }
                },
                MangaUpdates: {
                    async searchMangaUpdates() {
                        providerCalls += 1;
                        return { results: [] };
                    }
                },
                Kitsu: {
                    async searchKitsuAnime() {
                        providerCalls += 1;
                        return { data: [] };
                    },
                    async searchKitsuManga() {
                        providerCalls += 1;
                        return { data: [] };
                    }
                },
                TVmaze: {
                    async searchTVmaze() {
                        providerCalls += 1;
                        return [];
                    }
                },
                iTunes: {
                    async searchiTunes() {
                        providerCalls += 1;
                        return { results: [] };
                    }
                },
                WlnUpdates: {
                    async searchWlnUpdates() {
                        providerCalls += 1;
                        return { data: [] };
                    }
                },
                OpenLibrary: {
                    async searchOpenLibrary() {
                        providerCalls += 1;
                        return { docs: [{ key: '/works/OL1W', title: 'Kingdom Atlas' }] };
                    }
                },
                ComicK: {
                    async searchComicK() {
                        providerCalls += 1;
                        return [];
                    }
                }
            }
        }
    }
};

context.window.window = context.window;
context.window.document = context.document;
context.StorageManager = context.window.StorageManager;
const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const fullPath = path.join(repoRoot, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext, { filename: relPath });
}

loadScript('js/modules/features/api-search/api-cache.js');
loadScript('js/modules/features/api-search/index.js');

(async () => {
    const api = context.window.EveOS.API;

    const defaultPrefs = api.Cache.loadPrefs('Card Alpha');
    assert(defaultPrefs.liveResults === false, 'Live should default to false');
    assert(defaultPrefs.hybridResults === true, 'Hybrid should default to true');

    api.Cache.storeQuery('kingdom', { mangadex: { data: [{ id: 1 }] } }, 'Card Alpha');
    assert(api.Cache.getQuery('kingdom', 'Card Alpha'), 'Card Alpha should keep its own cache');
    assert(!api.Cache.getQuery('kingdom', 'Card Beta'), 'Card Beta must not see Card Alpha cache');

    providerCalls = 0;
    displayCalls = 0;
    resultsContainer.innerHTML = '';
    const cacheOnlyMiss = await api.Manager.runSearch('new query', resultsContainer, null, {
        categoryName: 'Card Beta',
        liveResults: false,
        hybridResults: false
    });
    assert(providerCalls === 0, 'Cache-only miss must not trigger live providers');
    assert(cacheOnlyMiss?.meta?.cacheMiss === true, 'Cache-only miss should return cacheMiss metadata');
    assert(resultsContainer.innerHTML.includes('No cached API result for this card'), 'Cache-only miss should render a scoped cache message');

    providerCalls = 0;
    displayCalls = 0;
    resultsContainer.innerHTML = '';
    const hybridFetch = await api.Manager.runSearch('kingdom', resultsContainer, null, {
        categoryName: 'Card Beta',
        liveResults: false,
        hybridResults: true
    });
    assert(providerCalls === 13, 'Hybrid miss should call all live providers once');
    assert(displayCalls === 1, 'Hybrid miss should render results once');
    assert(hybridFetch?.meta?.fromCache === false, 'Hybrid miss should report live fetch');
    assert(api.Cache.getQuery('kingdom', 'Card Beta'), 'Hybrid miss should store results in the card cache');
    assert(!api.Cache.getQuery('kingdom', 'Card Gamma'), 'Cached query must remain isolated to the card');
    assert(resultsCounter.textContent === '2', 'Result count should reflect cached summary totals');

    providerCalls = 0;
    displayCalls = 0;
    const cacheHit = await api.Manager.runSearch('kingdom', resultsContainer, null, {
        categoryName: 'Card Beta',
        liveResults: false,
        hybridResults: false
    });
    assert(providerCalls === 0, 'Cache hit should not trigger live providers');
    assert(displayCalls === 1, 'Cache hit should render once');
    assert(cacheHit?.meta?.fromCache === true, 'Cache hit should report cached data');

    displayCalls = 0;
    const providerCacheHit = await api.Manager.runSearch('kingdom', resultsContainer, null, {
        categoryName: 'Card Beta',
        providerKey: 'mangadex',
        liveResults: false,
        hybridResults: false
    });
    assert(displayCalls === 1, 'Provider cache hit should render once');
    assert(providerCacheHit?.meta?.summary?.totalResults === 1, 'Provider cache hit should only expose one provider result');

    api.Cache.savePrefs({ liveResults: true, hybridResults: false, ttlMs: 3600000 }, 'Card Beta');
    const savedPrefs = api.Cache.loadPrefs('Card Beta');
    assert(savedPrefs.liveResults === true, 'Saved live pref should persist per card');
    assert(savedPrefs.hybridResults === false, 'Saved hybrid pref should persist per card');
    assert(savedPrefs.ttlMs === 3600000, 'Saved TTL pref should persist per card');
    assert(api.Cache.loadPrefs('Card Alpha').hybridResults === true, 'Prefs must remain scoped per card');

    console.log('API_CACHE_MANAGER_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
