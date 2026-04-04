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
const resultsContainer = {
    style: { display: 'none' },
    innerHTML: '',
    dataset: {}
};

const context = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
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
        currentCategoryCtx: 'Alpha',
        setTimeout,
        clearTimeout,
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
                        container.innerHTML = JSON.stringify(sourceResults);
                    }
                },
                Core: {},
                MangaDex: {
                    async searchMangaDex(query) {
                        await new Promise((resolve) => setTimeout(resolve, query === 'naruto' ? 120 : 20));
                        return { data: [{ id: `md-${query}`, title: query === 'naruto' ? 'Naruto' : 'Bleach' }] };
                    }
                },
                Jikan: {
                    async searchJikanManga() { return { data: [] }; },
                    async searchJikanAnime() { return { data: [] }; }
                },
                AniList: {
                    async searchAniListManga() { return { data: { Page: { media: [] } } }; },
                    async searchAniListAnime() { return { data: { Page: { media: [] } } }; }
                },
                MangaUpdates: {
                    async searchMangaUpdates() { return { results: [] }; }
                },
                Kitsu: {
                    async searchKitsuAnime() { return { data: [] }; },
                    async searchKitsuManga() { return { data: [] }; }
                },
                TVmaze: {
                    async searchTVmaze() { return []; }
                },
                iTunes: {
                    async searchiTunes() { return { results: [] }; }
                },
                WlnUpdates: {
                    async searchWlnUpdates() { return { data: [] }; }
                },
                OpenLibrary: {
                    async searchOpenLibrary(query) {
                        await new Promise((resolve) => setTimeout(resolve, query === 'bleach' ? 40 : 10));
                        return { docs: [{ key: `/works/${query}`, title: query === 'bleach' ? 'Bleach Archive' : 'Naruto Archive' }] };
                    }
                },
                ComicK: {
                    async searchComicK() { return []; }
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
    const code = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    vm.runInContext(code, vmContext, { filename: relPath });
}

loadScript('js/modules/features/api-search/api-cache.js');
loadScript('js/modules/features/api-search/index.js');

(async () => {
    const api = context.window.EveOS.API;
    context.window.StorageManager.setCategoryContext('Alpha');

    const firstSearchPromise = api.Manager.runSearch('naruto', resultsContainer, null, {
        categoryName: 'Alpha',
        providerKey: 'mangadex',
        liveResults: true,
        hybridResults: true
    });

    await new Promise((resolve) => setTimeout(resolve, 15));

    const secondSearchPromise = api.Manager.runSearch('bleach', resultsContainer, null, {
        categoryName: 'Alpha',
        providerKey: 'openlibrary',
        liveResults: true,
        hybridResults: true
    });

    assert(!resultsContainer.innerHTML.includes('Naruto'), 'Stale Naruto results should clear as soon as the next provider search starts');

    const [firstResult, secondResult] = await Promise.all([firstSearchPromise, secondSearchPromise]);

    assert(firstResult === null, 'Older in-flight search should not overwrite a newer provider search');
    assert(resultsContainer.innerHTML.includes('Bleach Archive'), 'Final rendered results should come from the latest search');
    assert(!resultsContainer.innerHTML.includes('Naruto'), 'Older provider results must not overwrite the latest results');
    assert(secondResult?.meta?.fromCache === false, 'Latest search should report a live render');

    console.log('API_SEARCH_STALE_RESULTS_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
