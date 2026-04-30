const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && !!window.EveBookmarkFolders?.collectFolderIntegrity
        && !!window.EveBookmarkFolders?.repairFolderIntegrity
        && !!window.EveOS?.SearchAdvanced?.Index?.rebuild
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error && error.message ? error.message : String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await page.waitForTimeout(500);

        const result = await page.evaluate(async () => {
            const seededConfig = Object.assign({}, window.eveState?.config || {}, {
                activeWorkspace: 'main',
                viewMode: 'grid',
                showInactiveTabs: true,
                workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }],
                categoryOrder: ['Reading', 'LegacyArray'],
                categoryOrderByWorkspace: { main: ['Reading', 'LegacyArray'] },
                hideStats: [],
                collapsedTabs: [],
                sidebarGroups: [],
                sidebarManualOrder: { root: [], parents: {} }
            });
            const seededLinks = [
                { id: 'root-link', title: 'Root Visible Bookmark', url: 'https://example.com/root', workspace: 'main', category: 'Reading', done: false },
                { id: 'hidden-link', title: 'Hidden Folder Bookmark', url: 'https://example.com/hidden', workspace: 'main', category: 'Reading', folderId: 'child-folder', done: false },
                { id: 'missing-folder-link', title: 'Missing Folder Bookmark', url: 'https://example.com/missing', workspace: 'main', category: 'Reading', folderId: 'gone-folder', done: false },
                { id: 'legacy-link', title: 'Legacy Array Folder Bookmark', url: 'https://example.com/legacy', workspace: 'main', category: 'LegacyArray', folderId: 'legacy-folder', done: false }
            ];
            const seededFolders = {
                'main::Reading': {
                    nodes: [
                        { id: 'child-folder', name: 'Child Folder', parentId: 'deleted-parent', order: 0 }
                    ]
                },
                'main::LegacyArray': [
                    { id: 'legacy-folder', name: 'Legacy Folder', parentId: '', order: 0 }
                ]
            };

            window.config = config = seededConfig;
            window.links = links = seededLinks;
            window.bookmarkFolders = bookmarkFolders = seededFolders;
            if (window.eveState) {
                window.eveState.config = seededConfig;
                window.eveState.links = seededLinks;
                window.eveState.bookmarkFolders = seededFolders;
            }
            window.EveFolderViewV2?.invalidateAllCachedViewModels?.();

            const beforeFolderIntegrity = window.EveBookmarkFolders.collectFolderIntegrity({
                workspaceId: 'main',
                categoryName: 'Reading'
            });
            const legacyIntegrity = window.EveBookmarkFolders.collectFolderIntegrity({
                workspaceId: 'main',
                categoryName: 'LegacyArray'
            });

            await window.EveOS.SearchAdvanced.Index.rebuild({ reason: 'folder-integrity-before', force: true });
            const beforeIndexReport = await window.EveOS.SearchAdvanced.Index.getIntegrityReport({
                scope: { workspaceId: 'main', categoryName: 'Reading' }
            });
            const hiddenDiagnostic = await window.EveOS.SearchAdvanced.Index.search('Hidden Folder Bookmark', {
                workspaceId: 'main',
                categoryName: 'Reading'
            }, {});
            const hiddenRecord = hiddenDiagnostic.records.find((record) => record.id === 'bookmark::hidden-link') || null;
            const hiddenFolderRecord = window.EveOS.SearchAdvanced.Index.getSnapshot().records
                .find((record) => record.id === 'folder::main::Reading::child-folder') || null;

            const repair = window.EveBookmarkFolders.repairFolderIntegrity({
                scope: { workspaceId: 'main', categoryName: 'Reading' }
            });
            await new Promise(resolve => setTimeout(resolve, 250));
            await window.EveOS.SearchAdvanced.Index.rebuild({ reason: 'folder-integrity-after', force: true });
            const afterFolderIntegrity = window.EveBookmarkFolders.collectFolderIntegrity({
                workspaceId: 'main',
                categoryName: 'Reading'
            });
            const afterIndexReport = await window.EveOS.SearchAdvanced.Index.getIntegrityReport({
                scope: { workspaceId: 'main', categoryName: 'Reading' }
            });
            window.renderDashboard();
            await new Promise(resolve => setTimeout(resolve, 300));

            const repairedFolder = (window.eveState.bookmarkFolders['main::Reading']?.nodes || [])
                .find((node) => String(node.id) === 'child-folder') || null;
            const missingFolderLink = window.eveState.links.find((link) => String(link.id) === 'missing-folder-link') || null;
            const dashboardText = document.getElementById('dashboard-grid')?.textContent || '';

            return {
                beforeFolderIntegrity,
                legacyIntegrity,
                beforeIndexReport: {
                    brokenRecords: beforeIndexReport.brokenRecords,
                    missingParentRecords: beforeIndexReport.missingParentRecords,
                    issueCount: beforeIndexReport.issueCount,
                    reasons: Object.keys(beforeIndexReport.byReason || {})
                },
                hiddenRecord: hiddenRecord ? {
                    health: hiddenRecord.health,
                    visibility: hiddenRecord.visibility,
                    provenance: hiddenRecord.provenance
                } : null,
                hiddenFolderRecord: hiddenFolderRecord ? {
                    baseHealth: hiddenFolderRecord.baseHealth,
                    provenance: hiddenFolderRecord.provenance
                } : null,
                repair,
                afterFolderIntegrity,
                afterIndexReport: {
                    brokenRecords: afterIndexReport.brokenRecords,
                    missingParentRecords: afterIndexReport.missingParentRecords,
                    issueCount: afterIndexReport.issueCount
                },
                repairedParentId: repairedFolder ? String(repairedFolder.parentId || '') : null,
                missingFolderLinkFolderId: missingFolderLink ? String(missingFolderLink.folderId || '') : null,
                dashboardHasRepairedBookmarks: dashboardText.includes('Missing Folder Bookmark') && dashboardText.includes('Child Folder')
            };
        });

        if (pageErrors.length) {
            throw new Error(`Page errors during folder integrity smoke: ${pageErrors.join(' | ')}`);
        }
        if (result.beforeFolderIntegrity.brokenFolderCount < 1) {
            throw new Error(`Expected broken folder parent before repair, saw ${JSON.stringify(result.beforeFolderIntegrity)}`);
        }
        if (result.beforeFolderIntegrity.missingFolderBookmarkCount < 1) {
            throw new Error(`Expected missing folder bookmark before repair, saw ${JSON.stringify(result.beforeFolderIntegrity)}`);
        }
        if (result.legacyIntegrity.issueCount !== 0) {
            throw new Error(`Expected legacy array folder store to remain readable, saw ${JSON.stringify(result.legacyIntegrity)}`);
        }
        if (!result.hiddenRecord?.provenance?.folderUnreachable || result.hiddenRecord?.health?.state !== 'broken') {
            throw new Error(`Expected hidden bookmark to be diagnosed as broken/unreachable, saw ${JSON.stringify(result.hiddenRecord)}`);
        }
        if (!result.hiddenFolderRecord?.provenance?.folderParentBroken) {
            throw new Error(`Expected folder record to be indexed with broken parent diagnostics, saw ${JSON.stringify(result.hiddenFolderRecord)}`);
        }
        if (result.repair.rootedFolders !== 1 || result.repair.movedBookmarksToRoot !== 1) {
            throw new Error(`Expected repair to root one folder and move one bookmark, saw ${JSON.stringify(result.repair)}`);
        }
        if (result.repairedParentId !== '') {
            throw new Error(`Expected broken child folder to be rooted after repair, saw parent ${result.repairedParentId}`);
        }
        if (result.missingFolderLinkFolderId !== '') {
            throw new Error(`Expected missing-folder bookmark to be moved to card root, saw ${result.missingFolderLinkFolderId}`);
        }
        if (result.afterFolderIntegrity.issueCount !== 0 || result.afterIndexReport.missingParentRecords !== 0) {
            throw new Error(`Expected folder diagnostics to clear after repair, saw ${JSON.stringify(result.afterFolderIntegrity)} / ${JSON.stringify(result.afterIndexReport)}`);
        }
        if (!result.dashboardHasRepairedBookmarks) {
            throw new Error(`Expected dashboard to show repaired root bookmark and rooted folder, saw ${JSON.stringify(result)}`);
        }

        console.log('NEXUS_FOLDER_INTEGRITY_DEBUG_SMOKE_OK ' + JSON.stringify({
            before: result.beforeFolderIntegrity,
            repair: result.repair,
            after: result.afterFolderIntegrity
        }));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
