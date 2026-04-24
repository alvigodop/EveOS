const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveSidebarRuntime
        && !!window.EveSidebarGroups
        && !!window.EveWorkspaceHelpers?.findParent
    ), undefined, { timeout: 120000 });
}

async function seedState(page) {
    await page.evaluate(() => {
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
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};

        const groupsApi = window.EveSidebarGroups;
        groupsApi.ensureConfigDefaults(config);
        window.renderSidebar();
    });
}

async function runSmoke(page) {
    await page.dragAndDrop('#sidebar .ws-item[data-ws-id="gamma"]', '#sidebar .ws-item[data-ws-id="alpha"]', { force: true });
    await page.waitForTimeout(400);

    const order = await page.evaluate(() => config.workspaces.map((ws) => ws.id));
    if (order.join('|') !== 'main|gamma|alpha|beta') {
        throw new Error(`Unexpected sidebar root order after drag reorder: ${order.join(' | ')}`);
    }
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });
        await waitForApp(page);
        await seedState(page);
        await runSmoke(page);
        console.log('SIDEBAR_WORKSPACE_REORDER_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
