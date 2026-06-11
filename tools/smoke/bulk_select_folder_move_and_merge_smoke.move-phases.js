const { buildConfig, seedState, snapshotState } = require('./bulk_select_folder_move_and_merge_smoke.fixture');

async function runCardMoveWholeFolderPhase(page) {
    await seedState(page, {
        links: [
            { id: 'a-folder-1', title: 'Folder Bookmark 1', url: 'https://example.com/folder1', workspace: 'main', category: 'Alpha', folderId: 'folder-x' },
            { id: 'a-folder-2', title: 'Folder Bookmark 2', url: 'https://example.com/folder2', workspace: 'main', category: 'Alpha', folderId: 'folder-x' },
            { id: 'a-root-1', title: 'Alpha Root Bookmark', url: 'https://example.com/root', workspace: 'main', category: 'Alpha' },
            { id: 'other-folder-1', title: 'Other Scoped Bookmark', url: 'https://example.com/other-folder', workspace: 'other', category: 'Alpha', folderId: 'folder-x' }
        ],
        bookmarkFolders: {
            'main::Alpha': {
                nodes: [
                    { id: 'folder-x', name: 'Folder X', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
                ],
                settings: { clickBehaviorMode: 'inherit' }
            },
            'other::Alpha': {
                nodes: [
                    { id: 'folder-x', name: 'Other Folder X', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
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
    const folderLinks = after.links.filter((l) => l.id === 'a-folder-1' || l.id === 'a-folder-2');
    if (folderLinks.length !== 2 || folderLinks.some((l) => l.category !== 'Beta' || l.workspace !== 'main')) {
        throw new Error('[card-move] Folder bookmarks did not follow into Beta. ' + JSON.stringify(after));
    }
    const rootLink = after.links.find((l) => l.id === 'a-root-1');
    if (!rootLink || rootLink.category !== 'Alpha') {
        throw new Error('[card-move] Unselected root bookmark must stay in Alpha. ' + JSON.stringify(after));
    }
    const otherScopedLink = after.links.find((l) => l.id === 'other-folder-1');
    const otherScopedTree = after.folders['other::Alpha'];
    if (!otherScopedLink
        || otherScopedLink.workspace !== 'other'
        || otherScopedLink.category !== 'Alpha'
        || otherScopedLink.folderId !== 'folder-x'
        || !otherScopedTree?.nodeIds.includes('folder-x')) {
        throw new Error('[card-move] Same-ID folder in another scope must remain untouched. ' + JSON.stringify(after));
    }
    return result;
}

async function runCardMovePartialFolderPhase(page) {
    await seedState(page, {
        links: [
            { id: 'partial-folder-1', title: 'Selected Folder Bookmark', url: 'https://example.com/partial-1', workspace: 'main', category: 'Alpha', folderId: 'folder-partial' },
            { id: 'partial-folder-2', title: 'Retained Folder Bookmark', url: 'https://example.com/partial-2', workspace: 'main', category: 'Alpha', folderId: 'folder-partial' }
        ],
        bookmarkFolders: {
            'main::Alpha': {
                nodes: [
                    { id: 'folder-partial', name: 'Partial Folder', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
                ],
                settings: { clickBehaviorMode: 'inherit' }
            }
        },
        config: buildConfig('main')
    });

    const result = await page.evaluate((snapshotFnSrc) => {
        const snapshotState = new Function('return (' + snapshotFnSrc + ')')();
        window.selectedIds = new Set(['partial-folder-1']);
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
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'bulkMoveMode';
        radio.value = 'existing';
        radio.checked = true;
        document.body.appendChild(radio);
        const list = document.getElementById('bulk-move-existing-list') || document.createElement('div');
        list.id = 'bulk-move-existing-list';
        list.dataset.selected = 'Beta';
        if (!list.isConnected) document.body.appendChild(list);
        const moveResult = helpers.confirmBulkMove();
        return { moveResult, after: snapshotState() };
    }, snapshotState.toString());

    const moved = result.after.links.find((link) => link.id === 'partial-folder-1');
    const retained = result.after.links.find((link) => link.id === 'partial-folder-2');
    const sourceTree = result.after.folders['main::Alpha'];
    const targetTree = result.after.folders['main::Beta'];
    if (!moved || moved.category !== 'Beta' || moved.folderId) {
        throw new Error('[partial-card-move] Selected bookmark should move without dragging its source folder. ' + JSON.stringify(result.after));
    }
    if (!retained || retained.category !== 'Alpha' || retained.folderId !== 'folder-partial') {
        throw new Error('[partial-card-move] Unselected folder bookmark must remain in place. ' + JSON.stringify(result.after));
    }
    if (!sourceTree?.nodeIds.includes('folder-partial') || targetTree?.nodeIds.includes('folder-partial')) {
        throw new Error('[partial-card-move] Partial selection must retain the source tree only. ' + JSON.stringify(result.after));
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


module.exports = {
    runCardMoveWholeFolderPhase,
    runCardMovePartialFolderPhase,
    runTabMovePartialCardPhase,
    runBulkMergeTitleModePhase,
    runBulkMergeAllModePhase
};
