const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildPayload() {
    const links = [];
    const categoryOrder = [];
    for (let categoryIndex = 1; categoryIndex <= 14; categoryIndex += 1) {
        const category = `Late Interaction ${categoryIndex}`;
        categoryOrder.push(category);
        for (let linkIndex = 1; linkIndex <= 850; linkIndex += 1) {
            links.push({
                id: `late-interaction-${categoryIndex}-${linkIndex}`,
                title: `${category} Link ${linkIndex}`,
                url: `https://late-interaction-${categoryIndex}-${linkIndex}.example/${linkIndex}`,
                workspace: 'main',
                category,
                done: false,
                notes: linkIndex % 53 === 0 ? 'Synthetic late interaction note' : ''
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
    const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    const payload = buildPayload();

    await context.addInitScript((seed) => {
        localStorage.setItem('eveV22Data', JSON.stringify(seed.links));
        localStorage.setItem('eveV22Config', JSON.stringify(seed.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(seed.bookmarkFolders));
        window.__lateInteractionProbe = { longTasks: [] };
        try {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    window.__lateInteractionProbe.longTasks.push({
                        startTime: entry.startTime,
                        duration: entry.duration
                    });
                });
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) {
            window.__lateInteractionProbe.longTaskObserverError = String(error && error.message || error);
        }
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
            && document.querySelectorAll('.category-card').length >= 14
        ), undefined, { timeout: 180000 });

        await page.waitForTimeout(14500);

        const before = await page.evaluate(() => ({
            cards: document.querySelectorAll('.category-card').length,
            indexState: window.EveOS?.DatapackIndex?.getBuildState?.() || null,
            suppressedSummaryWarmup: window.__eveDashboardSummaryWarmupSuppressed || null,
            suppressedPrefetchWarmup: window.__eveDashboardPrefetchIndexWarmupSuppressed || null,
            longTasks: (window.__lateInteractionProbe?.longTasks || []).filter((entry) => entry.duration > 250),
            topAtAdd: (() => {
                const add = document.querySelector('.btn-add');
                if (!add) return null;
                const rect = add.getBoundingClientRect();
                const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                return el ? {
                    tag: el.tagName,
                    id: el.id,
                    cls: String(el.className || ''),
                    text: String(el.textContent || '').trim().slice(0, 80)
                } : null;
            })()
        }));

        const clickStart = Date.now();
        await page.locator('.btn-add').first().click({ timeout: 30000 });
        const clickMs = Date.now() - clickStart;
        await page.waitForTimeout(250);

        const after = await page.evaluate(() => ({
            addModalVisible: !!document.getElementById('addModal')
                && getComputedStyle(document.getElementById('addModal')).display !== 'none',
            indexState: window.EveOS?.DatapackIndex?.getBuildState?.() || null,
            longTasks: (window.__lateInteractionProbe?.longTasks || []).filter((entry) => entry.duration > 250)
        }));

        if (before.cards !== payload.config.categoryOrder.length) {
            throw new Error(`Expected card shells to remain visible, got ${JSON.stringify({ before, after, clickMs })}`);
        }
        if (before.indexState?.builtAt || before.indexState?.building) {
            throw new Error(`Expected no automatic large-pack index build before interaction, got ${JSON.stringify({ before, after, clickMs })}`);
        }
        if (!before.suppressedSummaryWarmup && !before.suppressedPrefetchWarmup) {
            throw new Error(`Expected large-pack index warmup to be suppressed, got ${JSON.stringify({ before, after, clickMs })}`);
        }
        if (!after.addModalVisible || clickMs > 1000) {
            throw new Error(`Expected late UI click to remain responsive, got ${JSON.stringify({ before, after, clickMs })}`);
        }
        if (after.longTasks.some((entry) => entry.duration > 1200)) {
            throw new Error(`Expected no excessive late startup long task, got ${JSON.stringify({ before, after, clickMs })}`);
        }

        console.log('DASHBOARD_LARGE_PACK_LATE_INTERACTION_BROWSER_SMOKE_OK', JSON.stringify({
            cards: before.cards,
            clickMs,
            topAtAdd: before.topAtAdd,
            suppressedSummaryWarmup: before.suppressedSummaryWarmup,
            suppressedPrefetchWarmup: before.suppressedPrefetchWarmup,
            longTasks: after.longTasks.length,
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
