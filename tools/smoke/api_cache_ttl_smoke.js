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
    window: {
        currentCategoryCtx: '',
        document: {},
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
        EveOS: { API: {} }
    }
};

context.window.window = context.window;
context.StorageManager = context.window.StorageManager;
const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const fullPath = path.join(repoRoot, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext, { filename: relPath });
}

[
    'js/modules/features/api-search/api-cache.shared.js',
    'js/modules/features/api-search/api-cache.storage.js',
    'js/modules/features/api-search/api-cache.query.js',
    'js/modules/features/api-search/api-cache.js'
].forEach(loadScript);

(async () => {
    const cache = context.window.EveOS.API.Cache;
    await cache.savePrefs({ ttlMs: 25 }, 'TTL Card');
    await cache.storeQuery('ttl-check', { mangadex: { data: [{ id: 'one' }] } }, 'TTL Card');

    const freshEntry = await cache.getQuery('ttl-check', 'TTL Card');
    assert(!!freshEntry, 'TTL entry should exist immediately after storing');
    assert(freshEntry.expiresAt > Date.now(), 'TTL entry should have a future expiry');

    await new Promise((resolve) => setTimeout(resolve, 60));

    const expiredEntry = await cache.getQuery('ttl-check', 'TTL Card');
    assert(expiredEntry === null, 'TTL entry should expire after the configured TTL');
    assert((await cache.listQueries('TTL Card')).length === 0, 'Expired TTL entry should be pruned from the cache pool');

    console.log('API_CACHE_TTL_SMOKE_OK');
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
