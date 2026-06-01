const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildPayload() {
    const links = [];
    const categoryOrder = [];
    for (let categoryIndex = 1; categoryIndex <= 10; categoryIndex += 1) {
        const category = `Delayed Unload Guard ${categoryIndex}`;
        categoryOrder.push(category);
        for (let linkIndex = 1; linkIndex <= 420; linkIndex += 1) {
            links.push({
                id: `delayed-unload-${categoryIndex}-${linkIndex}`,
                title: `${category} Link ${linkIndex}`,
                url: `https://delayed-unload-${categoryIndex}-${linkIndex}.example/item/${linkIndex}`,
                workspace: 'main',
                category,
                done: false,
                identifiers: linkIndex % 11 === 0 ? ['reading'] : [],
                notes: linkIndex % 37 === 0 ? 'Synthetic note' : ''
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
            hideStats: [],
            scrollableCategories: false
        }
    };
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const payload = buildPayload();

    await context.addInitScript((seed) => {
        localStorage.setItem('eveV22Data', JSON.stringify(seed.links));
        localStorage.setItem('eveV22Config', JSON.stringify(seed.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(seed.bookmarkFolders));

        window.__delayedUnloadRenderEvents = [];
        window.__delayedUnloadGridEvents = [];
        const start = Date.now();

        const renderWrapTimer = setInterval(() => {
            if (typeof window.renderDashboard !== 'function' || window.renderDashboard.__delayedUnloadWrapped) return;
            const originalRenderDashboard = window.renderDashboard;
            window.renderDashboard = function wrappedRenderDashboard() {
                const stack = (new Error()).stack || '';
                window.__delayedUnloadRenderEvents.push({
                    t: Date.now() - start,
                    hint: window.__eveDashboardRenderHint || null,
                    cards: document.querySelectorAll('.category-card').length,
                    gen: window._eveDashRenderGen || 0,
                    stack: stack.split('\n').slice(1, 5).map((line) => line.trim())
                });
                return originalRenderDashboard.apply(this, arguments);
            };
            window.renderDashboard.__delayedUnloadWrapped = true;
            clearInterval(renderWrapTimer);
        }, 5);

        const gridWrapTimer = setInterval(() => {
            const grid = document.getElementById('dashboard-grid');
            if (!grid || grid.__delayedUnloadObserved) return;
            grid.__delayedUnloadObserved = true;
            const observer = new MutationObserver(() => {
                window.__delayedUnloadGridEvents.push({
                    t: Date.now() - start,
                    cards: document.querySelectorAll('.category-card').length,
                    links: document.querySelectorAll('[data-link-id]').length,
                    deferred: document.querySelectorAll('.category-card[data-card-deferred="1"]').length,
                    gen: window._eveDashRenderGen || 0
                });
            });
            observer.observe(grid, { childList: true, subtree: false });
            clearInterval(gridWrapTimer);
        }, 5);
    }, payload);

    const page = await context.newPage();
    const warnings = [];
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) warnings.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => (
            window.__eveCoreDataLoaded === true
            && document.querySelectorAll('.category-card').length > 0
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => {
            if (typeof window.queueDashboardCategorySummaryWarmup === 'function') {
                window.queueDashboardCategorySummaryWarmup();
            }
        });

        await page.waitForTimeout(9000);

        const result = await page.evaluate(() => {
            const gridEvents = window.__delayedUnloadGridEvents || [];
            const firstPaintIndex = gridEvents.findIndex((event) => Number(event.cards || 0) > 0);
            const blankAfterPaint = firstPaintIndex >= 0
                ? gridEvents.slice(firstPaintIndex + 1).filter((event) => Number(event.cards || 0) === 0)
                : [];
            return {
                cards: document.querySelectorAll('.category-card').length,
                links: document.querySelectorAll('[data-link-id]').length,
                shells: document.querySelectorAll('.category-card[data-card-deferred="1"]').length,
                gen: window._eveDashRenderGen || 0,
                skippedWarmup: window.__eveDashboardSummaryWarmupSkippedRefresh || null,
                renderEvents: window.__delayedUnloadRenderEvents || [],
                blankAfterPaint,
                gridEvents: gridEvents.slice(-40),
                liveLinks: window.eveState?.links?.length || 0
            };
        });

        if (result.cards !== payload.config.categoryOrder.length) {
            throw new Error(`Expected all card shells to remain visible, got ${JSON.stringify(result)}`);
        }
        if (result.blankAfterPaint.length > 0) {
            throw new Error(`Dashboard grid went blank after first paint: ${JSON.stringify(result)}`);
        }
        if (!result.skippedWarmup) {
            throw new Error(`Expected summary warmup refresh to be skipped over painted dashboard: ${JSON.stringify(result)}`);
        }

        console.log('DASHBOARD_DELAYED_UNLOAD_GUARD_BROWSER_SMOKE_OK', JSON.stringify({
            cards: result.cards,
            shells: result.shells,
            gen: result.gen,
            skippedWarmup: result.skippedWarmup,
            renderEvents: result.renderEvents.length,
            warnings: warnings.slice(-5)
        }));
    } finally {
        await context.close();
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
