const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildLinks() {
    const links = [];
    const hotCategories = ['Switch Hot 1', 'Switch Hot 2', 'Switch Hot 3', 'Switch Hot 4'];
    hotCategories.forEach((category, categoryIndex) => {
        for (let linkIndex = 1; linkIndex <= 650; linkIndex += 1) {
            links.push({
                id: `switch-hot-${categoryIndex + 1}-${linkIndex}`,
                title: `${category} Link ${linkIndex}`,
                url: `https://switch-hot-${categoryIndex + 1}.example/item/${linkIndex}`,
                workspace: 'hot-tab',
                category,
                done: false
            });
        }
    });
    for (let linkIndex = 1; linkIndex <= 24; linkIndex += 1) {
        links.push({
            id: `switch-cold-${linkIndex}`,
            title: `Cold Tab Link ${linkIndex}`,
            url: `https://switch-cold.example/item/${linkIndex}`,
            workspace: 'cold-tab',
            category: 'Cold Start',
            done: false
        });
    }
    return { links, hotCategories };
}

function buildHotMemory(categories) {
    const now = Date.now();
    const hotCardKey = `hot-tab::${categories[0].toLowerCase()}`;
    return {
        schemaVersion: 1,
        enabled: true,
        mode: 'auto',
        workspaceVisitWindowLimit: 100,
        cardInteractionWindowLimit: 250,
        frequentWorkspaceVisits: 4,
        frequentCardInteractions: 2,
        minLargeDatapackLinks: 1500,
        autoHydrateCardLimit: 3,
        autoHydrateBookmarkBudget: 1100,
        maxAutoHydrateLinksPerCard: 500,
        showCardMarkers: false,
        showBookmarkMarkers: false,
        workspaces: {
            'hot-tab': { id: 'hot-tab', name: 'Hot Tab', score: 5, visits: 5, lastSeen: now - 10000 }
        },
        cards: {
            [hotCardKey]: {
                key: hotCardKey,
                workspaceId: 'hot-tab',
                categoryName: categories[0],
                score: 3,
                interactions: 2,
                lastSeen: now - 10000,
                lastLinkCount: 650
            }
        },
        recentWorkspaceVisits: Array.from({ length: 5 }, (_, index) => ({
            id: 'hot-tab',
            at: now - ((5 - index) * 45000),
            source: 'smoke',
            type: 'visit',
            weight: 1
        })),
        recentCardInteractions: [
            { key: hotCardKey, workspaceId: 'hot-tab', categoryName: categories[0], type: 'hydrate', at: now - 30000, weight: 1 },
            { key: hotCardKey, workspaceId: 'hot-tab', categoryName: categories[0], type: 'focus', at: now - 12000, weight: 1.2 }
        ]
    };
}

function buildConfig(hotCategories, seedMemory) {
    const config = {
        activeWorkspace: 'cold-tab',
        viewMode: 'grid',
        workspaces: [
            { id: 'cold-tab', name: 'Cold Tab', icon: 'C', subTabs: [] },
            { id: 'hot-tab', name: 'Hot Tab', icon: 'H', subTabs: [] }
        ],
        categoryOrder: ['Cold Start'].concat(hotCategories),
        categoryOrderByWorkspace: {
            'cold-tab': ['Cold Start'],
            'hot-tab': hotCategories.slice()
        },
        collapsed: [],
        collapsedTabs: [],
        foldersCollapsed: [],
        linksCollapsed: [],
        hideStats: [],
        scrollableCategories: false
    };
    if (seedMemory) config.dashboardHydrationMemory = buildHotMemory(hotCategories);
    return config;
}

async function runCase(seedMemory) {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const payload = buildLinks();
    const config = buildConfig(payload.hotCategories, seedMemory);

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
        await page.waitForFunction(() => document.querySelector('.category-card[data-card-category="Cold Start"]'), undefined, { timeout: 120000 });
        await page.evaluate(() => window.switchWorkspace('hot-tab'));
        await page.waitForFunction(() => (window.eveState?.config || window.config || {}).activeWorkspace === 'hot-tab', undefined, { timeout: 60000 });
        await page.waitForFunction(() => document.querySelector('.category-card[data-card-category="Switch Hot 1"]'), undefined, { timeout: 120000 });
        await page.waitForTimeout(seedMemory ? 7200 : 2600);

        return await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.category-card'));
            const hotCard = document.querySelector('.category-card[data-card-category="Switch Hot 1"]');
            const autoCards = cards.filter(card => card.getAttribute('data-card-auto-hydrate') === '1');
            const onDemandCards = cards.filter(card => card.getAttribute('data-card-hydrate-on-demand') === '1');
            return {
                activeWorkspace: (window.eveState?.config || window.config || {}).activeWorkspace,
                cards: cards.length,
                autoCount: autoCards.length,
                onDemandCount: onDemandCards.length,
                hotHydratedLinks: hotCard ? hotCard.querySelectorAll('[data-link-id]').length : 0,
                hotOnDemand: hotCard ? hotCard.getAttribute('data-card-hydrate-on-demand') === '1' : false,
                hotAutoHydrate: hotCard ? hotCard.getAttribute('data-card-auto-hydrate') === '1' : false,
                diagnostics: window.EveDashboardHydrationMemory?.getDiagnostics?.() || null
            };
        });
    } finally {
        await context.close();
        await browser.close();
    }
}

(async () => {
    const hot = await runCase(true);
    if (hot.activeWorkspace !== 'hot-tab' || hot.autoCount < 1 || hot.hotHydratedLinks < 1 || !hot.hotAutoHydrate || hot.hotOnDemand) {
        throw new Error(`Expected switching into frequent tab to auto-hydrate hot card without hover: ${JSON.stringify(hot)}`);
    }

    const cold = await runCase(false);
    if (cold.activeWorkspace !== 'hot-tab' || cold.autoCount !== 0 || cold.hotHydratedLinks !== 0 || !cold.hotOnDemand) {
        throw new Error(`Expected cold switch target to remain hover-gated: ${JSON.stringify(cold)}`);
    }

    console.log('DASHBOARD_ADAPTIVE_HYDRATION_WORKSPACE_SWITCH_BROWSER_SMOKE_OK', JSON.stringify({ hot, cold }));
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
