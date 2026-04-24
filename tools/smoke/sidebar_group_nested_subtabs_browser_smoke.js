const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveSidebarGroups
        && !!window.EveWorkspaceHelpers?.findParent
    ), undefined, { timeout: 180000 });
}

async function seedState(page, mode) {
    await page.evaluate((sidebarOrderMode) => {
        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: '🏠', subTabs: [] },
                { id: 'alpha', name: 'Alpha', icon: '📁', subTabs: [] },
                { id: 'beta', name: 'Beta', icon: '📁', subTabs: [] },
                { id: 'gamma', name: 'Gamma', icon: '📁', subTabs: [] }
            ],
            sidebarGroups: [],
            sidebarOrderMode,
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};

        const groupsApi = window.EveSidebarGroups;
        groupsApi.ensureConfigDefaults(config);
        const group = groupsApi.createGroup({ name: 'Group One', color: '#00d4ff' }, config);
        config.workspaces.find((ws) => ws.id === 'alpha').groupId = group.id;
        config.workspaces.find((ws) => ws.id === 'beta').groupId = group.id;
        if (sidebarOrderMode === 'manual' && typeof groupsApi.setSidebarOrderMode === 'function') {
            groupsApi.setSidebarOrderMode('manual', config);
        }
        window.renderSidebar();
    }, mode);
}

async function performNestedDrag(page) {
    await page.dragAndDrop('#sidebar .ws-item[data-ws-id="beta"]', '#sidebar .ws-item[data-ws-id="alpha"]', { force: true });
    await page.waitForTimeout(400);
    await page.dragAndDrop('#sidebar .ws-item[data-ws-id="gamma"]', '#sidebar .ws-item[data-ws-id="beta"]', { force: true });
    await page.waitForTimeout(600);
}

async function readTree(page) {
    return page.evaluate(() => {
        const helpers = window.EveWorkspaceHelpers;
        const alpha = helpers.findById(config.workspaces, 'alpha');
        const betaParent = helpers.findParent(config.workspaces, 'beta');
        const gammaParent = helpers.findParent(config.workspaces, 'gamma');
        return {
            roots: config.workspaces.map((ws) => ({
                id: ws.id,
                groupId: ws.groupId || '',
                subTabs: (ws.subTabs || []).map((child) => ({
                    id: child.id,
                    groupId: child.groupId || '',
                    subTabs: (child.subTabs || []).map((grandchild) => grandchild.id)
                }))
            })),
            alphaSubTabs: (alpha?.subTabs || []).map((ws) => ws.id),
            betaParent: betaParent ? betaParent.id : '',
            gammaParent: gammaParent ? gammaParent.id : ''
        };
    });
}

async function runCase(page, mode) {
    await seedState(page, mode);
    await performNestedDrag(page);
    const state = await readTree(page);

    if (state.betaParent !== 'alpha') {
        throw new Error(`Expected beta to become alpha sub-tab in ${mode} mode, got ${JSON.stringify(state)}`);
    }
    if (state.gammaParent !== 'beta') {
        throw new Error(`Expected gamma to become beta sub-tab in ${mode} mode, got ${JSON.stringify(state)}`);
    }
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await runCase(page, 'auto');
        await runCase(page, 'manual');
        console.log('SIDEBAR_GROUP_NESTED_SUBTABS_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
