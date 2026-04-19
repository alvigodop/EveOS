const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && typeof window.renderDashboard === 'function'
        && typeof window.switchWorkspace === 'function'
        && !!window.EveSidebarGroups
        && !!window.EveWorkspaceHelpers?.findById
    ), undefined, { timeout: 180000 });
}

async function seedBaseState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'M', subTabs: [] },
                { id: 'focusroot', name: 'Focus Root', icon: 'F', subTabs: [] },
                { id: 'hiddenroot', name: 'Hidden Root', icon: 'H', subTabs: [] }
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

        try {
            localStorage.setItem('eveV22Data', JSON.stringify(links));
            localStorage.setItem('eveV22Config', JSON.stringify(config));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
        } catch (_) {
            // file:// runs can reject storage access
        }
    });
}

async function runHiddenGroupCase(page) {
    const hiddenState = await page.evaluate(() => {
        const groupsApi = window.EveSidebarGroups;
        groupsApi.ensureConfigDefaults(config);
        const hiddenGroup = groupsApi.createGroup({ name: 'Hidden Group', color: '#00d4ff' }, config);
        const hiddenRoot = config.workspaces.find((ws) => ws.id === 'hiddenroot');
        hiddenRoot.groupId = hiddenGroup.id;
        config.showHiddenSidebarGroups = true;
        groupsApi.setGroupHidden(hiddenGroup.id, true, config);
        groupsApi.setGroupCollapsed(hiddenGroup.id, false, config);
        window.renderSidebar();

        const item = document.querySelector('#sidebar .ws-item[data-ws-id="hiddenroot"]');
        return {
            groupId: hiddenGroup.id,
            inactiveByApi: groupsApi.isWorkspaceEffectivelyInactive('hiddenroot', config),
            rendered: !!item,
            inactiveClass: !!item && item.classList.contains('ws-inactive'),
            clickable: !!item && typeof item.onclick === 'function',
            activeWorkspace: String(config.activeWorkspace || '')
        };
    });

    if (!hiddenState.inactiveByApi || !hiddenState.rendered || !hiddenState.inactiveClass) {
        throw new Error(`Expected hidden-group child tab to render as inactive, got ${JSON.stringify(hiddenState)}`);
    }
    if (hiddenState.clickable) {
        throw new Error(`Expected hidden-group child tab to be non-clickable, got ${JSON.stringify(hiddenState)}`);
    }

    await page.click('#sidebar .ws-item[data-ws-id="hiddenroot"]', { force: true });
    const afterHiddenClick = await page.evaluate(() => String(config.activeWorkspace || ''));
    if (afterHiddenClick !== 'main') {
        throw new Error(`Expected clicking hidden-group child tab to keep active workspace on main, got ${afterHiddenClick}`);
    }

    await page.evaluate(() => window.switchWorkspace('hiddenroot'));
    const afterHiddenSwitch = await page.evaluate(() => String(config.activeWorkspace || ''));
    if (afterHiddenSwitch !== 'main') {
        throw new Error(`Expected switchWorkspace to reject hidden-group child tab, got ${afterHiddenSwitch}`);
    }
}

async function runInactiveGroupCase(page) {
    const inactiveState = await page.evaluate(() => {
        const groupsApi = window.EveSidebarGroups;
        groupsApi.ensureConfigDefaults(config);

        config.sidebarGroups = [];
        config.showHiddenSidebarGroups = false;
        config.showInactiveTabs = true;
        config.sidebarFocusedGroupId = '';
        config.activeWorkspace = 'main';

        const focusGroup = groupsApi.createGroup({ name: 'Focus Group', color: '#ffb84d' }, config);
        const inactiveGroup = groupsApi.createGroup({ name: 'Inactive Group', color: '#7fe08a' }, config);

        config.workspaces.find((ws) => ws.id === 'focusroot').groupId = focusGroup.id;
        config.workspaces.find((ws) => ws.id === 'hiddenroot').groupId = inactiveGroup.id;

        groupsApi.setFocusedGroup(focusGroup.id, config);
        window.renderSidebar();

        const item = document.querySelector('#sidebar .ws-item[data-ws-id="hiddenroot"]');
        return {
            focusGroupId: focusGroup.id,
            inactiveGroupId: inactiveGroup.id,
            inactiveByApi: groupsApi.isWorkspaceEffectivelyInactive('hiddenroot', config),
            rendered: !!item,
            inactiveClass: !!item && item.classList.contains('ws-inactive'),
            clickable: !!item && typeof item.onclick === 'function',
            activeWorkspace: String(config.activeWorkspace || '')
        };
    });

    if (!inactiveState.inactiveByApi || !inactiveState.rendered || !inactiveState.inactiveClass) {
        throw new Error(`Expected off-focus group child tab to render as inactive, got ${JSON.stringify(inactiveState)}`);
    }
    if (inactiveState.clickable) {
        throw new Error(`Expected off-focus group child tab to be non-clickable, got ${JSON.stringify(inactiveState)}`);
    }
    if (inactiveState.activeWorkspace !== 'focusroot') {
        throw new Error(`Expected focused-group render to move active workspace to focusroot, got ${JSON.stringify(inactiveState)}`);
    }

    await page.click('#sidebar .ws-item[data-ws-id="hiddenroot"]', { force: true });
    const afterInactiveClick = await page.evaluate(() => String(config.activeWorkspace || ''));
    if (afterInactiveClick !== 'focusroot') {
        throw new Error(`Expected clicking off-focus group child tab to keep active workspace on focusroot, got ${afterInactiveClick}`);
    }

    await page.evaluate(() => window.switchWorkspace('hiddenroot'));
    const afterInactiveSwitch = await page.evaluate(() => String(config.activeWorkspace || ''));
    if (afterInactiveSwitch !== 'focusroot') {
        throw new Error(`Expected switchWorkspace to reject off-focus group child tab, got ${afterInactiveSwitch}`);
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedBaseState(page);
        await runHiddenGroupCase(page);
        await seedBaseState(page);
        await runInactiveGroupCase(page);
        console.log('SIDEBAR_GROUP_DISABLED_CHILDREN_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
