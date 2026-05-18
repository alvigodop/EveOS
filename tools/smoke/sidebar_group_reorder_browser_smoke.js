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
                { id: 'alpha', name: 'Alpha', icon: '📁', subTabs: [
                    { id: 'alpha-1', name: 'Alpha 1', icon: '📁', subTabs: [] },
                    { id: 'alpha-2', name: 'Alpha 2', icon: '📁', subTabs: [] }
                ], groupId: 'group-1' },
                { id: 'beta', name: 'Beta', icon: '📁', subTabs: [], groupId: 'group-1' },
                { id: 'gamma', name: 'Gamma', icon: '📁', subTabs: [], groupId: 'group-1' }
            ],
            sidebarGroups: [
                { id: 'group-1', name: 'Group 1', color: '#00d4ff', collapsed: false, hidden: false, parentWorkspaceId: '' }
            ],
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
    await page.evaluate(async () => {
        async function pointerDropOnSlot(sourceSelector, slot, pointerId) {
            const source = document.querySelector(sourceSelector);
            if (!source || !slot) throw new Error(`Missing pointer reorder source or slot for ${sourceSelector}`);
            const originalElementFromPoint = document.elementFromPoint.bind(document);
            document.elementFromPoint = function () { return slot; };
            source.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                pointerId,
                button: 0,
                clientX: 40,
                clientY: 220
            }));
            await new Promise(resolve => setTimeout(resolve, 380));
            source.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true,
                cancelable: true,
                pointerId,
                button: 0,
                clientX: 54,
                clientY: 190
            }));
            source.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                pointerId,
                button: 0,
                clientX: 54,
                clientY: 190
            }));
            document.elementFromPoint = originalElementFromPoint;
            await new Promise(resolve => setTimeout(resolve, 380));
        }

        const alphaWrapper = document.querySelector('#sidebar .ws-group-section[data-group-id="group-1"] .ws-node-wrapper[data-ws-id="alpha"]');
        const beforeAlphaSlot = alphaWrapper ? alphaWrapper.previousElementSibling : null;
        await pointerDropOnSlot(
            '#sidebar .ws-group-section[data-group-id="group-1"] .ws-item[data-ws-id="gamma"]',
            beforeAlphaSlot,
            41
        );
    });

    const order = await page.evaluate(() => config.workspaces.map((ws) => `${ws.id}:${ws.groupId || ''}`));
    if (order.join('|') !== 'main:|gamma:group-1|alpha:group-1|beta:group-1') {
        throw new Error(`Unexpected grouped sidebar order after drag reorder: ${order.join(' | ')}`);
    }

    await page.evaluate(async () => {
        const alphaWrapper = document.querySelector('#sidebar .ws-group-section[data-group-id="group-1"] .ws-node-wrapper[data-ws-id="alpha"]');
        const alphaOneWrapper = alphaWrapper
            ? alphaWrapper.querySelector('.ws-node-wrapper[data-ws-id="alpha-1"]')
            : null;
        const beforeAlphaOneSlot = alphaOneWrapper ? alphaOneWrapper.previousElementSibling : null;
        const source = alphaWrapper
            ? alphaWrapper.querySelector('.ws-node-wrapper[data-ws-id="alpha-2"] > .ws-item')
            : null;
        if (!source || !beforeAlphaOneSlot) throw new Error('Missing nested source or nested slot');
        const originalElementFromPoint = document.elementFromPoint.bind(document);
        document.elementFromPoint = function () { return beforeAlphaOneSlot; };
        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 42,
            button: 0,
            clientX: 42,
            clientY: 300
        }));
        await new Promise(resolve => setTimeout(resolve, 380));
        source.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 42,
            button: 0,
            clientX: 55,
            clientY: 260
        }));
        source.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 42,
            button: 0,
            clientX: 55,
            clientY: 260
        }));
        document.elementFromPoint = originalElementFromPoint;
        await new Promise(resolve => setTimeout(resolve, 380));
    });

    const nestedOrder = await page.evaluate(() => {
        const alpha = config.workspaces.find((ws) => ws.id === 'alpha');
        return Array.isArray(alpha?.subTabs) ? alpha.subTabs.map((ws) => ws.id) : [];
    });
    if (nestedOrder.join('|') !== 'alpha-2|alpha-1') {
        throw new Error(`Unexpected nested order after grouped sub-tab reorder: ${nestedOrder.join(' | ')}`);
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
        console.log('SIDEBAR_GROUP_REORDER_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
