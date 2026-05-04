// Smoke test for:
//   1. Bulk Card-move: selecting all bookmarks of a folder transfers the folder
//      to the destination card and leaves no empty copy in the source card.
//   2. Bulk Tab-move: same, but moving across workspaces. The source card must
//      not retain a ghost copy of a fully-covered folder.
//   3. Bulk Merge: selected bookmarks sharing the same title collapse into one
//      base via the bulk Merge action.

const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildConfig(activeWorkspace = 'main') {
    return {
        activeWorkspace,
        viewMode: 'grid',
        showInactiveTabs: true,
        workspaces: [
            { id: 'main', name: 'Main', icon: 'folder', subTabs: [] },
            { id: 'other', name: 'Other', icon: 'folder', subTabs: [] }
        ],
        categoryOrder: ['Alpha', 'Beta'],
        categoryOrderByWorkspace: {
            main: ['Alpha', 'Beta'],
            other: ['Alpha']
        },
        hideStats: [],
        hideStatsScoped: []
    };
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && !!window.EveBookmarkFolders?.transferFolderToCategory
        && !!window.EveBookmarkFolders?.removeFolderNodesById
        && !!window.EveBookmarkMerge?.mergeDuplicateGroup
        && !!window.EveBulkToolbar?.actionsReady
        && typeof window.bulkMerge === 'function'
        && typeof window.confirmBulkMerge === 'function'
        && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt
    ), undefined, { timeout: 120000 });
    await page.waitForTimeout(250);
}

async function seedState(page, payload) {
    await page.evaluate(async (seed) => {
        config = JSON.parse(JSON.stringify(seed.config));
        links = JSON.parse(JSON.stringify(seed.links));
        bookmarkFolders = {};
        window.config = config;
        window.links = links;
        window.bookmarkFolders = bookmarkFolders;
        window.showToast = function () {};
        window.showConfirm = async function () { return true; };
        window.saveData = function () {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        const folderShared = window.EveBookmarkFolders?._shared || null;
        if (typeof folderShared?.writeStore === 'function') {
            folderShared.writeStore({}, false);
        }
        Object.keys(seed.bookmarkFolders || {}).forEach((scopedKey) => {
            const parts = String(scopedKey || '').split('::');
            const workspaceId = String(parts[0] || 'main').trim() || 'main';
            const categoryName = String(parts.slice(1).join('::') || 'Unsorted').trim() || 'Unsorted';
            folderShared.setScopedTree(workspaceId, categoryName, seed.bookmarkFolders[scopedKey], { persist: false });
        });

        // Reset bulk selection state
        window.selectedIds = new Set();
        if (window.EveBulkToolbar?.clearSelection) window.EveBulkToolbar.clearSelection();
        if (window.EveBulkToolbar?.setBulkMode) window.EveBulkToolbar.setBulkMode(true);

        window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'bulk-folder-move-merge-seed' } }));
        if (window.EveOS?.DatapackIndex?.rebuild) {
            await window.EveOS.DatapackIndex.rebuild({ reason: 'bulk-folder-move-merge-seed' });
        }
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }, payload);
}

function snapshotState() {
    return {
        links: (Array.isArray(window.links) ? window.links : []).map((link) => ({
            id: String(link?.id || '').trim(),
            workspace: String(link?.workspace || '').trim(),
            category: String(link?.category || '').trim(),
            folderId: String(link?.folderId || '').trim()
        })).sort((a, b) => a.id.localeCompare(b.id)),
        folders: Object.fromEntries(
            Object.entries(window.eveState?.bookmarkFolders || window.bookmarkFolders || {}).map(([key, tree]) => [
                key,
                {
                    nodeIds: (Array.isArray(tree?.nodes) ? tree.nodes : []).map((n) => String(n.id || '')).sort()
                }
            ])
        )
    };
}

