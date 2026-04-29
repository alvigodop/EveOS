const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sharedPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.shared.js');
const integrityPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.runtime.integrity.js');
const summaryPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.runtime.summary.js');
const indexPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.js');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function setupWindow() {
    global.localStorage = {
        getItem() { return null; },
        setItem() {}
    };

    global.window = {
        EveOS: { SearchAdvanced: {} },
        eveState: {
            config: {
                activeWorkspace: 'main',
                viewMode: 'grid',
                showInactiveTabs: false,
                workspaces: [
                    { id: 'main', name: 'Main Tab', icon: 'tab', subTabs: [] },
                    { id: 'archive', name: 'Archive Tab', icon: 'box', subTabs: [] }
                ],
                sidebarGroups: [],
                collapsed: [],
                linksCollapsed: []
            },
            links: [],
            bookmarkFolders: {}
        },
        addEventListener() {},
        dispatchEvent() {}
    };
}

function makeRecord(record) {
    return Object.assign({
        updatedAt: Date.now(),
        provider: '',
        displayUrl: '',
        description: '',
        workspaceIds: [record.workspaceId || 'main'],
        path: {
            workspaceId: record.workspaceId || 'main',
            workspaceIds: [record.workspaceId || 'main'],
            workspaceLabel: record.workspaceId === 'archive' ? 'Archive Tab' : 'Main Tab',
            categoryName: record.categoryName || 'Studio',
            pathLabel: (record.workspaceId === 'archive' ? 'Archive Tab' : 'Main Tab') + ' > ' + (record.categoryName || 'Studio')
        },
        provenance: {},
        baseHealth: { state: 'healthy', reasons: [] }
    }, record);
}

async function main() {
    setupWindow();
    eval(fs.readFileSync(sharedPath, 'utf8'));
    eval(fs.readFileSync(integrityPath, 'utf8'));
    eval(fs.readFileSync(summaryPath, 'utf8'));

    const shared = window.EveOS.SearchAdvanced.IndexShared;
    const records = [
        makeRecord({
            id: 'card::spirited',
            type: 'card',
            title: 'Spirited Chihiro',
            workspaceId: 'main',
            categoryName: 'Studio',
            searchableText: 'spirited chihiro studio'
        }),
        makeRecord({
            id: 'bookmark::spirited',
            type: 'bookmark',
            title: 'Spirited Chihiro Archive',
            url: 'https://example.test/spirited-chihiro',
            displayUrl: 'example.test/spirited-chihiro',
            workspaceId: 'main',
            categoryName: 'Studio',
            searchableText: 'spirited chihiro archive bookmark'
        }),
        makeRecord({
            id: 'cached::spirited',
            type: 'cached',
            title: 'Spirited Chihiro Web Result',
            provider: 'google',
            workspaceId: 'main',
            categoryName: 'Studio',
            updatedAt: 1,
            searchableText: 'spirited chihiro web result'
        }),
        makeRecord({
            id: 'bookmark::orphaned',
            type: 'bookmark',
            title: 'Orphaned Bookmark',
            workspaceId: 'archive',
            categoryName: 'Lost',
            searchableText: 'orphaned bookmark',
            provenance: { orphaned: true, linkId: 'orphaned' },
            baseHealth: { state: 'broken', reasons: ['Workspace path is missing.'] }
        })
    ];

    window.EveOS.SearchAdvanced.IndexRecordBuildersSources = {
        buildSnapshot: async (reason) => ({
            version: shared.INDEX_VERSION,
            builtAt: Date.now(),
            reason,
            stats: { totalRecords: records.length },
            records
        }),
        buildLocalRecordBundle: () => ({ records, categoryMap: new Map() }),
        buildSourceRecordBundle: async () => ({ records: [] }),
        buildSnapshotStats: list => ({ totalRecords: list.length }),
        filterCategoryMap: () => new Map(),
        rehydrateSourceRecords: list => list
    };

    eval(fs.readFileSync(indexPath, 'utf8'));

    const indexApi = window.EveOS.SearchAdvanced.Index;
    const searchResult = await indexApi.search('sprited chihro', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    const rankedIds = searchResult.records.map(record => record.id);
    assert(rankedIds[0] === 'card::spirited' || rankedIds[0] === 'bookmark::spirited', 'Expected a local typo match to rank first: ' + rankedIds.join(', '));
    assert(rankedIds.indexOf('cached::spirited') > rankedIds.indexOf('bookmark::spirited'), 'Expected cached/web-like evidence below local path truth: ' + rankedIds.join(', '));

    const report = await indexApi.getIntegrityReport({ scope: null });
    assert(report.issueCount >= 2, 'Expected integrity report to expose concrete issue rows.');
    assert(report.byReason['Workspace path is missing.'] >= 1, 'Expected broken path reason bucket.');
    assert(report.issues.some(issue => issue.id === 'bookmark::orphaned' && issue.severity === 'error'), 'Expected orphaned bookmark issue detail.');
    assert(report.issues.some(issue => issue.id === 'cached::spirited' && issue.severity === 'warning'), 'Expected stale cached issue detail.');

    indexApi.markDirty('saveConfig');
    assert(indexApi.hasReadableStructureSnapshot(), 'Expected config-only dirtiness to keep structure snapshot readable.');
    indexApi.markDirty('bookmark-url-edit');
    assert(!indexApi.hasReadableStructureSnapshot(), 'Expected data mutation dirtiness to block stale structure snapshot reads.');

    console.log('PASS nexus_typo_diagnostics_smoke:', JSON.stringify({
        rankedIds: rankedIds.slice(0, 3),
        issueCount: report.issueCount,
        topReasons: Object.keys(report.byReason).slice(0, 3)
    }));
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
