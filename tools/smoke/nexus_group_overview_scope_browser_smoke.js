const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.renderSidebar === 'function'
        && typeof window.openExpandedSearchModal === 'function'
        && !!window.EveSidebarGroups
        && !!window.EveOS?.SearchAdvanced?.UI?.getResolvedScope
        && !!window.EveOS?.SearchAdvanced?.CacheAggregator?.getScopedLinks
        && !!window.EveOS?.SearchAdvanced?.Index?.rebuild
        && !!window.EveOS?.SearchAdvanced?.SearchVectors?.runMultiVectorSearch
        && typeof window.getLiveLinks === 'function'
        && Array.isArray(window.getLiveLinks())
        && window.getLiveLinks().length > 0
    ), undefined, { timeout: 180000 });
}

async function seedGroupOverview(page) {
    await page.evaluate(async () => {
        try {
            localStorage.clear();
        } catch (_) {
            // file:// storage may be unavailable.
        }

        window.config = config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Outside Main', icon: 'home', subTabs: [] },
                {
                    id: 'grpws',
                    name: 'Grouped Root',
                    icon: 'folder',
                    subTabs: [
                        { id: 'grpchild', name: 'Grouped Child', icon: 'leaf', subTabs: [] }
                    ]
                },
                { id: 'grpws2', name: 'Grouped Two', icon: 'folder', subTabs: [] }
            ],
            categoryOrder: ['Alpha'],
            categoryOrderByWorkspace: {
                grpws: ['Alpha'],
                grpchild: ['Child Card'],
                grpws2: ['Beta'],
                main: ['Outside']
            },
            sidebarGroups: [],
            sidebarOrderMode: 'auto',
            showInactiveTabs: true,
            showHiddenSidebarGroups: true,
            collapsedTabs: [],
            linksCollapsed: []
        };
        window.links = links = [
            { id: 'outside-scope', title: 'Scope Beacon Outside', url: 'https://example.test/outside', workspace: 'main', category: 'Outside' },
            { id: 'group-root-scope', title: 'Scope Beacon Group Root', url: 'https://example.test/root', workspace: 'grpws', category: 'Alpha' },
            { id: 'group-child-scope', title: 'Scope Beacon Child', url: 'https://example.test/child', workspace: 'grpchild', category: 'Child Card' },
            { id: 'group-two-scope', title: 'Scope Beacon Group Two', url: 'https://example.test/two', workspace: 'grpws2', category: 'Beta' }
        ];
        window.bookmarkFolders = bookmarkFolders = {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        const groupsApi = window.EveSidebarGroups;
        groupsApi.ensureConfigDefaults(config);
        const group = groupsApi.createGroup({ name: 'Nexus Scope Group', color: '#00d4ff' }, config);
        config.workspaces.find((workspace) => workspace.id === 'grpws').groupId = group.id;
        config.workspaces.find((workspace) => workspace.id === 'grpws2').groupId = group.id;
        config.groupOverviewId = group.id;

        if (typeof window.EveOS?.SearchAdvanced?.Index?.rebuild === 'function') {
            await window.EveOS.SearchAdvanced.Index.rebuild({
                reason: 'nexus-group-overview-scope-smoke-seed',
                force: true
            });
        }
        window.renderSidebar();
        window.renderDashboard();
    });
}

async function runSmoke(page) {
    await page.waitForFunction(() => {
        return !!window.config?.groupOverviewId
            && typeof window.getLiveLinks === 'function'
            && window.getLiveLinks().some((link) => String(link.id || '') === 'group-root-scope');
    }, undefined, { timeout: 15000 });

    await page.evaluate(() => {
        window.openExpandedSearchModal({ query: 'Scope Beacon', autoSearch: false });
    });
    await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });

    const scopeState = await page.evaluate(() => {
        const scope = window.EveOS.SearchAdvanced.UI.getResolvedScope('current');
        const label = window.EveOS.SearchAdvanced.UI.getScopeLabel('current');
        const scopedLinks = window.EveOS.SearchAdvanced.CacheAggregator.getScopedLinks(scope).map((link) => ({
            id: link.id,
            workspace: link.workspace
        }));
        const indicator = document.getElementById('esScopeIndicator')?.textContent || '';
        return { scope, label, scopedLinks, indicator };
    });

    const workspaceIds = Array.isArray(scopeState.scope?.workspaceIds) ? scopeState.scope.workspaceIds.slice().sort() : [];
    if (workspaceIds.join('|') !== 'grpchild|grpws|grpws2') {
        throw new Error(`Expected Nexus current scope to target the group overview tabs only: ${JSON.stringify(scopeState)}`);
    }
    if (scopeState.scopedLinks.some((link) => link.id === 'outside-scope' || link.workspace === 'main')) {
        throw new Error(`Group overview scoped links leaked outside workspace bookmarks: ${JSON.stringify(scopeState.scopedLinks)}`);
    }
    if (!scopeState.label.includes('Nexus Scope Group') || !scopeState.indicator.includes('Nexus Scope Group')) {
        throw new Error(`Expected Nexus scope label/indicator to identify the group overview: ${JSON.stringify(scopeState)}`);
    }

    const searchResult = await page.evaluate(async () => {
        const scope = window.EveOS.SearchAdvanced.UI.getResolvedScope('current');
        await window.EveOS.SearchAdvanced.Index.rebuild({ reason: 'nexus-group-overview-scope-smoke', force: true });
        const result = await window.EveOS.SearchAdvanced.SearchVectors.runMultiVectorSearch('Scope Beacon', {
            activeVectors: {
                bookmarks: true,
                knowledge: false,
                cachedResults: false,
                google: false
            },
            resultsMode: 'merged'
        }, scope);
        return {
            resultScope: result.scope,
            bookmarks: (result.results || [])
                .filter((record) => record.type === 'bookmark')
                .map((record) => ({
                    id: record.path?.linkId || record.provenance?.linkId || '',
                    title: record.title,
                    workspaceId: record.workspaceId || record.path?.workspaceId || ''
                }))
        };
    });

    const resultIds = searchResult.bookmarks.map((bookmark) => bookmark.id).sort();
    if (resultIds.join('|') !== 'group-child-scope|group-root-scope|group-two-scope') {
        throw new Error(`Expected Nexus search to include only grouped overview bookmarks: ${JSON.stringify(searchResult)}`);
    }
    if (searchResult.bookmarks.some((bookmark) => bookmark.workspaceId === 'main')) {
        throw new Error(`Nexus group overview search leaked outside workspace result: ${JSON.stringify(searchResult)}`);
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedGroupOverview(page);
        await runSmoke(page);
        console.log('NEXUS_GROUP_OVERVIEW_SCOPE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