async function runCardMoveWholeFolderPhase(page) {
    await seedState(page, {
        links: [
            { id: 'a-folder-1', title: 'Folder Bookmark 1', url: 'https://example.com/folder1', workspace: 'main', category: 'Alpha', folderId: 'folder-x' },
            { id: 'a-folder-2', title: 'Folder Bookmark 2', url: 'https://example.com/folder2', workspace: 'main', category: 'Alpha', folderId: 'folder-x' },
            { id: 'a-root-1', title: 'Alpha Root Bookmark', url: 'https://example.com/root', workspace: 'main', category: 'Alpha' }
        ],
        bookmarkFolders: {
            'main::Alpha': {
                nodes: [
                    { id: 'folder-x', name: 'Folder X', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
                ],
                settings: { clickBehaviorMode: 'inherit' }
            }
        },
        config: buildConfig('main')
    });

    const result = await page.evaluate((snapshotFnSrc) => {
        const snapshotState = new Function('return (' + snapshotFnSrc + ')')();
        // Select all bookmarks in folder-x (whole folder)
        window.selectedIds = new Set(['a-folder-1', 'a-folder-2']);

        const helpers = window.EveBulkToolbar.ModalModules.createCategoryModalHelpers({
            getLinks: window.EveBulkToolbar.getLinks,
            setLinks: window.EveBulkToolbar.setLinks,
            getConfig: window.EveBulkToolbar.getConfig,
            getSelectedIds: window.EveBulkToolbar.getSelectedIds,
            toBulkId: window.EveBulkToolbar.toBulkId,
            getAllCategoryNames: window.EveBulkToolbar.getAllCategoryNames,
            getVisibleDashboardCategoryNames: window.EveBulkToolbar.getVisibleDashboardCategoryNames,
            escapeBulkMoveHtml: window.EveBulkToolbar.escapeBulkMoveHtml,
            getSelectedCategoryName: window.EveBulkToolbar.getSelectedCategoryName,
            getSelectedWorkspaceForMove: window.EveBulkToolbar.getSelectedWorkspaceForMove,
            getWorkspaceList: window.EveBulkToolbar.getWorkspaceList,
            getSelectedWorkspaceId: window.EveBulkToolbar.getSelectedWorkspaceId,
            addTouchedScope: window.EveBulkToolbar.addTouchedScope,
            formatSelectionSummary: window.EveBulkToolbar.formatSelectionSummary
        });

        // openBulkMoveModal would need DOM; call confirmBulkMove with a simulated radio selection.
        // The internal implementation calls applyBulkCategoryMove via resolveBulkMoveCategory(), which
        // reads a radio input. Bypass the modal and call applyBulkCategoryMove directly via the
        // exposed test seam: use the modal's confirmBulkMove indirectly by injecting a radio + select.
        const overlay = document.getElementById('bulk-move-modal-overlay') || document.body;
        const ensure = (id, tag, attrs = {}) => {
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement(tag);
                el.id = id;
                Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
                overlay.appendChild(el);
            }
            return el;
        };
        const radioExisting = ensure('test-bulk-move-radio', 'input', { type: 'radio', name: 'bulkMoveMode', value: 'existing' });
        radioExisting.checked = true;
        const list = ensure('bulk-move-existing-list', 'div');
        list.dataset.selected = 'Beta';

        const moveResult = helpers.confirmBulkMove();
        return {
            moveResult,
            after: snapshotState()
        };
    }, snapshotState.toString());

    const after = result.after;

    // Expect: Beta has folder-x with both bookmarks; Alpha no longer has folder-x.
    const alpha = after.folders['main::Alpha'];
    const beta = after.folders['main::Beta'];
    if (alpha && alpha.nodeIds.includes('folder-x')) {
        throw new Error('[card-move] Source card still has the moved folder node. ' + JSON.stringify(after));
    }
    if (!beta || !beta.nodeIds.includes('folder-x')) {
        throw new Error('[card-move] Destination card is missing the transferred folder. ' + JSON.stringify(after));
    }
    const folderLinks = after.links.filter((l) => l.folderId === 'folder-x');
    if (folderLinks.length !== 2 || folderLinks.some((l) => l.category !== 'Beta' || l.workspace !== 'main')) {
        throw new Error('[card-move] Folder bookmarks did not follow into Beta. ' + JSON.stringify(after));
    }
    const rootLink = after.links.find((l) => l.id === 'a-root-1');
    if (!rootLink || rootLink.category !== 'Alpha') {
        throw new Error('[card-move] Unselected root bookmark must stay in Alpha. ' + JSON.stringify(after));
    }
    return result;
}

