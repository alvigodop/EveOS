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
            activeWorkspace: 'group-root',
            viewMode: 'grid',
            sidebarExpanded: true,
            sidebarHidden: false,
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: [],
            sidebarGroups: [
                { id: 'group-a', name: 'Group A', color: '#00d4ff', collapsed: false, hidden: false, parentWorkspaceId: '' }
            ],
            workspaces: [
                {
                    id: 'group-root',
                    name: 'Group Root',
                    icon: 'G',
                    groupId: 'group-a',
                    subTabs: [
                        {
                            id: 'child',
                            name: 'Child',
                            icon: 'C',
                            subTabs: [
                                {
                                    id: 'deep',
                                    name: 'Deep',
                                    icon: 'D',
                                    subTabs: []
                                }
                            ]
                        }
                    ]
                },
                { id: 'outside', name: 'Outside', icon: 'O', subTabs: [] }
            ]
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};
        window.EveSidebarGroups.ensureConfigDefaults(config);
        window.renderSidebar();
    });
}

async function runSmoke(page) {
    const source = page.locator('#sidebar .ws-item[data-ws-id="deep"]');
    const addDrop = page.locator('#sidebar .ws-add');

    if (await source.count() !== 1 || await addDrop.count() !== 1) {
        throw new Error(`Sidebar Add/Drop promote setup failed: ${JSON.stringify({
            sourceCount: await source.count(),
            addDropCount: await addDrop.count()
        }, null, 2)}`);
    }

    const hasPointerDrop = await addDrop.evaluate((node) => (
        typeof node.__eveSidebarApplyPointerDrop === 'function'
    ));
    if (!hasPointerDrop) {
        throw new Error('Sidebar Add/Drop promote setup failed: Add/Drop lacks pointer drop handler');
    }

    await source.scrollIntoViewIfNeeded();
    await addDrop.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    const addDropBox = await addDrop.boundingBox();
    if (!sourceBox || !addDropBox) {
        throw new Error(`Sidebar Add/Drop promote setup failed: missing rendered bounds ${JSON.stringify({
            sourceBox,
            addDropBox
        })}`);
    }

    const sourcePoint = {
        x: sourceBox.x + Math.min(Math.max(sourceBox.width * 0.5, 4), Math.max(sourceBox.width - 4, 4)),
        y: sourceBox.y + Math.min(Math.max(sourceBox.height * 0.5, 4), Math.max(sourceBox.height - 4, 4))
    };
    const targetPoint = {
        x: addDropBox.x + Math.min(Math.max(addDropBox.width * 0.5, 4), Math.max(addDropBox.width - 4, 4)),
        y: addDropBox.y + Math.min(Math.max(addDropBox.height * 0.5, 4), Math.max(addDropBox.height - 4, 4))
    };

    await page.mouse.move(sourcePoint.x, sourcePoint.y);
    await page.mouse.down();
    await page.waitForTimeout(240);
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 8 });

    const duringDrag = await page.evaluate(() => {
        const addTarget = document.querySelector('#sidebar .ws-add');
        return {
            highlighted: !!addTarget?.classList.contains('ws-drop-target'),
            preview: !!document.querySelector('.ws-pointer-drag-preview'),
            dragActive: !!document.querySelector('#sidebar.ws-drag-active'),
            sortModeActive: !!document.querySelector('#sidebar.ws-sort-mode-active'),
            elementAtTarget: (() => {
                const rect = addTarget?.getBoundingClientRect?.();
                if (!rect) return '';
                const node = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                return node?.className || node?.tagName || '';
            })()
        };
    });

    await page.mouse.up();
    await page.waitForTimeout(180);

    const result = await page.evaluate((dragState) => {
        const helpers = window.EveWorkspaceHelpers;
        const deep = helpers.findById(config.workspaces, 'deep');
        const deepParent = helpers.findParent(config.workspaces, 'deep');
        const groupRoots = window.EveSidebarGroups.getGroupRoots('group-a', config).map(ws => ws.id);
        return {
            ok: true,
            highlightedDuringDrag: dragState.highlighted,
            previewDuringDrag: dragState.preview,
            dragActiveDuringDrag: dragState.dragActive,
            sortModeActiveDuringDrag: dragState.sortModeActive,
            elementAtTarget: dragState.elementAtTarget,
            previewAfterDrop: !!document.querySelector('.ws-pointer-drag-preview'),
            rootOrder: config.workspaces.map(ws => ws.id),
            deepGroupId: deep ? String(deep.groupId || '') : '',
            deepParentId: deepParent ? String(deepParent.id || '') : '',
            groupRoots
        };
    }, duringDrag);

    if (!result.highlightedDuringDrag || !result.previewDuringDrag || result.previewAfterDrop) {
        throw new Error(`Expected Add/Drop highlight and transient pointer preview: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.rootOrder.join('|') !== 'group-root|outside|deep') {
        throw new Error(`Expected deep tab promoted to root level: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.deepGroupId || result.deepParentId) {
        throw new Error(`Expected promoted tab outside group and parent: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.groupRoots.join('|') !== 'group-root') {
        throw new Error(`Expected group roots to no longer include promoted tab: ${JSON.stringify(result, null, 2)}`);
    }
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });
        await waitForApp(page);
        await seedState(page);
        await runSmoke(page);
        console.log('SIDEBAR_ADD_DROP_PROMOTE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
