const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && typeof window.renderDashboard === 'function'
        && typeof window.ctxSidebarGroupToggleHidden === 'function'
        && !!window.EveSidebarGroups
        && !!window.EveConstellationMap?.openCurrentViewMap
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(async () => {
        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'home', subTabs: [] },
                { id: 'grpws', name: 'Grouped', icon: 'folder', subTabs: [] },
                { id: 'grpws2', name: 'Grouped Two', icon: 'folder', subTabs: [] }
            ],
            categoryOrder: ['Alpha'],
            sidebarGroups: [],
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [
            { id: 'group-link', title: 'Group Link', url: 'https://example.com/group', workspace: 'grpws', category: 'Alpha', done: false, folderId: 'folder-one' },
            { id: 'group-link-2', title: 'Group Link Two', url: 'https://example.com/group-two', workspace: 'grpws2', category: 'Alpha', done: false }
        ];
        bookmarkFolders = window.bookmarkFolders = {
            'grpws::Alpha': {
                nodes: [
                    { id: 'folder-one', name: 'Folder One', parentId: null, order: 1 }
                ]
            }
        };

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
        window.dispatchEvent(new CustomEvent('eve:state-mutated', {
            detail: { source: 'sidebar-group-visibility-smoke-seed' }
        }));
        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index;
        if (indexApi?.markDirty) indexApi.markDirty('sidebar-group-visibility-smoke-seed');
        if (indexApi?.ensureFresh) {
            await indexApi.ensureFresh({ force: true, reason: 'sidebar-group-visibility-smoke-seed' });
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

    const overviewGroupId = await page.evaluate(async () => {
        const groupsApi = window.EveSidebarGroups;
        const group = groupsApi.createGroup({ name: 'Overview Group', color: '#ffb84d' }, config);
        const groupedWorkspace = config.workspaces.find((ws) => ws.id === 'grpws');
        const groupedWorkspaceTwo = config.workspaces.find((ws) => ws.id === 'grpws2');
        groupedWorkspace.groupId = group.id;
        groupedWorkspaceTwo.groupId = group.id;

        config.groupOverviewId = group.id;
        window.dispatchEvent(new CustomEvent('eve:state-mutated', {
            detail: { source: 'sidebar-group-overview-smoke-seed' }
        }));
        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index;
        if (indexApi?.markDirty) indexApi.markDirty('sidebar-group-overview-smoke-seed');
        if (indexApi?.ensureFresh) {
            await indexApi.ensureFresh({ force: true, reason: 'sidebar-group-overview-smoke-seed' });
        }
        window.renderSidebar();
        window.renderDashboard();
        return group.id;
    });

    await page.waitForSelector('.category-card[data-card-category="Alpha"]', { timeout: 10000 });

    await page.locator('.topbar-constellation-btn').click();
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return overlay && overlay.style.display !== 'none' && !!window.EveConstellationMap?.__debugGetGraphStats?.().visible;
    }, undefined, { timeout: 15000 });
    await page.waitForTimeout(250);

    const groupOverviewMapStats = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        return {
            scope: stats.scope,
            kinds: stats.kinds
        };
    });

    if (groupOverviewMapStats.scope.scope !== 'all' || !Array.isArray(groupOverviewMapStats.scope.workspaceIds) || groupOverviewMapStats.scope.workspaceIds.length !== 2) {
        throw new Error(`Expected grouped overview map scope with two workspace IDs, got ${JSON.stringify(groupOverviewMapStats)}`);
    }
    if ((groupOverviewMapStats.kinds.workspace || 0) < 2 || (groupOverviewMapStats.kinds.category || 0) < 2 || (groupOverviewMapStats.kinds.folder || 0) < 1) {
        throw new Error(`Expected grouped overview map to include grouped tabs, cards, and folders, got ${JSON.stringify(groupOverviewMapStats)}`);
    }

    await page.click('[data-map-toolbar="close"]');
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return !overlay || overlay.style.display === 'none';
    }, undefined, { timeout: 10000 });

    const hiddenOverviewResult = await page.evaluate(async (groupId) => {
        const groupsApi = window.EveSidebarGroups;
        const beforeCards = document.querySelectorAll('.category-card').length;
        window.ctxSidebarGroupId = groupId;
        window.ctxSidebarGroupToggleHidden();
        const persistedGroup = (Array.isArray(config.sidebarGroups) ? config.sidebarGroups : []).find((group) => String(group?.id || '') === String(groupId));
        await new Promise((resolve) => setTimeout(resolve, 150));
        return {
            beforeCards,
            groupOverviewId: String(config.groupOverviewId || '').trim(),
            hiddenState: persistedGroup?.hidden === true,
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
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await page.evaluate(() => window.__eveWaitForCoreData?.(120000) || true);
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