async function runTabMovePartialCardPhase(page) {
    // Card has folder X (2 bookmarks) and folder Y (1 bookmark). Select the 2 in X, move
    // to "other" tab. Expect: source still has Y, source loses X (no ghost), target has X.
    await seedState(page, {
        links: [
            { id: 'm-x-1', title: 'X Link 1', url: 'https://example.com/x1', workspace: 'main', category: 'Alpha', folderId: 'folder-x' },
            { id: 'm-x-2', title: 'X Link 2', url: 'https://example.com/x2', workspace: 'main', category: 'Alpha', folderId: 'folder-x' },
            { id: 'm-y-1', title: 'Y Link 1', url: 'https://example.com/y1', workspace: 'main', category: 'Alpha', folderId: 'folder-y' }
        ],
        bookmarkFolders: {
            'main::Alpha': {
                nodes: [
                    { id: 'folder-x', name: 'Folder X', parentId: null, order: 0, createdAt: 1, updatedAt: 1 },
                    { id: 'folder-y', name: 'Folder Y', parentId: null, order: 1, createdAt: 1, updatedAt: 1 }
                ],
                settings: { clickBehaviorMode: 'inherit' }
            }
        },
        config: buildConfig('main')
    });

    const result = await page.evaluate((snapshotFnSrc) => {
        const snapshotState = new Function('return (' + snapshotFnSrc + ')')();
        window.selectedIds = new Set(['m-x-1', 'm-x-2']);

        const helpers = window.EveBulkToolbar.ModalModules.createWorkspaceModalHelpers({
            getLinks: window.EveBulkToolbar.getLinks,
            setLinks: window.EveBulkToolbar.setLinks,
            getConfig: window.EveBulkToolbar.getConfig,
            getSelectedIds: window.EveBulkToolbar.getSelectedIds,
            toBulkId: window.EveBulkToolbar.toBulkId,
            escapeBulkMoveHtml: window.EveBulkToolbar.escapeBulkMoveHtml,
            getAllCategoryNames: window.EveBulkToolbar.getAllCategoryNames,
            getSelectedCategoryName: window.EveBulkToolbar.getSelectedCategoryName,
            getWorkspaceList: window.EveBulkToolbar.getWorkspaceList,
            getSelectedWorkspaceId: window.EveBulkToolbar.getSelectedWorkspaceId,
            addTouchedScope: window.EveBulkToolbar.addTouchedScope,
            formatSelectionSummary: window.EveBulkToolbar.formatSelectionSummary
        });

        // Stub the DOM bits confirmBulkTabMove reads
        const ensure = (id, tag, attrs = {}) => {
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement(tag);
                el.id = id;
                Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
                document.body.appendChild(el);
            }
            return el;
        };
        const tabRadio = ensure('test-bulk-tab-mode', 'input', { type: 'radio', name: 'bulkTabMode', value: 'existing' });
        tabRadio.checked = true;
        const tabList = ensure('bulk-tab-existing-list', 'div');
        tabList.dataset.selected = 'other';
        const tabCardRadio = ensure('test-bulk-tab-card-mode', 'input', { type: 'radio', name: 'bulkTabCardMode', value: 'existing' });
        tabCardRadio.checked = true;
        const tabCardList = ensure('bulk-tab-card-existing-list', 'div');
        tabCardList.dataset.selected = 'Alpha';

        const moveResult = helpers.confirmBulkTabMove();
        return { moveResult, after: snapshotState() };
    }, snapshotState.toString());

    const after = result.after;
    const sourceAlpha = after.folders['main::Alpha'];
    const targetAlpha = after.folders['other::Alpha'];

    if (!sourceAlpha || sourceAlpha.nodeIds.includes('folder-x')) {
        throw new Error('[tab-move] Source card kept ghost copy of fully-covered folder X. ' + JSON.stringify(after));
    }
    if (!sourceAlpha.nodeIds.includes('folder-y')) {
        throw new Error('[tab-move] Source card lost untouched folder Y. ' + JSON.stringify(after));
    }
    if (!targetAlpha || !targetAlpha.nodeIds.includes('folder-x')) {
        throw new Error('[tab-move] Destination card missing the transferred folder X. ' + JSON.stringify(after));
    }
    const xLinks = after.links.filter((l) => l.folderId === 'folder-x');
    if (xLinks.length !== 2 || xLinks.some((l) => l.workspace !== 'other' || l.category !== 'Alpha')) {
        throw new Error('[tab-move] Folder X bookmarks did not follow to other/Alpha. ' + JSON.stringify(after));
    }
    const yLink = after.links.find((l) => l.id === 'm-y-1');
    if (!yLink || yLink.workspace !== 'main' || yLink.category !== 'Alpha' || yLink.folderId !== 'folder-y') {
        throw new Error('[tab-move] Y bookmark must stay in main/Alpha/folder-y. ' + JSON.stringify(after));
    }
    return result;
}

