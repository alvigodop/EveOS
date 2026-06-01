const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildPayload() {
    const links = [];
    const categoryOrder = [];
    for (let categoryIndex = 1; categoryIndex <= 12; categoryIndex += 1) {
        const category = `Startup Scroll ${categoryIndex}`;
        categoryOrder.push(category);
        for (let linkIndex = 1; linkIndex <= 620; linkIndex += 1) {
            links.push({
                id: `startup-scroll-${categoryIndex}-${linkIndex}`,
                title: `${category} Link ${linkIndex}`,
                url: `https://startup-scroll-${categoryIndex}-${linkIndex}.example/${linkIndex}`,
                workspace: 'main',
                category,
                done: false,
                notes: linkIndex % 41 === 0 ? 'Synthetic startup scroll note' : ''
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

        window.__startupScrollProbe = {
            ticks: [],
            longTasks: [],
            indexStates: []
        };

        try {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    window.__startupScrollProbe.longTasks.push({
                        startTime: entry.startTime,
                        duration: entry.duration
                    });
                });
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) {
            window.__startupScrollProbe.longTaskObserverError = String(error && error.message || error);
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
        await page.waitForFunction(() => {
            if (window.__eveCoreDataLoaded !== true) return false;
            if (document.querySelectorAll('.category-card').length <= 0) return false;
            const host = typeof window.getDashboardPrimaryScrollHost === 'function'
                ? window.getDashboardPrimaryScrollHost()
                : (document.scrollingElement || document.documentElement);
            return !!host && host.scrollHeight > host.clientHeight + 600;
        }, undefined, { timeout: 180000 });

        await page.evaluate(() => {
            // Force both callers to request index warmup during the startup paint
            // window. They should schedule later, not block scrolling now.
            if (typeof window.queueDashboardCategorySummaryWarmup === 'function') {
                window.queueDashboardCategorySummaryWarmup({ source: 'startup-scroll-smoke' });
            }
            if (window.EveDashboardPrefetch?.schedulePrefetch) {
                window.EveDashboardPrefetch.schedulePrefetch();
            }

            let tick = 0;
            const startedAt = performance.now();
            const timer = setInterval(() => {
                tick += 1;
                const host = typeof window.getDashboardPrimaryScrollHost === 'function'
                    ? window.getDashboardPrimaryScrollHost()
                    : (document.scrollingElement || document.documentElement);
                const maxScroll = Math.max(0, Number(host?.scrollHeight || 0) - Number(host?.clientHeight || window.innerHeight || 0));
                const target = Math.min(maxScroll, 120 + (tick * 180));
                if (typeof window.setDashboardScrollTop === 'function') {
                    window.setDashboardScrollTop(target);
                } else {
                    window.scrollTo(0, target);
                }
                const indexState = window.EveOS?.DatapackIndex?.getBuildState?.() || null;
                window.__startupScrollProbe.ticks.push({
                    t: performance.now() - startedAt,
                    y: typeof window.getDashboardScrollTop === 'function'
                        ? window.getDashboardScrollTop()
                        : (window.scrollY || document.documentElement.scrollTop || 0)
                });
                window.__startupScrollProbe.indexStates.push({
                    t: performance.now() - startedAt,
                    building: !!indexState?.building,
                    dirty: !!indexState?.dirty,
                    reason: String(indexState?.lastReason || '')
                });
                if (tick >= 36) clearInterval(timer);
            }, 180);
        });

        await page.waitForTimeout(7600);

        const result = await page.evaluate(() => {
            const probe = window.__startupScrollProbe || {};
            const ticks = Array.isArray(probe.ticks) ? probe.ticks : [];
            const host = typeof window.getDashboardPrimaryScrollHost === 'function'
                ? window.getDashboardPrimaryScrollHost()
                : (document.scrollingElement || document.documentElement);
            const gaps = [];
            for (let i = 1; i < ticks.length; i += 1) {
                gaps.push(ticks[i].t - ticks[i - 1].t);
            }
            return {
                cards: document.querySelectorAll('.category-card').length,
                ticks,
                maxTickGap: gaps.length ? Math.max(...gaps) : 0,
                finalY: typeof window.getDashboardScrollTop === 'function'
                    ? window.getDashboardScrollTop()
                    : (window.scrollY || document.documentElement.scrollTop || 0),
                scrollHeight: host?.scrollHeight || document.documentElement.scrollHeight,
                clientHeight: host?.clientHeight || window.innerHeight,
                longTasks: (probe.longTasks || []).filter((entry) => entry.duration > 250),
                indexStartedDuringProbe: (probe.indexStates || []).some((state) => state.building),
                delayedSummaryWarmup: window.__eveDashboardSummaryWarmupDelayed || null,
                delayedPrefetchWarmup: window.__eveDashboardPrefetchIndexWarmupDelayed || null,
                suppressedSummaryWarmup: window.__eveDashboardSummaryWarmupSuppressed || null,
                suppressedPrefetchWarmup: window.__eveDashboardPrefetchIndexWarmupSuppressed || null
            };
        });

        if (result.cards !== payload.config.categoryOrder.length) {
            throw new Error(`Expected all card shells to stay visible, got ${JSON.stringify(result)}`);
        }
        if (result.ticks.length < 24 || result.finalY < 900) {
            throw new Error(`Expected scroll probe to advance the page, got ${JSON.stringify(result)}`);
        }
        if (result.maxTickGap > 1400) {
            throw new Error(`Startup scroll probe was blocked too long, got ${JSON.stringify(result)}`);
        }
        if (result.indexStartedDuringProbe) {
            throw new Error(`Datapack index started during startup scroll window, got ${JSON.stringify(result)}`);
        }
        if (!result.delayedSummaryWarmup && !result.delayedPrefetchWarmup && !result.suppressedSummaryWarmup && !result.suppressedPrefetchWarmup) {
            throw new Error(`Expected startup index warmup to be delayed or suppressed, got ${JSON.stringify(result)}`);
        }
        if (result.longTasks.some((entry) => entry.duration > 1200)) {
            throw new Error(`Startup produced an excessive long task, got ${JSON.stringify(result)}`);
        }

        console.log('DASHBOARD_STARTUP_SCROLL_INDEX_IDLE_BROWSER_SMOKE_OK', JSON.stringify({
            cards: result.cards,
            ticks: result.ticks.length,
            finalY: result.finalY,
            maxTickGap: Math.round(result.maxTickGap),
            longTasks: result.longTasks.length,
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
