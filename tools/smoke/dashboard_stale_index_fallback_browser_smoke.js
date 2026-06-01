const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildPayload() {
    const links = [];
    const categoryOrder = [];
    for (let categoryIndex = 1; categoryIndex <= 5; categoryIndex += 1) {
        const category = `Index Fallback Cat ${categoryIndex}`;
        categoryOrder.push(category);
        for (let linkIndex = 1; linkIndex <= 120; linkIndex += 1) {
            links.push({
                id: `index-fallback-${categoryIndex}-${linkIndex}`,
                title: `${category} Link ${linkIndex}`,
                url: `https://index-fallback-${categoryIndex}-${linkIndex}.example`,
                workspace: 'main',
                category,
                done: false
            });
        }
    }
    return {
        links,
        bookmarkFolders: {},
        config: {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [{ id: 'main', name: 'Main', icon: 'M', subTabs: [] }],
            categoryOrder,
            collapsed: [],
            collapsedTabs: [],
            foldersCollapsed: [],
            linksCollapsed: [],
            hideStats: []
        }
    };
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const payload = buildPayload();
    await context.addInitScript((seed) => {
        localStorage.setItem('eveV22Data', JSON.stringify(seed.links));
        localStorage.setItem('eveV22Config', JSON.stringify(seed.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(seed.bookmarkFolders));
    }, payload);

    const page = await context.newPage();
    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => (
            window.__eveCoreDataLoaded === true
            && document.querySelectorAll('.category-card').length > 0
        ), undefined, { timeout: 120000 });

        const result = await page.evaluate(async () => {
            const before = {
                cards: document.querySelectorAll('.category-card').length,
                links: document.querySelectorAll('[data-link-id]').length,
                live: window.eveState.links.length
            };
            window.collectIndexedDashboardVisibleLinks = function () { return []; };
            window.__eveDashboardRenderHint = { kind: 'stale-index-smoke' };
            window.renderDashboard();
            await new Promise((resolve) => setTimeout(resolve, 800));
            return {
                before,
                after: {
                    cards: document.querySelectorAll('.category-card').length,
                    links: document.querySelectorAll('[data-link-id]').length,
                    live: window.eveState.links.length
                }
            };
        });

        if (result.after.cards <= 0 || result.after.live !== result.before.live) {
            throw new Error(`Expected stale index fallback to preserve cards, got ${JSON.stringify(result)}`);
        }
        if (result.after.links <= 0) {
            throw new Error(`Expected stale index fallback to render live links, got ${JSON.stringify(result)}`);
        }

        console.log('DASHBOARD_STALE_INDEX_FALLBACK_BROWSER_SMOKE_OK', JSON.stringify(result));
    } finally {
        await context.close();
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
