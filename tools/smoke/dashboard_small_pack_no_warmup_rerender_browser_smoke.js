const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildPayload() {
    const categories = ['Small Alpha', 'Small Beta', 'Small Gamma'];
    const links = [];
    categories.forEach((category, categoryIndex) => {
        for (let index = 1; index <= 6; index += 1) {
            links.push({
                id: `small-pack-${categoryIndex}-${index}`,
                title: `${category} Link ${index}`,
                url: `https://small-pack-${categoryIndex}.example/item/${index}`,
                workspace: 'main',
                category
            });
        }
    });
    return {
        links,
        bookmarkFolders: {},
        config: {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [{ id: 'main', name: 'Main', icon: 'M', subTabs: [] }],
            categoryOrder: categories,
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const payload = buildPayload();

    await context.addInitScript((seed) => {
        localStorage.setItem('eveV22Data', JSON.stringify(seed.links));
        localStorage.setItem('eveV22Config', JSON.stringify(seed.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(seed.bookmarkFolders));

        window.__smallPackWarmupProbe = { renderEvents: [], gridEvents: [] };
        const start = Date.now();

        const renderWrapTimer = setInterval(() => {
            if (typeof window.renderDashboard !== 'function' || window.renderDashboard.__smallPackWrapped) return;
            const originalRenderDashboard = window.renderDashboard;
            window.renderDashboard = function wrappedRenderDashboard() {
                window.__smallPackWarmupProbe.renderEvents.push({
                    t: Date.now() - start,
                    hint: window.__eveDashboardRenderHint || null,
                    gen: window._eveDashRenderGen || 0,
                    cards: document.querySelectorAll('.category-card').length
                });
                return originalRenderDashboard.apply(this, arguments);
            };
            window.renderDashboard.__smallPackWrapped = true;
            clearInterval(renderWrapTimer);
        }, 5);

        const gridWrapTimer = setInterval(() => {
            const grid = document.getElementById('dashboard-grid');
            if (!grid || grid.__smallPackObserved) return;
            grid.__smallPackObserved = true;
            new MutationObserver(() => {
                window.__smallPackWarmupProbe.gridEvents.push({
                    t: Date.now() - start,
                    cards: document.querySelectorAll('.category-card').length,
                    gen: window._eveDashRenderGen || 0
                });
            }).observe(grid, { childList: true, subtree: false });
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
            && document.querySelectorAll('.category-card').length === 3
        ), undefined, { timeout: 120000 });

        const before = await page.evaluate(() => ({
            gen: window._eveDashRenderGen || 0,
            renderEvents: (window.__smallPackWarmupProbe?.renderEvents || []).length
        }));

        await page.waitForTimeout(11800);

        const result = await page.evaluate((beforeState) => {
            const probe = window.__smallPackWarmupProbe || {};
            const gridEvents = Array.isArray(probe.gridEvents) ? probe.gridEvents : [];
            const firstPaintIndex = gridEvents.findIndex((event) => Number(event.cards || 0) > 0);
            const blankAfterPaint = firstPaintIndex >= 0
                ? gridEvents.slice(firstPaintIndex + 1).filter((event) => Number(event.cards || 0) === 0)
                : [];
            return {
                cards: document.querySelectorAll('.category-card').length,
                genBefore: beforeState.gen,
                genAfter: window._eveDashRenderGen || 0,
                newRenderEvents: (probe.renderEvents || []).slice(beforeState.renderEvents),
                blankAfterPaint,
                categorySummarySkipped: window.__eveDashboardSummaryWarmupSkippedRefresh || null,
                cardSummarySkipped: window.__eveDashboardCardSummaryWarmupSkippedRefresh || null
            };
        }, before);

        if (result.cards !== 3) {
            throw new Error(`Expected small-pack cards to remain visible: ${JSON.stringify(result)}`);
        }
        if (result.blankAfterPaint.length > 0) {
            throw new Error(`Small-pack grid blanked after first paint: ${JSON.stringify(result)}`);
        }
        if (result.genAfter !== result.genBefore) {
            throw new Error(`Warmup caused a second dashboard generation: ${JSON.stringify(result)}`);
        }
        if (result.newRenderEvents.length > 0) {
            throw new Error(`Warmup called renderDashboard after first paint: ${JSON.stringify(result)}`);
        }
        if (!result.categorySummarySkipped && !result.cardSummarySkipped) {
            throw new Error(`Expected at least one warmup refresh skip marker: ${JSON.stringify(result)}`);
        }

        console.log('DASHBOARD_SMALL_PACK_NO_WARMUP_RERENDER_BROWSER_SMOKE_OK ' + JSON.stringify({
            cards: result.cards,
            gen: result.genAfter,
            categorySummarySkipped: result.categorySummarySkipped,
            cardSummarySkipped: result.cardSummarySkipped,
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
