const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildConfig() {
    const now = Date.now();
    return {
        activeWorkspace: 'main',
        viewMode: 'grid',
        sidebarExpanded: true,
        workspaces: [
            { id: 'main', name: 'Frequent Main', icon: '\u{1F4C1}', subTabs: [] },
            { id: 'cold', name: 'Cold Tab', icon: '\u{1F4C2}', subTabs: [] }
        ],
        sidebarGroups: [],
        sidebarOrderMode: 'auto',
        showHiddenSidebarGroups: false,
        showInactiveTabs: false,
        collapsedTabs: [],
        dashboardHydrationMemory: {
            schemaVersion: 1,
            enabled: true,
            mode: 'auto',
            workspaceVisitWindowLimit: 100,
            cardInteractionWindowLimit: 250,
            frequentWorkspaceVisits: 4,
            frequentCardInteractions: 2,
            minWorkspaceDwellMs: 12000,
            minCardDwellMs: 8000,
            minLargeDatapackLinks: 1500,
            autoHydrateCardLimit: 4,
            autoHydrateBookmarkBudget: 820,
            maxAutoHydrateLinksPerCard: 420,
            showCardMarkers: false,
            showBookmarkMarkers: false,
            workspaces: {
                main: { id: 'main', name: 'Frequent Main', score: 5, visits: 5, lastSeen: now }
            },
            cards: {},
            recentWorkspaceVisits: Array.from({ length: 5 }, (_, index) => ({
                id: 'main',
                at: now - (index * 30000),
                source: 'smoke',
                type: 'visit',
                weight: 1
            })),
            recentCardInteractions: []
        }
    };
}

async function readMarkerLayout(page) {
    return page.evaluate(() => {
        const sidebar = document.getElementById('sidebar');
        const item = document.querySelector('#sidebar .ws-item[data-ws-id="main"]');
        const icon = item?.querySelector('.ws-icon');
        const marker = item?.querySelector('.ws-summary-chip--frequent');
        const label = item?.querySelector('.ws-label');
        const itemRect = item?.getBoundingClientRect();
        const iconRect = icon?.getBoundingClientRect();
        const markerRect = marker?.getBoundingClientRect();
        const markerStyle = marker ? getComputedStyle(marker) : null;
        return {
            expanded: !!sidebar?.classList.contains('is-expanded'),
            itemWidth: itemRect?.width || 0,
            iconCenterOffset: itemRect && iconRect
                ? Math.abs((iconRect.left + (iconRect.width / 2)) - (itemRect.left + (itemRect.width / 2)))
                : 999,
            labelDisplay: label ? getComputedStyle(label).display : '',
            markerPosition: markerStyle?.position || '',
            markerWidth: markerRect?.width || 0,
            markerHeight: markerRect?.height || 0,
            markerInsideItem: !!(
                itemRect
                && markerRect
                && markerRect.left >= itemRect.left
                && markerRect.top >= itemRect.top
                && markerRect.right <= itemRect.right
                && markerRect.bottom <= itemRect.bottom
            )
        };
    });
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const config = buildConfig();
    await context.addInitScript((seedConfig) => {
        localStorage.setItem('eveV22Data', JSON.stringify([]));
        localStorage.setItem('eveV22Config', JSON.stringify(seedConfig));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify({}));
    }, config);
    const page = await context.newPage();

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => (
            typeof window.renderSidebar === 'function'
            && !!document.querySelector('#sidebar .ws-item[data-ws-id="main"] .ws-summary-chip--frequent')
        ), undefined, { timeout: 180000 });

        const expanded = await readMarkerLayout(page);
        if (!expanded.expanded || expanded.markerPosition === 'absolute' || expanded.labelDisplay === 'none') {
            throw new Error(`Expanded frequent marker layout changed unexpectedly: ${JSON.stringify(expanded)}`);
        }

        await page.evaluate(() => window.toggleSidebarExpanded(false));
        await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('is-expanded'), undefined, { timeout: 10000 });
        const collapsed = await readMarkerLayout(page);
        if (
            collapsed.expanded
            || collapsed.markerPosition !== 'absolute'
            || collapsed.markerWidth > 8
            || collapsed.markerHeight > 8
            || !collapsed.markerInsideItem
            || collapsed.iconCenterOffset > 2
            || collapsed.itemWidth > 42
        ) {
            throw new Error(`Collapsed frequent marker should be a corner dot without stretching the icon row: ${JSON.stringify(collapsed)}`);
        }

        console.log('SIDEBAR_FREQUENT_MARKER_LAYOUT_BROWSER_SMOKE_OK', JSON.stringify({ expanded, collapsed }));
    } finally {
        await context.close();
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
