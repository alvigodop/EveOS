const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && typeof window.showWsContext === 'function'
        && typeof window.openWorkspaceModal === 'function'
        && !!window.EveSidebarGroups
        && !!window.EveWorkspaceHelpers?.findById
    ), undefined, { timeout: 180000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        const groupedRoot = {
            id: 'group-root',
            name: 'Grouped Root',
            icon: 'G',
            groupId: 'reading-group',
            subTabs: [{
                id: 'group-child',
                name: 'Grouped Child',
                icon: 'C',
                subTabs: [{
                    id: 'group-grandchild',
                    name: 'Grouped Grandchild',
                    icon: 'D',
                    subTabs: []
                }]
            }]
        };

        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'M', subTabs: [{ id: 'main-child', name: 'Main Child', icon: 'S', subTabs: [] }] },
                groupedRoot
            ],
            sidebarGroups: [{ id: 'reading-group', name: 'Reading Group', color: '#00d4ff', collapsed: false }],
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: true,
            showInactiveTabs: true,
            collapsedTabs: []
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};
        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }
        window.EveSidebarGroups.ensureConfigDefaults(config);
        window.renderSidebar();
        window.initContextMenus?.();
        window.initModals?.();
    });
}

async function readContextMenu(page, workspaceId) {
    return page.evaluate((id) => {
        window.showWsContext({
            preventDefault() {},
            stopPropagation() {},
            clientX: 24,
            clientY: 24
        }, id);

        const menu = document.getElementById('sidebar-context-menu');
        return Array.from(menu.querySelectorAll('.ctx-item'))
            .filter((item) => item.style.display !== 'none')
            .map((item) => (item.textContent || '').replace(/\s+/g, ' ').trim());
    }, workspaceId);
}

function assertMenuShape(workspaceId, labels) {
    const joined = labels.join(' | ');
    ['Edit', 'Add Sub-Tab', 'Create Shortcut', 'Make Inactive', 'Delete'].forEach((expected) => {
        if (!joined.includes(expected)) {
            throw new Error(`Expected ${workspaceId} context menu to include "${expected}", got ${JSON.stringify(labels)}`);
        }
    });
    ['View State', 'Move To Group', 'Change Group', 'Remove From Group'].forEach((removed) => {
        if (joined.includes(removed)) {
            throw new Error(`Expected ${workspaceId} context menu not to duplicate "${removed}", got ${JSON.stringify(labels)}`);
        }
    });
}

async function readWorkspaceModal(page, workspaceId) {
    return page.evaluate((id) => {
        window.openWorkspaceModal(id);
        const groupRow = document.getElementById('wsGroupRow');
        const stateRow = document.getElementById('wsStateRow');
        const groupSelect = document.getElementById('wsGroupId');
        const status = document.getElementById('wsGroupStatus');
        return {
            groupVisible: !!groupRow && groupRow.style.display !== 'none',
            stateVisible: !!stateRow && stateRow.style.display !== 'none',
            groupDisabled: !!groupSelect?.disabled,
            groupValue: groupSelect?.value || '',
            status: status?.textContent || ''
        };
    }, workspaceId);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page);

        for (const id of ['main', 'main-child', 'group-root', 'group-child', 'group-grandchild']) {
            assertMenuShape(id, await readContextMenu(page, id));
        }

        const groupedRoot = await readWorkspaceModal(page, 'group-root');
        if (!groupedRoot.groupVisible || !groupedRoot.stateVisible || groupedRoot.groupDisabled || groupedRoot.groupValue !== 'reading-group') {
            throw new Error(`Grouped root edit modal did not expose editable group/state controls: ${JSON.stringify(groupedRoot)}`);
        }
        if (!/Reading Group/.test(groupedRoot.status)) {
            throw new Error(`Grouped root status should name the assigned group: ${JSON.stringify(groupedRoot)}`);
        }

        const groupedGrandchild = await readWorkspaceModal(page, 'group-grandchild');
        if (!groupedGrandchild.groupVisible || !groupedGrandchild.stateVisible || !groupedGrandchild.groupDisabled) {
            throw new Error(`Grouped grandchild edit modal should expose read-only inherited group/state controls: ${JSON.stringify(groupedGrandchild)}`);
        }
        if (!/Reading Group/.test(groupedGrandchild.status)) {
            throw new Error(`Grouped grandchild status should inherit the root group name: ${JSON.stringify(groupedGrandchild)}`);
        }

        console.log('SIDEBAR_WORKSPACE_CONTEXT_MODAL_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