async function runBulkMergeTitleModePhase(page) {
    await seedState(page, {
        links: [
            { id: 'merge-1', title: 'Same Title', url: 'https://example.com/a', workspace: 'main', category: 'Alpha' },
            { id: 'merge-2', title: 'Same Title', url: 'https://example.com/b', workspace: 'main', category: 'Alpha' },
            { id: 'merge-3', title: 'Same Title', url: 'https://example.com/c', workspace: 'main', category: 'Beta' },
            { id: 'unique-1', title: 'Different Title', url: 'https://example.com/d', workspace: 'main', category: 'Alpha' }
        ],
        bookmarkFolders: {},
        config: buildConfig('main')
    });

    const result = await page.evaluate((snapshotFnSrc) => {
        const snapshotState = new Function('return (' + snapshotFnSrc + ')')();
        window.selectedIds = new Set(['merge-1', 'merge-2', 'merge-3', 'unique-1']);
        window.showConfirm = async function () { return true; };

        // Open modal, choose 'title' mode (default), confirm.
        window.bulkMerge();
        if (typeof window.setBulkMergeMode === 'function') window.setBulkMergeMode('title');
        window.confirmBulkMerge();
        return Promise.resolve().then(() => ({ after: snapshotState() }));
    }, snapshotState.toString());

    const after = result.after;
    const remainingMerge = after.links.filter((l) => l.id === 'merge-1' || l.id === 'merge-2' || l.id === 'merge-3');
    if (remainingMerge.length !== 1) {
        throw new Error('[merge-title] Expected 1 base bookmark to remain from the duplicate group, got ' + remainingMerge.length + '. ' + JSON.stringify(after));
    }
    const uniqueLink = after.links.find((l) => l.id === 'unique-1');
    if (!uniqueLink) {
        throw new Error('[merge-title] Non-duplicate bookmark must not be removed. ' + JSON.stringify(after));
    }
    return result;
}

async function runBulkMergeAllModePhase(page) {
    // Different titles, but user knows they're the same thing — pick a base explicitly.
    await seedState(page, {
        links: [
            { id: 'monarch-1', title: 'Monarch', url: 'https://example.com/monarch', workspace: 'main', category: 'Alpha' },
            { id: 'monarch-2', title: 'Monarch: The Monster Legacy', url: 'https://example.com/monarch-legacy', workspace: 'main', category: 'Alpha' },
            { id: 'unrelated-1', title: 'Something Else', url: 'https://example.com/other', workspace: 'main', category: 'Alpha' }
        ],
        bookmarkFolders: {},
        config: buildConfig('main')
    });

    const result = await page.evaluate((snapshotFnSrc) => {
        const snapshotState = new Function('return (' + snapshotFnSrc + ')')();
        window.selectedIds = new Set(['monarch-1', 'monarch-2']);
        window.showConfirm = async function () { return true; };

        window.bulkMerge();
        window.setBulkMergeMode('all');
        // Pick 'monarch-2' (the longer title) as the base
        const baseRadio = document.querySelector('input[name="bulkMergeBase"][value="monarch-2"]');
        if (baseRadio) baseRadio.checked = true;
        window.confirmBulkMerge();
        return Promise.resolve().then(() => ({ after: snapshotState() }));
    }, snapshotState.toString());

    const after = result.after;
    const baseLink = after.links.find((l) => l.id === 'monarch-2');
    const droppedLink = after.links.find((l) => l.id === 'monarch-1');
    if (!baseLink) {
        throw new Error('[merge-all] Selected base bookmark must remain. ' + JSON.stringify(after));
    }
    if (droppedLink) {
        throw new Error('[merge-all] Non-base bookmark in the merge should be removed. ' + JSON.stringify(after));
    }
    const unrelated = after.links.find((l) => l.id === 'unrelated-1');
    if (!unrelated) {
        throw new Error('[merge-all] Unselected bookmark must not be removed. ' + JSON.stringify(after));
    }
    return result;
}

