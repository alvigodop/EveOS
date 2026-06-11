const { buildConfig, seedState, snapshotState } = require('./bulk_select_folder_move_and_merge_smoke.fixture');

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
        // Force the visible-dashboard scan to report both Alpha and Beta by injecting
        // the matching DOM nodes — the dashboard renderer in the smoke harness only
        // produces the first card.
        const grid = document.getElementById('dashboard-grid') || (() => {
            const el = document.createElement('div');
            el.id = 'dashboard-grid';
            document.body.appendChild(el);
            return el;
        })();
        grid.innerHTML = ''
            + '<div class="category-card"><div class="category-title">Alpha</div></div>'
            + '<div class="category-card"><div class="category-title">Beta</div></div>';
        // Open card-move modal
        window.bulkMove();
        const list = document.getElementById('bulk-move-existing-list');
        const initialRows = Array.from(list?.querySelectorAll('.bulk-target-row[data-card][data-folder-id=""]') || []).map((row) => ({
            value: row.getAttribute('data-card'),
            folderId: row.getAttribute('data-folder-id') || '',
            count: Number(String(row.querySelector('.bulk-target-row-count')?.textContent || '0').trim()),
            selected: row.classList.contains('is-selected')
        }));
        const initialSelected = String(list?.dataset.selectedCard || list?.dataset.selected || '');

        // Click the Beta card row (folder-id is empty for card root)
        const betaRow = list?.querySelector('.bulk-target-row[data-card="Beta"][data-folder-id=""]');
        if (betaRow) betaRow.click();
        const afterClickSelected = String(list?.dataset.selectedCard || list?.dataset.selected || '');
        const betaIsSelected = !!betaRow?.classList.contains('is-selected');

        // Filter test
        const filter = document.getElementById('bulk-move-card-filter');
        if (filter) {
            filter.value = 'bet';
            filter.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const filteredRows = Array.from(list?.querySelectorAll('.bulk-target-row[data-card][data-folder-id=""]') || []).map((row) => row.getAttribute('data-card'));

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

async function runSectionCollapsePhase(page) {
    // Verify each modal section collapses when its sibling radio is selected,
    // and that the chevron toggle can collapse/expand independently.
    await seedState(page, {
        links: [
            { id: 'c-a-1', title: 'A1', url: 'https://example.com/c-a1', workspace: 'main', category: 'Alpha' },
            { id: 'c-b-1', title: 'B1', url: 'https://example.com/c-b1', workspace: 'main', category: 'Beta' }
        ],
        bookmarkFolders: {},
        config: buildConfig('main')
    });

    const result = await page.evaluate(() => {
        window.selectedIds = new Set(['c-a-1']);
        if (window.EveBulkToolbar) {
            window.EveBulkToolbar.getVisibleDashboardCategoryNames = function () { return []; };
        }

        // Open Move modal — "existing" should be expanded, "new" collapsed
        window.bulkMove();
        const movedExisting = document.querySelector('.bulk-move-section[data-bulk-section-group="bulkMoveMode"][data-bulk-section-mode="existing"]');
        const movedNew = document.querySelector('.bulk-move-section[data-bulk-section-group="bulkMoveMode"][data-bulk-section-mode="new"]');
        const initialState = {
            existingCollapsed: movedExisting?.classList.contains('is-collapsed'),
            newCollapsed: movedNew?.classList.contains('is-collapsed')
        };

        // Switch to "new" mode — should flip
        window.setBulkMoveMode('new');
        const afterRadioState = {
            existingCollapsed: movedExisting?.classList.contains('is-collapsed'),
            newCollapsed: movedNew?.classList.contains('is-collapsed')
        };

        // Manually toggle the existing section via chevron
        const chevronBtn = movedExisting?.querySelector('.bulk-section-toggle');
        if (chevronBtn) chevronBtn.click();
        const afterChevronExpand = {
            existingCollapsed: movedExisting?.classList.contains('is-collapsed')
        };
        if (chevronBtn) chevronBtn.click();
        const afterChevronCollapse = {
            existingCollapsed: movedExisting?.classList.contains('is-collapsed')
        };

        if (typeof window.closeBulkMoveModal === 'function') window.closeBulkMoveModal();
        return { initialState, afterRadioState, afterChevronExpand, afterChevronCollapse };
    });

    if (result.initialState.existingCollapsed !== false || result.initialState.newCollapsed !== true) {
        throw new Error('[collapse] Initial state wrong (existing should be expanded, new collapsed): ' + JSON.stringify(result));
    }
    if (result.afterRadioState.existingCollapsed !== true || result.afterRadioState.newCollapsed !== false) {
        throw new Error('[collapse] Switching radio did not flip section collapse state: ' + JSON.stringify(result));
    }
    if (result.afterChevronExpand.existingCollapsed !== false) {
        throw new Error('[collapse] Chevron click did not expand collapsed section: ' + JSON.stringify(result));
    }
    if (result.afterChevronCollapse.existingCollapsed !== true) {
        throw new Error('[collapse] Chevron click did not re-collapse section: ' + JSON.stringify(result));
    }
    return result;
}

async function runTabTreePhase(page) {
    // Seed nested workspaces and verify the tab picker renders a collapsible tree
    // (children hidden by default), expanding via chevron, selecting nested tabs,
    // and auto-expanding when filtering.
    const nestedConfig = {
        activeWorkspace: 'main',
        viewMode: 'grid',
        showInactiveTabs: true,
        workspaces: [
            {
                id: 'main', name: 'Main', icon: '📁', subTabs: [
                    {
                        id: 'child-a', name: 'Child A', icon: '📁', subTabs: [
                            { id: 'grand-a', name: 'Grand A', icon: '📁', subTabs: [] }
                        ]
                    }
                ]
            },
            { id: 'other', name: 'Other', icon: '📁', subTabs: [] }
        ],
        categoryOrder: ['Alpha'],
        categoryOrderByWorkspace: { main: ['Alpha'], 'child-a': ['Alpha'], 'grand-a': ['Alpha'], other: ['Alpha'] },
        hideStats: [],
        hideStatsScoped: []
    };

    await seedState(page, {
        links: [
            { id: 't-main-1', title: 'M1', url: 'https://example.com/m1', workspace: 'main', category: 'Alpha' },
            { id: 't-grand-1', title: 'G1', url: 'https://example.com/g1', workspace: 'grand-a', category: 'Alpha' }
        ],
        bookmarkFolders: {},
        config: nestedConfig
    });

    const result = await page.evaluate(() => {
        window.selectedIds = new Set(['t-main-1']);

        // Open Tab modal
        window.bulkWorkspace();

        const list = document.getElementById('bulk-tab-existing-list');
        const initial = {
            topNodeIds: Array.from(list?.querySelectorAll(':scope > .bulk-target-node') || []).map((n) => n.getAttribute('data-tab-id')),
            childAExpanded: list?.querySelector('.bulk-target-node[data-tab-id="child-a"]')?.classList.contains('is-expanded'),
            grandAVisible: !list?.querySelector('.bulk-target-node[data-tab-id="grand-a"]')?.closest('.bulk-target-children[hidden]')
        };

        // Click chevron on "main" to expand its children
        const mainToggle = list?.querySelector('.bulk-target-node[data-tab-id="main"] > .bulk-target-row-wrap > .bulk-target-tree-toggle');
        if (mainToggle) mainToggle.click();
        const afterMainExpand = {
            mainExpanded: list?.querySelector('.bulk-target-node[data-tab-id="main"]')?.classList.contains('is-expanded'),
            childAVisible: !list?.querySelector('.bulk-target-node[data-tab-id="child-a"]')?.closest('.bulk-target-children[hidden]')
        };

        // Expand child-a too
        const childAToggle = list?.querySelector('.bulk-target-node[data-tab-id="child-a"] > .bulk-target-row-wrap > .bulk-target-tree-toggle');
        if (childAToggle) childAToggle.click();
        const grandRow = list?.querySelector('.bulk-target-node[data-tab-id="grand-a"] .bulk-target-row[data-value="grand-a"]');
        const afterGrandReveal = {
            grandRowVisible: !!grandRow && !grandRow.closest('.bulk-target-children[hidden]')
        };

        // Click the grand-a row
        if (grandRow) grandRow.click();
        const afterGrandSelect = {
            datasetSelected: list?.dataset.selected,
            grandIsSelected: grandRow?.classList.contains('is-selected')
        };

        // Filter "other" — should narrow to just 'other' top-level (no auto-expand needed)
        const filter = document.getElementById('bulk-tab-workspace-filter');
        if (filter) {
            filter.value = 'other';
            filter.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const filteredTopIds = Array.from(list?.querySelectorAll(':scope > .bulk-target-node') || []).map((n) => n.getAttribute('data-tab-id'));

        // Filter "grand" — should keep main → child-a → grand-a chain and auto-expand it
        if (filter) {
            filter.value = 'grand';
            filter.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const filteredGrand = {
            topIds: Array.from(list?.querySelectorAll(':scope > .bulk-target-node') || []).map((n) => n.getAttribute('data-tab-id')),
            mainExpanded: list?.querySelector('.bulk-target-node[data-tab-id="main"]')?.classList.contains('is-expanded'),
            childAExpanded: list?.querySelector('.bulk-target-node[data-tab-id="child-a"]')?.classList.contains('is-expanded'),
            grandRowVisible: !!list?.querySelector('.bulk-target-row[data-value="grand-a"]')
                && !list?.querySelector('.bulk-target-row[data-value="grand-a"]')?.closest('.bulk-target-children[hidden]')
        };

        if (typeof window.closeBulkTabModal === 'function') window.closeBulkTabModal();

        return { initial, afterMainExpand, afterGrandReveal, afterGrandSelect, filteredTopIds, filteredGrand };
    });

    if (!result.initial.topNodeIds.includes('main') || !result.initial.topNodeIds.includes('other')) {
        throw new Error('[tab-tree] Top-level tabs missing from initial render: ' + JSON.stringify(result));
    }
    if (result.initial.childAExpanded !== false) {
        throw new Error('[tab-tree] Subtab should start collapsed: ' + JSON.stringify(result));
    }
    if (result.afterMainExpand.mainExpanded !== true || result.afterMainExpand.childAVisible !== true) {
        throw new Error('[tab-tree] Chevron click did not expand main and reveal child-a: ' + JSON.stringify(result));
    }
    if (result.afterGrandReveal.grandRowVisible !== true) {
        throw new Error('[tab-tree] Expanding child-a should reveal grand-a row: ' + JSON.stringify(result));
    }
    if (result.afterGrandSelect.datasetSelected !== 'grand-a' || !result.afterGrandSelect.grandIsSelected) {
        throw new Error('[tab-tree] Clicking grand-a did not select it: ' + JSON.stringify(result));
    }
    if (!result.filteredTopIds.includes('other') || result.filteredTopIds.includes('main')) {
        throw new Error('[tab-tree] Filter "other" did not narrow top-level: ' + JSON.stringify(result));
    }
    if (!result.filteredGrand.topIds.includes('main')
        || result.filteredGrand.mainExpanded !== true
        || result.filteredGrand.childAExpanded !== true
        || result.filteredGrand.grandRowVisible !== true) {
        throw new Error('[tab-tree] Filter "grand" should auto-expand the chain: ' + JSON.stringify(result));
    }
    return result;
}

async function runFolderTargetPhase(page) {
    // Card picker should expose folders within each card; selecting a nested folder
    // should land the bulk-moved bookmarks in that folder (not at the card root).
    await seedState(page, {
        links: [
            { id: 'src-1', title: 'Source 1', url: 'https://example.com/s1', workspace: 'main', category: 'Alpha' },
            { id: 'src-2', title: 'Source 2', url: 'https://example.com/s2', workspace: 'main', category: 'Alpha' },
            { id: 'beta-existing', title: 'Existing in Beta folder', url: 'https://example.com/beta-existing', workspace: 'main', category: 'Beta', folderId: 'beta-folder-x' }
        ],
        bookmarkFolders: {
            'main::Beta': {
                nodes: [
                    { id: 'beta-folder-x', name: 'Folder X', parentId: null, order: 0, createdAt: 1, updatedAt: 1 },
                    { id: 'beta-folder-x-sub', name: 'Sub X', parentId: 'beta-folder-x', order: 0, createdAt: 1, updatedAt: 1 }
                ],
                settings: { clickBehaviorMode: 'inherit' }
            }
        },
        config: buildConfig('main')
    });

    const result = await page.evaluate((snapshotFnSrc) => {
        const snapshotState = new Function('return (' + snapshotFnSrc + ')')();
        window.selectedIds = new Set(['src-1', 'src-2']);
        const grid = document.getElementById('dashboard-grid') || (() => {
            const el = document.createElement('div');
            el.id = 'dashboard-grid';
            document.body.appendChild(el);
            return el;
        })();
        grid.innerHTML = ''
            + '<div class="category-card"><div class="category-title">Alpha</div></div>'
            + '<div class="category-card"><div class="category-title">Beta</div></div>';

        window.bulkMove();
        const list = document.getElementById('bulk-move-existing-list');

        // Verify the Beta card node renders nested folder rows
        const subFolderRow = list?.querySelector('.bulk-target-row[data-card="Beta"][data-folder-id="beta-folder-x-sub"]');
        const folderXRow = list?.querySelector('.bulk-target-row[data-card="Beta"][data-folder-id="beta-folder-x"]');

        // Click the nested sub-folder row
        if (subFolderRow) subFolderRow.click();
        const afterClick = {
            selectedCard: list?.dataset.selectedCard,
            selectedFolder: list?.dataset.selectedFolder,
            subRowSelected: subFolderRow?.classList.contains('is-selected')
        };

        // Apply the move
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
            getWorkspaceTree: window.EveBulkToolbar.getWorkspaceTree,
            getSelectedWorkspaceId: window.EveBulkToolbar.getSelectedWorkspaceId,
            addTouchedScope: window.EveBulkToolbar.addTouchedScope,
            formatSelectionSummary: window.EveBulkToolbar.formatSelectionSummary,
            getBookmarkCountForCard: window.EveBulkToolbar.getBookmarkCountForCard,
            getBookmarkCountForWorkspace: window.EveBulkToolbar.getBookmarkCountForWorkspace,
            getFolderTreeForScope: window.EveBulkToolbar.getFolderTreeForScope,
            getBookmarkCountForFolder: window.EveBulkToolbar.getBookmarkCountForFolder
        });

        const moveResult = helpers.confirmBulkMove();
        if (typeof window.closeBulkMoveModal === 'function') window.closeBulkMoveModal();

        return {
            folderRowsExist: !!folderXRow && !!subFolderRow,
            afterClick,
            moveResult,
            after: snapshotState()
        };
    }, snapshotState.toString());

    if (!result.folderRowsExist) {
        throw new Error('[folder-target] Card picker did not render nested folder rows for Beta: ' + JSON.stringify(result));
    }
    if (result.afterClick.selectedCard !== 'Beta' || result.afterClick.selectedFolder !== 'beta-folder-x-sub' || !result.afterClick.subRowSelected) {
        throw new Error('[folder-target] Click on nested folder row did not update dataset / selection: ' + JSON.stringify(result));
    }
    const movedLinks = result.after.links.filter((l) => l.id === 'src-1' || l.id === 'src-2');
    if (movedLinks.length !== 2 || movedLinks.some((l) => l.category !== 'Beta' || l.folderId !== 'beta-folder-x-sub')) {
        throw new Error('[folder-target] Bookmarks did not land in the chosen sub-folder: ' + JSON.stringify(result));
    }
    return result;
}


module.exports = {
    runPickerRenderPhase,
    runSectionCollapsePhase,
    runTabTreePhase,
    runFolderTargetPhase
};
