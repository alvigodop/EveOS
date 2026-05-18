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
            activeWorkspace: 'groupTop',
            viewMode: 'grid',
            sidebarExpanded: true,
            sidebarHidden: false,
            sidebarOrderMode: 'manual',
            sidebarManualOrder: {
                root: ['group:groupA', 'workspace:outside'],
                parents: {
                    grand: ['workspace:deep']
                }
            },
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
                    id: 'groupTop',
                    name: 'Group Top',
                    icon: 'G',
                    groupId: 'groupA',
                    subTabs: [
                        {
                            id: 'child',
                            name: 'Child',
                            icon: 'C',
                            subTabs: [
                                {
                                    id: 'grand',
                                    name: 'Grand',
                                    icon: 'N',
                                    subTabs: [
                                        {
                                            id: 'deep',
                                            name: 'Deep',
                                            icon: 'D',
                                            subTabs: [
                                                { id: 'deepChild', name: 'Deep Child', icon: 'd', subTabs: [] }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                { id: 'nextGroupTop', name: 'Next Group Top', icon: 'N', groupId: 'groupA', subTabs: [] },
                { id: 'outside', name: 'Outside', icon: 'O', subTabs: [] }
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

        const source = document.querySelector('.ws-node-wrapper[data-ws-id="deep"] > .ws-item');
        const groupHeader = document.querySelector('.ws-group-section[data-group-id="groupA"] > .ws-group-header');
        if (!source || !groupHeader) {
            return {
                ok: false,
                reason: 'Missing deep source or group header',
                sourceFound: !!source,
                groupHeaderFound: !!groupHeader
            };
        }
        if (typeof groupHeader.__eveSidebarApplyPointerDrop !== 'function') {
            return { ok: false, reason: 'Group header lacks pointer drop handler' };
        }

        const originalElementFromPoint = document.elementFromPoint.bind(document);
        document.elementFromPoint = function () { return groupHeader; };

        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            pointerId: 9,
            button: 0,
            clientX: 30,
            clientY: 220
        }));
        await new Promise(resolve => setTimeout(resolve, 380));
        source.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 9,
            button: 0,
            clientX: 80,
            clientY: 120
        }));
        source.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            pointerId: 9,
            button: 0,
            clientX: 80,
            clientY: 120
        }));

        document.elementFromPoint = originalElementFromPoint;

        const helpers = window.EveWorkspaceHelpers;
        const groups = window.EveSidebarGroups;
        const deep = helpers.findById(window.config.workspaces, 'deep');
        const deepParent = helpers.findParent(window.config.workspaces, 'deep');
        const grand = helpers.findById(window.config.workspaces, 'grand');
        const groupRoots = groups.getGroupRoots('groupA', window.config).map(workspace => workspace.id);
        const rootOrder = window.config.workspaces.map(workspace => workspace.id);
        const staleGrandOrder = window.config.sidebarManualOrder.parents.grand || [];

        const result = {
            rootOrder,
            groupRoots,
            deepGroupId: deep ? deep.groupId || '' : '',
            deepParentId: deepParent ? deepParent.id || '' : '',
            grandChildren: grand && Array.isArray(grand.subTabs) ? grand.subTabs.map(workspace => workspace.id) : [],
            staleGrandOrder,
            sourceDraggable: source.draggable,
            sourceHasPointerMove: typeof source.onpointermove === 'function',
            groupHeaderHasPointerDrop: typeof groupHeader.__eveSidebarApplyPointerDrop === 'function'
        };

        result.ok = rootOrder.join('|') === 'groupTop|nextGroupTop|deep|outside'
            && groupRoots.join('|') === 'groupTop|nextGroupTop|deep'
            && result.deepGroupId === 'groupA'
            && !result.deepParentId
            && result.grandChildren.length === 0
            && !staleGrandOrder.includes('workspace:deep')
            && !result.sourceDraggable
            && result.sourceHasPointerMove
            && result.groupHeaderHasPointerDrop;

        return result;
    });
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

    try {
        await loadSidebarRuntime(page);
        const result = await runSmoke(page);
        if (!result.ok) {
            throw new Error(`Sidebar deep pointer drag smoke failed: ${JSON.stringify(result, null, 2)}`);
        }
        console.log('SIDEBAR_DEEP_POINTER_DRAG_BROWSER_SMOKE_OK');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
