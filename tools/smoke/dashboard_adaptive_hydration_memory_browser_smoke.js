const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildLinks() {
    const links = [];
    const categories = [];
    for (let categoryIndex = 1; categoryIndex <= 6; categoryIndex += 1) {
        const category = `Memory Cat ${categoryIndex}`;
        categories.push(category);
        for (let linkIndex = 1; linkIndex <= 900; linkIndex += 1) {
            links.push({
                id: `memory-${categoryIndex}-${linkIndex}`,
                title: `${category} Link ${linkIndex}`,
                url: `https://memory-${categoryIndex}.example/item/${linkIndex}`,
                workspace: 'main',
                category,
                done: false
            });
        }
    }
    return { links, categories };
}

function buildMemory(categories) {
    const now = Date.now();
    const recentWorkspaceVisits = Array.from({ length: 5 }, (_, index) => ({
        id: 'main',
        at: now - ((5 - index) * 60000),
        source: 'smoke'
    }));
    const key = `main::${categories[0].toLowerCase()}`;
    const recentCardInteractions = [
        { key, workspaceId: 'main', categoryName: categories[0], type: 'hydrate', at: now - 30000 },
        { key, workspaceId: 'main', categoryName: categories[0], type: 'focus', at: now - 12000 }
    ];
    return {
        schemaVersion: 1,
        enabled: true,
        mode: 'auto',
        workspaceVisitWindowLimit: 100,
        cardInteractionWindowLimit: 250,
        frequentWorkspaceVisits: 4,
        frequentCardInteractions: 2,
        minLargeDatapackLinks: 1500,
        autoHydrateCardLimit: 4,
        autoHydrateBookmarkBudget: 1200,
        maxAutoHydrateLinksPerCard: 500,
        workspaces: {
            main: { id: 'main', name: 'Main', score: 5, visits: 5, lastSeen: now - 12000 }
        },
        cards: {
            [key]: {
                key,
                workspaceId: 'main',
                categoryName: categories[0],
                score: 3,
                interactions: 2,
                lastSeen: now - 12000,
                lastLinkCount: 900
            }
        },
        recentWorkspaceVisits,
        recentCardInteractions
    };
}

function buildStaleScoreMemory(categories) {
    const now = Date.now();
    const hotWorkspaceVisits = Array.from({ length: 5 }, (_, index) => ({
        id: 'main',
        at: now - ((5 - index) * 45000),
        source: 'smoke'
    }));
    const staleKey = `main::${categories[0].toLowerCase()}`;
    return {
        ...buildMemory(categories),
        cards: {
            [staleKey]: {
                key: staleKey,
                workspaceId: 'main',
                categoryName: categories[0],
                score: 100,
                interactions: 99,
                lastSeen: now - 86400000,
                lastLinkCount: 900
            }
        },
        recentWorkspaceVisits: hotWorkspaceVisits,
        recentCardInteractions: []
    };
}

async function runCase(seedMemory) {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const payload = buildLinks();
    const config = {
        activeWorkspace: 'main',
        viewMode: 'grid',
        workspaces: [{ id: 'main', name: 'Main', icon: 'M', subTabs: [] }],
        categoryOrder: payload.categories,
        collapsed: [],
        collapsedTabs: [],
        foldersCollapsed: [],
        linksCollapsed: [],
        hideStats: [],
        scrollableCategories: false
    };
    if (seedMemory === 'stale') config.dashboardHydrationMemory = buildStaleScoreMemory(payload.categories);
    else if (seedMemory) config.dashboardHydrationMemory = buildMemory(payload.categories);

    await context.addInitScript((seed) => {
        localStorage.setItem('eveV22Data', JSON.stringify(seed.links));
        localStorage.setItem('eveV22Config', JSON.stringify(seed.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify({}));
    }, { links: payload.links, config });

    const page = await context.newPage();
    const warnings = [];
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) warnings.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => window.__eveCoreDataLoaded === true, undefined, { timeout: 180000 });
        await page.waitForFunction(() => document.querySelectorAll('.category-card').length >= 6, undefined, { timeout: 120000 });
        await page.waitForTimeout(seedMemory ? 5200 : 1800);
        return await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.category-card'));
            const autoCards = cards.filter(card => card.getAttribute('data-card-auto-hydrate') === '1');
            const onDemandCards = cards.filter(card => card.getAttribute('data-card-hydrate-on-demand') === '1');
            const hydratedMemoryCard = document.querySelector('.category-card[data-card-category="Memory Cat 1"]');
            return {
                cards: cards.length,
                autoCount: autoCards.length,
                onDemandCount: onDemandCards.length,
                hydratedMemoryLinks: hydratedMemoryCard ? hydratedMemoryCard.querySelectorAll('[data-link-id]').length : 0,
                memoryDiagnostics: window.EveDashboardHydrationMemory?.getDiagnostics?.() || null,
                warnings: []
            };
        });
    } finally {
        await context.close();
        await browser.close();
    }
}

(async () => {
    const hot = await runCase(true);
    if (hot.autoCount < 1 || hot.hydratedMemoryLinks < 1) {
        throw new Error(`Expected frequent card to auto-hydrate: ${JSON.stringify(hot)}`);
    }
    if (!hot.memoryDiagnostics?.hotWorkspaces?.length || !hot.memoryDiagnostics?.hotCards?.length) {
        throw new Error(`Expected hydration diagnostics to expose hot places: ${JSON.stringify(hot.memoryDiagnostics)}`);
    }
    const stale = await runCase('stale');

    const cold = await runCase(false);
    if (cold.autoCount !== 0) {
        throw new Error(`Cold large pack should not auto-hydrate cards: ${JSON.stringify(cold)}`);
    }
    if (cold.onDemandCount < 1) {
        throw new Error(`Cold large pack should preserve hover-to-load mode: ${JSON.stringify(cold)}`);
    }
    if (stale.autoCount !== 0) {
        throw new Error(`Stale score fallback case should stay cold: ${JSON.stringify(stale)}`);
    }

    console.log('DASHBOARD_ADAPTIVE_HYDRATION_MEMORY_BROWSER_SMOKE_OK', JSON.stringify({ hot, cold, stale }));
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
