const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && typeof window.renderDashboard === 'function'
        && typeof window.ctxSidebarGroupToggleHidden === 'function'
        && !!window.EveSidebarGroups
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: '🏠', subTabs: [] },
                { id: 'grpws', name: 'Grouped', icon: '📁', subTabs: [] }
            ],
            categoryOrder: ['Alpha'],
            sidebarGroups: [],
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [
            { id: 'group-link', title: 'Group Link', url: 'https://example.com/group', workspace: 'grpws', category: 'Alpha', done: false }
        ];
        bookmarkFolders = window.bookmarkFolders = {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        try {
            localStorage.setItem('eveV22Data', JSON.stringify(links));
            localStorage.setItem('eveV22Config', JSON.stringify(config));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
        } catch (_) {
            // file:// runs can reject storage access
        }
    });
}

async function runSmoke(page) {
    const emptyGroup = await page.evaluate(() => {
        const groupsApi = window.EveSidebarGroups;
        groupsApi.ensureConfigDefaults(config);
        const group = groupsApi.createGroup({ name: 'Empty Group', color: '#00d4ff' }, config);
        window.renderSidebar();

        return {
            groupId: group.id,
            titles: Array.from(document.querySelectorAll('#sidebar .ws-group-title')).map((el) => el.textContent.trim()),
            emptyText: Array.from(document.querySelectorAll('#sidebar .ws-group-empty')).map((el) => el.textContent.trim())
        };
    });

    if (!emptyGroup.titles.includes('Empty Group')) {
        throw new Error(`Expected empty sidebar group to render, got ${JSON.stringify(emptyGroup)}`);
    }
    if (!emptyGroup.emptyText.includes('No tabs in this group')) {
        throw new Error(`Expected empty sidebar group placeholder, got ${JSON.stringify(emptyGroup)}`);
    }

    const overviewGroupId = await page.evaluate(() => {
        const groupsApi = window.EveSidebarGroups;
        const group = groupsApi.createGroup({ name: 'Overview Group', color: '#ffb84d' }, config);
        const groupedWorkspace = config.workspaces.find((ws) => ws.id === 'grpws');
        groupedWorkspace.groupId = group.id;

        config.groupOverviewId = group.id;
        window.renderSidebar();
        window.renderDashboard();
        return group.id;
    });

    await page.waitForSelector('.category-card[data-card-category="Alpha"]', { timeout: 10000 });

    const hiddenOverviewResult = await page.evaluate(async (groupId) => {
        const groupsApi = window.EveSidebarGroups;
        const beforeCards = document.querySelectorAll('.category-card').length;
        window.ctxSidebarGroupId = groupId;
        window.ctxSidebarGroupToggleHidden();
        await new Promise((resolve) => setTimeout(resolve, 150));
        return {
            beforeCards,
            groupOverviewId: String(config.groupOverviewId || '').trim(),
            hiddenState: groupsApi.findGroupById(groupId, config)?.hidden === true,
            renderedTitles: Array.from(document.querySelectorAll('#sidebar .ws-group-title')).map((el) => el.textContent.trim())
        };
    }, overviewGroupId);

    await page.waitForFunction(() => document.querySelectorAll('.category-card').length === 0, undefined, { timeout: 10000 });
    const afterCards = await page.evaluate(() => document.querySelectorAll('.category-card').length);

    if (hiddenOverviewResult.groupOverviewId) {
        throw new Error(`Expected hiding active overview group to clear groupOverviewId, got ${JSON.stringify(hiddenOverviewResult)}`);
    }
    if (!hiddenOverviewResult.hiddenState) {
        throw new Error(`Expected group to be hidden after toggle, got ${JSON.stringify(hiddenOverviewResult)}`);
    }
    if (hiddenOverviewResult.beforeCards < 1 || afterCards !== 0) {
        throw new Error(`Expected dashboard to refresh away from hidden group overview, got ${JSON.stringify({ beforeCards: hiddenOverviewResult.beforeCards, afterCards, hiddenOverviewResult })}`);
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page);
        await runSmoke(page);
        console.log('SIDEBAR_GROUP_VISIBILITY_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
