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
    await page.evaluate(async () => {
        async function pointerDropOnTab(sourceId, targetId, pointerId) {
            const source = document.querySelector(`#sidebar .ws-item[data-ws-id="${sourceId}"]`);
            const target = document.querySelector(`#sidebar .ws-item[data-ws-id="${targetId}"]`);
            if (!source || !target) throw new Error(`Missing source ${sourceId} or target ${targetId}`);
            const originalElementFromPoint = document.elementFromPoint.bind(document);
            document.elementFromPoint = function () { return target; };
            source.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                pointerId,
                button: 0,
                clientX: 40,
                clientY: 180
            }));
            await new Promise(resolve => setTimeout(resolve, 380));
            source.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true,
                cancelable: true,
                pointerId,
                button: 0,
                clientX: 60,
                clientY: 210
            }));
            source.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                pointerId,
                button: 0,
                clientX: 60,
                clientY: 210
            }));
            document.elementFromPoint = originalElementFromPoint;
            await new Promise(resolve => setTimeout(resolve, 120));
        }

        await pointerDropOnTab('beta', 'alpha', 31);
    });
    await page.waitForFunction(() => {
        const helpers = window.EveWorkspaceHelpers;
        const betaParent = helpers.findParent(config.workspaces, 'beta');
        return betaParent && betaParent.id === 'alpha'
            && !!document.querySelector('#sidebar .ws-node-wrapper[data-ws-id="beta"] > .ws-item');
    }, undefined, { timeout: 10000 });
    await page.evaluate(async () => {
        const source = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
        const target = document.querySelector('#sidebar .ws-item[data-ws-id="beta"]');
        if (!source || !target) throw new Error('Missing gamma source or beta target');
        const originalElementFromPoint = document.elementFromPoint.bind(document);
        document.elementFromPoint = function () { return target; };
        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 32,
            button: 0,
            clientX: 40,
            clientY: 260
        }));
        await new Promise(resolve => setTimeout(resolve, 380));
        source.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 32,
            button: 0,
            clientX: 60,
            clientY: 300
        }));
        source.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 32,
            button: 0,
            clientX: 60,
            clientY: 300
        }));
        document.elementFromPoint = originalElementFromPoint;
        await new Promise(resolve => setTimeout(resolve, 120));
    });
    await page.waitForFunction(() => {
        const helpers = window.EveWorkspaceHelpers;
        const gammaParent = helpers.findParent(config.workspaces, 'gamma');
        return gammaParent && gammaParent.id === 'beta';
    }, undefined, { timeout: 10000 });
    await page.evaluate(async () => {
        const source = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
        const groupBody = document.querySelector('#sidebar .ws-group-section[data-group-id] > .ws-group-body');
        if (!source || !groupBody) throw new Error('Missing gamma source or group body target');
        if (typeof groupBody.__eveSidebarApplyPointerDrop !== 'function') {
            throw new Error('Group body is missing pointer drop handler');
        }

        const originalElementFromPoint = document.elementFromPoint.bind(document);
        document.elementFromPoint = function () { return groupBody; };
        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 33,
            button: 0,
            clientX: 42,
            clientY: 300
        }));
        await new Promise(resolve => setTimeout(resolve, 380));
        source.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 33,
            button: 0,
            clientX: 58,
            clientY: 330
        }));
        source.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 33,
            button: 0,
            clientX: 58,
            clientY: 330
        }));
        document.elementFromPoint = originalElementFromPoint;
        await new Promise(resolve => setTimeout(resolve, 120));
    });
    await page.waitForFunction(() => {
        const helpers = window.EveWorkspaceHelpers;
        const gammaParent = helpers.findParent(config.workspaces, 'gamma');
        return gammaParent && gammaParent.id === 'beta';
    }, undefined, { timeout: 10000 });
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
