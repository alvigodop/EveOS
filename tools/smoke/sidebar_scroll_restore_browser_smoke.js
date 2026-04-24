const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!document.getElementById('sidebar')
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        const visibleWorkspaces = Array.from({ length: 60 }, (_, index) => ({
            id: index === 0 ? 'main' : `ws-${index}`,
            name: index === 0 ? 'Main' : `Workspace ${index}`,
            icon: 'folder',
            subTabs: []
        }));

        visibleWorkspaces.push({
            id: 'hiddenws',
            name: 'Hidden WS',
            icon: 'moon',
            subTabs: [],
            groupId: 'hidden-group'
        });

        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            sidebarExpanded: true,
            ultraCollapseSidebar: false,
            sidebarHidden: false,
            workspaces: visibleWorkspaces,
            sidebarGroups: [
                { id: 'hidden-group', name: 'Hidden Group', color: '#7c4dff', hidden: true, collapsed: true, parentWorkspaceId: '' }
            ],
            categoryOrder: ['Alpha'],
            sidebarOrderMode: 'auto',
            sidebarManualOrder: { root: [], parents: {} },
            sidebarFocusedGroupId: '',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };

        links = window.links = visibleWorkspaces.map((workspace, index) => ({
            id: `link-${index}`,
            title: `Link ${index}`,
            url: `https://example.com/${index}`,
            workspace: workspace.id,
            category: 'Alpha',
            done: false
        }));

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page);

        await page.waitForSelector('#sidebar .ws-hover-reveal', { timeout: 10000 });
        await page.waitForTimeout(140);

        const visibleHost = page.locator('#sidebar .ws-sidebar-content:not([hidden])').first();
        const visibleHostBox = await visibleHost.boundingBox();
        if (!visibleHostBox) {
            throw new Error('Missing visible sidebar content host for scroll test');
        }

        await page.mouse.move(
            visibleHostBox.x + Math.max(20, visibleHostBox.width / 2),
            visibleHostBox.y + Math.max(20, Math.min(180, visibleHostBox.height - 20))
        );
        await page.mouse.wheel(0, 720);
        await page.waitForTimeout(80);

        const initialScrollState = await page.evaluate(() => {
            const host = document.querySelector('#sidebar .ws-sidebar-content:not([hidden])');
            return host ? {
                top: Number(host.scrollTop || 0),
                maxTop: Math.max(0, host.scrollHeight - host.clientHeight)
            } : null;
        });

        if (!initialScrollState || initialScrollState.top < 150) {
            throw new Error(`Expected scrollable sidebar before rerender test, got ${JSON.stringify(initialScrollState)}`);
        }

        await page.evaluate(() => {
            window.renderSidebar();
        });
        await page.waitForTimeout(170);

        const rerenderScrollState = await page.evaluate(() => {
            const host = document.querySelector('#sidebar .ws-sidebar-content:not([hidden])');
            return host ? {
                top: Number(host.scrollTop || 0),
                maxTop: Math.max(0, host.scrollHeight - host.clientHeight)
            } : null;
        });

        if (!rerenderScrollState || Math.abs(rerenderScrollState.top - initialScrollState.top) > 20) {
            throw new Error(`Expected sidebar rerender to preserve scroll position, got ${JSON.stringify({ initialScrollState, rerenderScrollState })}`);
        }

        console.log('SIDEBAR_SCROLL_RESTORE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
