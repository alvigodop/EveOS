const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForStorage(page) {
    await page.waitForFunction(() => (
        !!window.StorageManager
        && typeof window.StorageManager.saveData === 'function'
        && typeof window.StorageManager.deleteData === 'function'
        && typeof window.StorageManager.getCacheHygieneReport === 'function'
    ), undefined, { timeout: 120000 });
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await waitForStorage(page);

        const result = await page.evaluate(async () => {
            const context = `cache_hygiene_smoke_${Date.now()}`;
            const key = 'cacheHygieneSmoke';
            const prefixedKey = window.StorageManager._getPrefixedKey(key, context);
            const events = [];
            window.addEventListener('eve:cache-mutated', (event) => {
                if (event?.detail?.prefixedKey === prefixedKey) {
                    events.push(event.detail);
                }
            });

            localStorage.removeItem(prefixedKey);
            window.StorageManager.saveData(key, { version: 1, payload: 'old' }, context);
            window.StorageManager.saveData(key, { version: 2, payload: 'new' }, context);

            const matchingKeys = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const storageKey = localStorage.key(i);
                if (storageKey === prefixedKey) matchingKeys.push(storageKey);
            }

            const stored = JSON.parse(localStorage.getItem(prefixedKey) || '{}');
            const report = window.StorageManager.getCacheHygieneReport([key]);

            window.StorageManager.deleteData(key, context);
            const removed = localStorage.getItem(prefixedKey) === null;

            return {
                prefixedKey,
                matchingKeys,
                stored,
                removed,
                eventCount: events.length,
                eventActions: events.map((entry) => entry.action),
                reportKeys: report?.buckets?.[key] || []
            };
        });

        if (result.matchingKeys.length !== 1) {
            throw new Error(`Expected one cache key, got ${JSON.stringify(result)}`);
        }
        if (result.stored.version !== 2 || result.stored.payload !== 'new') {
            throw new Error(`Expected second cache write to replace old value, got ${JSON.stringify(result)}`);
        }
        if (!result.removed) {
            throw new Error(`Expected cache delete to remove scoped key, got ${JSON.stringify(result)}`);
        }
        if (result.eventCount < 3 || result.eventActions.join('|') !== 'write|write|delete') {
            throw new Error(`Expected cache mutation audit events, got ${JSON.stringify(result)}`);
        }

        console.log('CACHE_HYGIENE_NO_DUMP_SMOKE_OK');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