async function runPickerRenderPhase(page) {
    // Verify the manhua-style row picker renders rows with counts and that
    // clicking a row updates dataset.selected on the listbox container.
    await seedState(page, {
        links: [
            { id: 'p-a-1', title: 'A1', url: 'https://example.com/a1', workspace: 'main', category: 'Alpha' },
            { id: 'p-a-2', title: 'A2', url: 'https://example.com/a2', workspace: 'main', category: 'Alpha' },
            { id: 'p-a-3', title: 'A3', url: 'https://example.com/a3', workspace: 'main', category: 'Alpha' },
            { id: 'p-b-1', title: 'B1', url: 'https://example.com/b1', workspace: 'main', category: 'Beta' },
            { id: 'p-other-1', title: 'O1', url: 'https://example.com/o1', workspace: 'other', category: 'Alpha' }
        ],
        bookmarkFolders: {},
        config: buildConfig('main')
    });

    const result = await page.evaluate(() => {
        window.selectedIds = new Set(['p-a-1']);
        // Open card-move modal
        window.bulkMove();
        const list = document.getElementById('bulk-move-existing-list');
        const initialRows = Array.from(list?.querySelectorAll('.bulk-target-row') || []).map((row) => ({
            value: row.getAttribute('data-value'),
            count: Number(String(row.querySelector('.bulk-target-row-count')?.textContent || '0').trim()),
            selected: row.classList.contains('is-selected')
        }));
        const initialSelected = String(list?.dataset.selected || '');

        // Click the Beta row
        const betaRow = Array.from(list?.querySelectorAll('.bulk-target-row[data-value="Beta"]') || [])[0];
        if (betaRow) betaRow.click();
        const afterClickSelected = String(list?.dataset.selected || '');
        const betaIsSelected = !!betaRow?.classList.contains('is-selected');

        // Filter test
        const filter = document.getElementById('bulk-move-card-filter');
        if (filter) {
            filter.value = 'bet';
            filter.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const filteredRows = Array.from(list?.querySelectorAll('.bulk-target-row') || []).map((row) => row.getAttribute('data-value'));

        if (typeof window.closeBulkMoveModal === 'function') window.closeBulkMoveModal();

        return { initialRows, initialSelected, afterClickSelected, betaIsSelected, filteredRows };
    });

    const alphaRow = result.initialRows.find((r) => r.value === 'Alpha');
    const betaRow = result.initialRows.find((r) => r.value === 'Beta');
    if (!alphaRow || alphaRow.count !== 3) {
        throw new Error('[picker] Alpha row missing or wrong count: ' + JSON.stringify(result));
    }
    if (!betaRow || betaRow.count !== 1) {
        throw new Error('[picker] Beta row missing or wrong count: ' + JSON.stringify(result));
    }
    if (!result.initialSelected) {
        throw new Error('[picker] No initial selection on the listbox: ' + JSON.stringify(result));
    }
    if (result.afterClickSelected !== 'Beta' || !result.betaIsSelected) {
        throw new Error('[picker] Click did not select the Beta row: ' + JSON.stringify(result));
    }
    if (!result.filteredRows.includes('Beta') || result.filteredRows.includes('Alpha')) {
        throw new Error('[picker] Filter did not narrow rows: ' + JSON.stringify(result));
    }
    return result;
}

async function main() {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.error('[console.error]', msg.text());
    });

    try {
        await page.goto(FILE_URL);
        await waitForApp(page);

        console.log('Phase 1: Bulk Card-move whole folder');
        await runCardMoveWholeFolderPhase(page);
        console.log('  ✓ folder transferred, no ghost in source');

        console.log('Phase 2: Bulk Tab-move partial card with whole folder');
        await runTabMovePartialCardPhase(page);
        console.log('  ✓ source ghost folder removed, target has folder');

        console.log('Phase 3: Bulk Merge — title mode');
        await runBulkMergeTitleModePhase(page);
        console.log('  ✓ duplicates collapsed into single base');

        console.log('Phase 4: Bulk Merge — all-as-one mode (different titles)');
        await runBulkMergeAllModePhase(page);
        console.log('  ✓ different-title selection collapsed into picked base');

        console.log('All bulk-select folder-move + merge smoke checks passed.');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
