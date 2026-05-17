const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildLargeStartupPayload() {
    const links = [];
    const categoryOrder = [];
    for (let categoryIndex = 1; categoryIndex <= 12; categoryIndex += 1) {
        const category = `Startup Cat ${categoryIndex}`;
        categoryOrder.push(category);
        for (let linkIndex = 1; linkIndex <= 120; linkIndex += 1) {
            links.push({
                id: `startup-${categoryIndex}-${linkIndex}`,
                title: `${category} Bookmark ${linkIndex}`,
                url: `https://startup-smoke-${categoryIndex}-${linkIndex}.example.com/item`,
                workspace: 'main',
                category,
                icon: '\u{1F517}',
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
            sidebarExpanded: true,
            workspaces: [
                { id: 'main', name: 'Main', icon: 'M', subTabs: [] }
            ],
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

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.renderSidebar === 'function'
        && !!window.EveFaviconUtils
        && !!window.EveFaviconCache
    ), undefined, { timeout: 120000 });
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await waitForApp(page);

        const result = await page.evaluate(async (payload) => {
            config = window.config = JSON.parse(JSON.stringify(payload.config));
            links = window.links = JSON.parse(JSON.stringify(payload.links));
            bookmarkFolders = window.bookmarkFolders = JSON.parse(JSON.stringify(payload.bookmarkFolders));
            if (window.eveState) {
                window.eveState.config = window.config;
                window.eveState.links = window.links;
                window.eveState.bookmarkFolders = window.bookmarkFolders;
            }

            const startupFaviconSrc = window.EveFaviconUtils.getBestEffortSrc('startup-uncached.example.com', 32);
            window._eveStartupBookmarkPaintActive = true;
            window.__eveDashboardRenderHint = {
                kind: 'startup',
                source: 'dashboard-startup-deferred-favicon-smoke',
                linkCount: links.length,
                startedAt: Date.now()
            };
            window.renderDashboard();

            await new Promise(resolve => setTimeout(resolve, 220));

            const cards = Array.from(document.querySelectorAll('.category-card'));
            const deferredCards = cards.filter(card => card.getAttribute('data-card-deferred') === '1');
            const remoteFaviconSrcs = Array.from(document.querySelectorAll('img[data-favicon-domain]'))
                .map(image => image.getAttribute('src') || '')
                .filter(src => /icons\.duckduckgo\.com|google\.com\/s2\/favicons|gstatic\.com\/faviconv2/i.test(src));
            const stats = window.EveFaviconCache.getStats();

            return {
                startupFaviconSrc,
                cardCount: cards.length,
                deferredCardCount: deferredCards.length,
                remoteFaviconSrcCount: remoteFaviconSrcs.length,
                firstRemoteFaviconSrc: remoteFaviconSrcs[0] || '',
                perfMode: !!window._evePerfMode,
                megaPerfMode: !!window._eveMegaPerfMode,
                stats
            };
        }, buildLargeStartupPayload());

        if (!/^data:image\/svg\+xml/i.test(result.startupFaviconSrc)) {
            throw new Error(`Expected startup uncached favicon to use local placeholder, got ${JSON.stringify(result)}`);
        }
        if (result.cardCount < 3) {
            throw new Error(`Expected startup render to paint card shells quickly, got ${JSON.stringify(result)}`);
        }
        if (result.deferredCardCount < 3) {
            throw new Error(`Expected startup render to defer heavy card hydration, got ${JSON.stringify(result)}`);
        }
        if (result.remoteFaviconSrcCount !== 0) {
            throw new Error(`Expected no remote favicon image srcs during startup paint, got ${JSON.stringify(result)}`);
        }
        if (!result.perfMode || result.megaPerfMode) {
            throw new Error(`Expected perf mode but not mega mode for seeded startup payload, got ${JSON.stringify(result)}`);
        }

        console.log('DASHBOARD_STARTUP_DEFERRED_FAVICON_SMOKE_OK');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
