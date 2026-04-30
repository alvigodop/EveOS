const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function repoPath(relativePath) {
    return path.join(REPO_ROOT, relativePath);
}

async function loadSidebarRuntime(page) {
    await page.setContent('<!doctype html><html><body><div id="sidebar"></div></body></html>');

    for (const cssPath of [
        'js/modules/ui/sidebar.base.css',
        'js/modules/ui/sidebar.tree.css'
    ]) {
        await page.addStyleTag({ path: repoPath(cssPath) });
    }

    await page.evaluate(() => {
        window.config = {
            activeWorkspace: 'groupRoot',
            viewMode: 'grid',
            sidebarExpanded: true,
            sidebarHidden: false,
            sidebarOrderMode: 'manual',
            sidebarManualOrder: { root: [], parents: {} },
            sidebarGroups: [
                {
                    id: 'groupA',
                    name: 'Group A',
                    color: '#00d4ff',
                    collapsed: false,
                    hidden: false,
                    parentWorkspaceId: ''
                }
            ],
            collapsedTabs: [],
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            workspaces: [
                {
                    id: 'groupRoot',
                    name: 'Grouped Root',
                    icon: 'G',
                    groupId: 'groupA',
                    subTabs: [
                        {
                            id: 'child',
                            name: 'Child',
                            icon: 'C',
                            subTabs: [
                                { id: 'leaf1', name: 'Leaf 1', icon: '1', subTabs: [] },
                                { id: 'leaf2', name: 'Leaf 2', icon: '2', subTabs: [] }
                            ]
                        }
                    ]
                },
                {
                    id: 'outside',
                    name: 'Outside',
                    icon: 'O',
                    subTabs: []
                }
            ]
        };
        window.links = [];
        window.bookmarkFolders = {};
        window.saveConfig = function () {};
        window.renderDashboard = function () {};
        window.switchWorkspace = function (id) { window.config.activeWorkspace = id; };
        window.openWorkspaceModal = function () {};
        window.showUnidexContextMenu = function () {};
        window.showWsContext = function () {};
        window.showWsPopout = function () {};
        window.hideWsPopout = function () {};
        window.showToast = function () {};
    });

    for (const modulePath of [
        'js/modules/core/workspace-helpers.js',
        'js/modules/ui/sidebar-groups.shared.js',
        'js/modules/ui/sidebar-groups.order.js',
        'js/modules/ui/sidebar-groups.mutations.js',
        'js/modules/ui/sidebar-groups.js',
        'js/modules/ui/sidebar.runtime.view-state.js',
        'js/modules/ui/sidebar.runtime.shared.js',
        'js/modules/ui/sidebar.runtime.interactions.js',
        'js/modules/ui/sidebar.runtime.groups.js',
        'js/modules/ui/sidebar.runtime.workspace.pointer-drag.js',
        'js/modules/ui/sidebar.runtime.workspace.item.js',
        'js/modules/ui/sidebar.runtime.workspace.js',
        'js/modules/ui/sidebar.popout.js',
        'js/modules/ui/sidebar.scaffold.js',
        'js/modules/ui/sidebar.js'
    ]) {
        await page.addScriptTag({ path: repoPath(modulePath) });
    }
}

async function runSmoke(page) {
    return page.evaluate(async () => {
        window.EveSidebarGroups.ensureConfigDefaults(window.config);
        window.renderSidebar();
        await new Promise(resolve => requestAnimationFrame(resolve));

        const source = document.querySelector('.ws-node-wrapper[data-ws-id="leaf2"] > .ws-item');
        const childHost = document.querySelector('.ws-node-wrapper[data-ws-id="child"] > .ws-node-children');
        const firstSlot = childHost
            ? Array.from(childHost.children).find(element => element.classList.contains('ws-order-slot'))
            : null;

        if (!source || !firstSlot) {
            return {
                ok: false,
                reason: 'Missing source row or child reorder slot',
                sourceFound: !!source,
                firstSlotFound: !!firstSlot
            };
        }

        const originalElementFromPoint = document.elementFromPoint.bind(document);
        document.elementFromPoint = function () { return firstSlot; };

        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            pointerId: 1,
            button: 0,
            clientX: 20,
            clientY: 80
        }));
        source.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            button: 0,
            clientX: 30,
            clientY: 96
        }));
        source.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            pointerId: 1,
            button: 0,
            clientX: 30,
            clientY: 96
        }));

        document.elementFromPoint = originalElementFromPoint;

        const groupHeader = document.querySelector('.ws-group-section[data-group-id="groupA"] > .ws-group-header');
        const promotedSource = document.querySelector('.ws-node-wrapper[data-ws-id="leaf1"] > .ws-item');
        const groupHeaderHasPointerDrop = typeof (groupHeader && groupHeader.__eveSidebarApplyPointerDrop) === 'function';

        if (promotedSource && groupHeader) {
            document.elementFromPoint = function () { return groupHeader; };

            promotedSource.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                pointerId: 2,
                button: 0,
                clientX: 20,
                clientY: 120
            }));
            promotedSource.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true,
                pointerId: 2,
                button: 0,
                clientX: 46,
                clientY: 140
            }));
            promotedSource.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                pointerId: 2,
                button: 0,
                clientX: 46,
                clientY: 140
            }));

            document.elementFromPoint = originalElementFromPoint;
        }

        const child = window.EveWorkspaceHelpers.findById(window.config.workspaces, 'child');
        const groupRoot = window.EveWorkspaceHelpers.findById(window.config.workspaces, 'groupRoot');
        const leaf1 = window.EveWorkspaceHelpers.findById(window.config.workspaces, 'leaf1');
        const leaf1Parent = window.EveWorkspaceHelpers.findParent(window.config.workspaces, 'leaf1');
        const groupRoots = window.EveSidebarGroups.getGroupRoots('groupA', window.config).map(tab => tab.id);
        const leafOrder = Array.isArray(child && child.subTabs)
            ? child.subTabs.map(tab => tab.id)
            : [];
        const manualOrder = window.config.sidebarManualOrder
            && window.config.sidebarManualOrder.parents
            ? window.config.sidebarManualOrder.parents.child || []
            : [];

        return {
            ok: leafOrder.join('|') === 'leaf2'
                && groupRoot
                && groupRoot.groupId === 'groupA'
                && leaf1
                && leaf1.groupId === 'groupA'
                && !leaf1Parent
                && groupRoots.join('|') === 'groupRoot|leaf1'
                && manualOrder.join('|') === 'workspace:leaf2'
                && source.draggable
                && typeof source.onpointermove === 'function'
                && typeof firstSlot.__eveSidebarApplyPointerDrop === 'function'
                && groupHeaderHasPointerDrop,
            leafOrder,
            manualOrder,
            groupRootGroupId: groupRoot ? groupRoot.groupId || '' : '',
            leaf1GroupId: leaf1 ? leaf1.groupId || '' : '',
            leaf1ParentId: leaf1Parent ? leaf1Parent.id || '' : '',
            groupRoots,
            sourceDraggable: source.draggable,
            hasPointerMove: typeof source.onpointermove === 'function',
            slotHasPointerDrop: typeof firstSlot.__eveSidebarApplyPointerDrop === 'function',
            groupHeaderHasPointerDrop
        };
    });
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

    try {
        await loadSidebarRuntime(page);
        const result = await runSmoke(page);
        if (!result.ok) {
            throw new Error(`Sidebar nested pointer drag smoke failed: ${JSON.stringify(result, null, 2)}`);
        }
        console.log('SIDEBAR_NESTED_POINTER_DRAG_BROWSER_SMOKE_OK');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
