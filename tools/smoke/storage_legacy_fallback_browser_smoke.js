const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => (
            !!window.IDBStore
            && !!window.EveCoreStorage
            && typeof window.EveCoreStorage.loadJson === 'function'
        ), undefined, { timeout: 120000 });

        await page.evaluate(async () => {
            await window.IDBStore.set('core_eveV22Data', []);
            await window.IDBStore.set('core_eveV22Config', {});
            localStorage.setItem('eveV22Data', JSON.stringify([
                {
                    id: 'legacy-1',
                    title: 'Legacy Visible One',
                    url: 'https://legacy.example/one',
                    workspace: 'main',
                    category: 'Legacy Card',
                    done: false
                },
                {
                    id: 'legacy-2',
                    title: 'Legacy Visible Two',
                    url: 'https://legacy.example/two',
                    workspace: 'main',
                    category: 'Legacy Card',
                    done: false
                }
            ]));
            localStorage.setItem('eveV22Config', JSON.stringify({
                activeWorkspace: 'main',
                viewMode: 'grid',
                workspaces: [{ id: 'main', name: 'Main', icon: 'M', subTabs: [] }],
                categoryOrder: ['Legacy Card'],
                collapsed: [],
                collapsedTabs: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                hideStats: []
            }));
        });

        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => (
            Array.isArray(window.eveState?.links)
            && window.eveState.links.some((link) => link?.title === 'Legacy Visible One')
        ), undefined, { timeout: 120000 });
        await page.waitForFunction(() => document.querySelectorAll('[data-link-id]').length >= 2, undefined, {
            timeout: 120000
        });

        const result = await page.evaluate(async () => {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const snapshot = () => ({
                liveLinks: window.eveState.links.length,
                renderedLinks: document.querySelectorAll('[data-link-id]').length,
                cardNames: Array.from(document.querySelectorAll('.category-card'))
                    .map((card) => card.getAttribute('data-card-category') || '')
                    .filter(Boolean)
            });
            const snapshots = [snapshot()];
            await sleep(700);
            snapshots.push(snapshot());
            await sleep(1600);
            snapshots.push(snapshot());
            return {
                ...snapshots[snapshots.length - 1],
                snapshots
            };
        });

        if (result.snapshots.some((snapshot) => snapshot.liveLinks < 2)) {
            throw new Error(`Expected legacy links to load, got ${JSON.stringify(result)}`);
        }
        if (result.snapshots.some((snapshot) => snapshot.renderedLinks < 2)) {
            throw new Error(`Expected legacy links to render, got ${JSON.stringify(result)}`);
        }
        if (result.snapshots.some((snapshot) => !snapshot.cardNames.includes('Legacy Card'))) {
            throw new Error(`Expected legacy card to render, got ${JSON.stringify(result)}`);
        }

        console.log('STORAGE_LEGACY_FALLBACK_BROWSER_SMOKE_OK', JSON.stringify(result));
    } finally {
        await context.close();
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
