const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && !!window.EveQuickPins?.writeStore
        && !!window.EveSidebarGroups?.ensureConfigDefaults
        && !!window.EveWorkspaceHelpers?.findById
    ), undefined, { timeout: 180000 });
}

async function seedGroupOverviewPins(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'outside-root',
            groupOverviewId: 'group-reading',
            viewMode: 'grid',
            workspaces: [
                { id: 'outside-root', name: 'Outside Root', icon: 'O', subTabs: [] },
                {
                    id: 'group-root',
                    name: 'Group Root',
                    icon: 'G',
                    groupId: 'group-reading',
                    subTabs: [{
                        id: 'group-child',
                        name: 'Group Child',
                        icon: 'C',
                        subTabs: [{
                            id: 'group-grandchild',
                            name: 'Group Grandchild',
                            icon: 'D',
                            subTabs: []
                        }]
                    }]
                },
                { id: 'group-peer', name: 'Group Peer', icon: 'P', groupId: 'group-reading', subTabs: [] }
            ],
            sidebarGroups: [{ id: 'group-reading', name: 'Reading Group', color: '#00d4ff', collapsed: false }],
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: true,
            showInactiveTabs: true,
            collapsedTabs: [],
            scrollableCategories: true
        };

        links = window.links = [
            { id: 'outside-pin-link', title: 'Outside Pin', url: 'https://example.test/outside', workspace: 'outside-root', category: 'Outside', done: false },
            { id: 'group-root-pin-link', title: 'Group Root Pin', url: 'https://example.test/root', workspace: 'group-root', category: 'Reading', done: false },
            { id: 'group-child-pin-link', title: 'Group Child Pin', url: 'https://example.test/child', workspace: 'group-child', category: 'Reading', done: false },
            { id: 'group-grandchild-pin-link', title: 'Group Grandchild Pin', url: 'https://example.test/grandchild', workspace: 'group-grandchild', category: 'Reading', done: false },
            { id: 'group-peer-pin-link', title: 'Group Peer Pin', url: 'https://example.test/peer', workspace: 'group-peer', category: 'Watching', done: false }
        ];
        bookmarkFolders = window.bookmarkFolders = {};
        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        window.EveSidebarGroups.ensureConfigDefaults(config);
        window.EveQuickPins.writeStore([
            { id: 'pin-outside', targetType: 'bookmark', targetId: 'outside-pin-link', scopeType: 'tab', order: 0 },
            { id: 'pin-group-root', targetType: 'bookmark', targetId: 'group-root-pin-link', scopeType: 'tab', order: 1 },
            { id: 'pin-group-child', targetType: 'bookmark', targetId: 'group-child-pin-link', scopeType: 'card', order: 2 },
            { id: 'pin-group-grandchild', targetType: 'bookmark', targetId: 'group-grandchild-pin-link', scopeType: 'folder', order: 3 },
            { id: 'pin-group-peer', targetType: 'bookmark', targetId: 'group-peer-pin-link', scopeType: 'tab', order: 4 }
        ], { persist: false });
        window.renderDashboard({ source: 'quick-pins-group-overview-smoke' });
    });
}

async function readDockState(page) {
    return page.evaluate(() => {
        const apiPins = window.EveQuickPins.getActiveDockPins({
            activeWorkspace: config.activeWorkspace,
            includeDescendantPins: true,
            visibleWorkspaceIds: Array.from(window._eveActiveVisibleWorkspaceIds || []),
            groupOverviewRootMap: window._eveGroupOverviewRootMap,
            groupOverviewId: config.groupOverviewId
        }).map((pin) => ({
            label: pin.label,
            isGroupOverviewPin: !!pin.isGroupOverviewPin,
            isInheritedPin: !!pin.isInheritedPin,
            inheritedPath: pin.inheritedPath || '',
            badgeDepth: pin.inheritedDepth || 0
        }));

        const domPins = Array.from(document.querySelectorAll('#dock-container .dock-item')).map((item) => ({
            label: item.querySelector('.dock-title')?.textContent?.trim() || '',
            badge: item.querySelector('.dock-badge')?.textContent?.trim() || '',
            inherited: item.classList.contains('dock-item--inherited'),
            groupOverview: item.classList.contains('dock-item--group-overview'),
            title: item.getAttribute('title') || ''
        }));

        return {
            visibleWorkspaceIds: Array.from(window._eveActiveVisibleWorkspaceIds || []),
            apiPins,
            domPins
        };
    });
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedGroupOverviewPins(page);
        await page.waitForFunction(() => document.querySelectorAll('#dock-container .dock-item').length >= 4, undefined, { timeout: 15000 });

        const state = await readDockState(page);
        const labels = state.domPins.map((pin) => pin.label);
        assert(!labels.includes('Outside Pin'), `Outside group pin leaked into group overview dock: ${JSON.stringify(state)}`);
        ['Group Root Pin', 'Group Child Pin', 'Group Grandchild Pin', 'Group Peer Pin'].forEach((label) => {
            assert(labels.includes(label), `Expected ${label} in group overview dock: ${JSON.stringify(state)}`);
        });

        const rootPin = state.domPins.find((pin) => pin.label === 'Group Root Pin');
        const childPin = state.domPins.find((pin) => pin.label === 'Group Child Pin');
        const grandchildPin = state.domPins.find((pin) => pin.label === 'Group Grandchild Pin');

        assert(rootPin?.badge === 'Group Link' && rootPin.groupOverview && !rootPin.inherited, `Expected root group pin badge/style: ${JSON.stringify(rootPin)}`);
        assert(childPin?.badge === 'Child Link' && childPin.groupOverview && childPin.inherited, `Expected child group pin badge/style: ${JSON.stringify(childPin)}`);
        assert(grandchildPin?.badge === 'Child Link' && grandchildPin.groupOverview && grandchildPin.inherited, `Expected grandchild group pin badge/style: ${JSON.stringify(grandchildPin)}`);

        console.log('QUICK_PINS_GROUP_OVERVIEW_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
