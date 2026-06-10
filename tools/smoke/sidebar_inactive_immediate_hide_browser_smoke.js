const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && typeof window.ctxWsToggleInactive === 'function'
        && typeof window.showWsContext === 'function'
        && typeof window.switchWorkspace === 'function'
        && !!window.EveWorkspaceHelpers?.findById
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'active-tab',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'M', subTabs: [] },
                { id: 'active-tab', name: 'Active Tab', icon: 'A', subTabs: [] }
            ],
            sidebarGroups: [],
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        window.renderSidebar();
    });
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page);

        const before = await page.evaluate(() => ({
            activeWorkspace: String(config.activeWorkspace || ''),
            activeTabVisible: !!document.querySelector('#sidebar .ws-item[data-ws-id="active-tab"]'),
            mainVisible: !!document.querySelector('#sidebar .ws-item[data-ws-id="main"]')
        }));
        if (before.activeWorkspace !== 'active-tab' || !before.activeTabVisible || !before.mainVisible) {
            throw new Error(`Invalid inactive-toggle seed state: ${JSON.stringify(before)}`);
        }

        await page.evaluate(() => {
            window.showWsContext({
                preventDefault() {},
                stopPropagation() {},
                clientX: 24,
                clientY: 24
            }, 'active-tab');
            window.ctxWsToggleInactive();
        });

        await page.waitForFunction(() => (
            String(config.activeWorkspace || '') === 'main'
            && !document.querySelector('#sidebar .ws-item[data-ws-id="active-tab"]')
            && !!document.querySelector('#sidebar .ws-item[data-ws-id="main"].active')
        ), undefined, { timeout: 10000 });

        const after = await page.evaluate(() => {
            const inactiveTab = window.EveWorkspaceHelpers.findById(config.workspaces, 'active-tab');
            return {
                activeWorkspace: String(config.activeWorkspace || ''),
                inactiveState: inactiveTab?.inactive === true,
                inactiveTabVisible: !!document.querySelector('#sidebar .ws-item[data-ws-id="active-tab"]'),
                mainActive: !!document.querySelector('#sidebar .ws-item[data-ws-id="main"].active')
            };
        });

        if (after.activeWorkspace !== 'main' || !after.inactiveState || after.inactiveTabVisible || !after.mainActive) {
            throw new Error(`Inactive tab did not hide immediately: ${JSON.stringify(after)}`);
        }

        console.log('SIDEBAR_INACTIVE_IMMEDIATE_HIDE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
