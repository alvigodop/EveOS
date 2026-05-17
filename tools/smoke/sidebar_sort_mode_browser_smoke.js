const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveTabNavRuntime?.ensurePopover
        && !!window.EveSidebarRuntime?.isSidebarSortModeActive
        && !!window.EveSidebarGroups?.getSidebarOrderMode
    ), undefined, { timeout: 120000 });
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            config = window.config = {
                activeWorkspace: 'main',
                viewMode: 'grid',
                sidebarExpanded: false,
                sidebarHidden: false,
                sidebarOrderMode: 'auto',
                sidebarManualOrder: { root: [], parents: {} },
                sidebarGroups: [
                    { id: 'grp-reading', name: 'Reading Group', color: '#00d4ff', collapsed: false }
                ],
                collapsedTabs: [],
                workspaces: [
                    { id: 'main', name: 'Main', icon: 'M', subTabs: [
                        { id: 'child-a', name: 'Child A', icon: 'A', subTabs: [] },
                        { id: 'child-b', name: 'Child B', icon: 'B', subTabs: [] }
                    ] },
                    { id: 'alt', name: 'Alt', icon: 'B', groupId: 'grp-reading', subTabs: [] }
                ]
            };
            links = window.links = [];
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
            }
            window.renderSidebar();

            const pop = window.EveTabNavRuntime.ensurePopover();
            window.EveTabNavRuntime.updatePopoverState();
            const sortBtn = pop.querySelector('[data-tab-nav-action="toggle-sort-mode"]');
            if (!sortBtn) throw new Error('Sort mode button missing');
            sortBtn.click();
            await new Promise(resolve => setTimeout(resolve, 520));

            const sidebar = document.getElementById('sidebar');
            const childItem = sidebar.querySelector('.ws-item[data-ws-id="child-a"]');
            const childBItem = sidebar.querySelector('.ws-item[data-ws-id="child-b"]');
            const groupHeader = sidebar.querySelector('.ws-group-header');
            if (!childItem) throw new Error('Child tab item missing');
            if (!childBItem) throw new Error('Second child tab item missing');
            if (!groupHeader) throw new Error('Group header missing');

            const childHost = sidebar.querySelector('.ws-node-wrapper[data-ws-id="main"] > .ws-node-children');
            const firstChildSlot = childHost
                ? Array.from(childHost.children).find(element => element.classList.contains('ws-order-slot'))
                : null;
            if (!firstChildSlot) throw new Error('Child sort slot missing');

            let nativeDragStartCount = 0;
            childBItem.addEventListener('dragstart', () => { nativeDragStartCount += 1; });
            const originalElementFromPoint = document.elementFromPoint.bind(document);
            document.elementFromPoint = function () { return firstChildSlot; };
            childBItem.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                pointerId: 10,
                button: 0,
                clientX: 40,
                clientY: 140
            }));
            childBItem.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true,
                cancelable: true,
                pointerId: 10,
                button: 0,
                clientX: 43,
                clientY: 144
            }));
            childBItem.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                pointerId: 10,
                button: 0,
                clientX: 43,
                clientY: 144
            }));
            document.elementFromPoint = originalElementFromPoint;
            await new Promise(resolve => setTimeout(resolve, 120));

            const childOrderAfterPointerSort = config.workspaces[0].subTabs.map(tab => tab.id);

            const beforeClickWorkspace = config.activeWorkspace;
            const childItemAfterSort = sidebar.querySelector('.ws-item[data-ws-id="child-a"]');
            const groupHeaderAfterSort = sidebar.querySelector('.ws-group-header');
            childItemAfterSort.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
            childItemAfterSort.click();
            groupHeaderAfterSort.click();
            await new Promise(resolve => setTimeout(resolve, 80));

            const afterSortClickWorkspace = config.activeWorkspace;
            const afterSortClickOverview = String(config.groupOverviewId || '');

            const stateDuringSort = {
                sortActive: window.EveSidebarRuntime.isSidebarSortModeActive(),
                sidebarExpanded: !!config.sidebarExpanded,
                orderMode: window.EveSidebarGroups.getSidebarOrderMode(config),
                hasSortClass: sidebar.classList.contains('ws-sort-mode-active'),
                orderSlotCount: sidebar.querySelectorAll('.ws-order-slot').length,
                visibleOrderSlotCount: Array.from(sidebar.querySelectorAll('.ws-order-slot')).filter(slot => {
                    const styles = getComputedStyle(slot);
                    return styles.pointerEvents !== 'none' && Number(styles.opacity || 0) > 0.3;
                }).length,
                childItemNativeDraggable: childBItem.draggable,
                nativeDragStartCount,
                childOrderAfterPointerSort,
                beforeClickWorkspace,
                afterSortClickWorkspace,
                afterSortClickOverview
            };

            sortBtn.click();
            await new Promise(resolve => setTimeout(resolve, 520));
            const childItemAfterExit = document
                .getElementById('sidebar')
                .querySelector('.ws-item[data-ws-id="child-a"]');
            if (!childItemAfterExit) throw new Error('Child tab item missing after sorting mode exit');
            childItemAfterExit.click();
            await new Promise(resolve => setTimeout(resolve, 80));

            return {
                stateDuringSort,
                sortActiveAfterExit: window.EveSidebarRuntime.isSidebarSortModeActive(),
                workspaceAfterExitClick: config.activeWorkspace,
                sortButtonLabelAfterExit: sortBtn.textContent.trim()
            };
        });

        if (!result.stateDuringSort.sortActive) {
            throw new Error(`Expected sorting mode active: ${JSON.stringify(result)}`);
        }
        if (!result.stateDuringSort.sidebarExpanded) {
            throw new Error(`Expected sorting mode to expand sidebar: ${JSON.stringify(result)}`);
        }
        if (result.stateDuringSort.orderMode !== 'manual') {
            throw new Error(`Expected sorting mode to enable manual order: ${JSON.stringify(result)}`);
        }
        if (!result.stateDuringSort.hasSortClass || result.stateDuringSort.visibleOrderSlotCount < 2) {
            throw new Error(`Expected visible sort slots in sidebar: ${JSON.stringify(result)}`);
        }
        if (result.stateDuringSort.childItemNativeDraggable || result.stateDuringSort.nativeDragStartCount !== 0) {
            throw new Error(`Expected sort mode to suppress native tab drag image: ${JSON.stringify(result)}`);
        }
        if (result.stateDuringSort.childOrderAfterPointerSort.join('|') !== 'child-b|child-a') {
            throw new Error(`Expected pointer sort mode to reorder child tabs: ${JSON.stringify(result)}`);
        }
        if (result.stateDuringSort.afterSortClickWorkspace !== result.stateDuringSort.beforeClickWorkspace) {
            throw new Error(`Expected sort-mode tab click not to navigate: ${JSON.stringify(result)}`);
        }
        if (result.stateDuringSort.afterSortClickOverview) {
            throw new Error(`Expected sort-mode group click not to enter overview: ${JSON.stringify(result)}`);
        }
        if (result.sortActiveAfterExit) {
            throw new Error(`Expected sorting mode to exit: ${JSON.stringify(result)}`);
        }
        if (result.workspaceAfterExitClick !== 'child-a') {
            throw new Error(`Expected normal tab click after sorting exit, got ${JSON.stringify(result)}`);
        }

        console.log('SIDEBAR_SORT_MODE_BROWSER_SMOKE_OK');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
