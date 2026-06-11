// Smoke test for:
//   1. Bulk Card-move: selecting all bookmarks of a folder transfers the folder
//      to the destination card and leaves no empty copy in the source card.
//   2. Bulk Tab-move: same, but moving across workspaces. The source card must
//      not retain a ghost copy of a fully-covered folder.
//   3. Bulk Merge: selected bookmarks sharing the same title collapse into one
//      base via the bulk Merge action.

const path = require('path');

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


module.exports = {
    FILE_URL,
    buildConfig,
    waitForApp,
    seedState,
    snapshotState
};
