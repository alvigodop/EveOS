const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sharedPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.shared.js');
const searchPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.search.js');
const graphPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.graph.js');
const exactScopePath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.exact-scope.js');
const invalidationPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.invalidation.js');
const persistencePath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.persistence.js');
const indexPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.js');

let persistedRaw = null;
let savedRaw = null;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeLink(id, title, workspace = 'main', category = 'Alpha') {
    return {
        id,
        title,
        url: 'https://example.test/' + id,
        workspace,
        category,
        done: false
    };
}

function setupWindow() {
    global.localStorage = {
        getItem(key) {
            return key === 'eve.nexusIndex.v2' ? persistedRaw : null;
        },
        setItem(key, value) {
            if (key === 'eve.nexusIndex.v2') savedRaw = value;
        }
    };

    global.window = {
        EveOS: { SearchAdvanced: {} },
        eveState: {
            config: {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'Tab', subTabs: [] }],
                sidebarGroups: [],
                sidebarManualOrder: { root: [], parents: {} },
                categoryOrder: [],
                categoryOrderByWorkspace: {}
            },
            links: [makeLink('fresh', 'Fresh Bookmark')],
            bookmarkFolders: {}
        },
        addEventListener() {},
        dispatchEvent() {}
    };
}

function buildRecordFromLink(link) {
    return {
        id: 'bookmark::' + link.id,
        type: 'bookmark',
        title: link.title,
        url: link.url,
        displayUrl: link.url,
        description: '',
        provider: 'bookmark',
        sourceCard: link.category,
        sourceIdentity: { kind: 'bookmark', linkId: link.id },
        workspaceId: link.workspace,
        workspaceIds: [link.workspace],
        categoryName: link.category,
        path: {
            workspaceId: link.workspace,
            workspaceIds: [link.workspace],
            workspaceLabel: 'Main',
            categoryName: link.category,
            linkId: link.id,
            pathLabel: 'Main > ' + link.category
        },
        updatedAt: 0,
        provenance: { kind: 'bookmark', linkId: link.id, done: !!link.done },
        baseHealth: { state: 'healthy', reasons: [] },
        searchableText: String([link.title, link.url, link.category].join(' ')).toLowerCase()
    };
}

function buildRecords() {
    return window.eveState.links.map(buildRecordFromLink);
}

async function main() {
    setupWindow();
    eval(fs.readFileSync(sharedPath, 'utf8'));

    const shared = window.EveOS.SearchAdvanced.IndexShared;
    let fullBuilds = 0;
    let localBundles = 0;

    function buildStats(records) {
        return {
            totalRecords: records.length,
            bookmarkCount: records.length,
            cardCount: 0,
            folderCount: 0,
            libraryCount: 0,
            knowledgeCount: 0,
            cachedCount: 0,
            providerCount: 0,
            workspaceCount: 1
        };
    }

    window.EveOS.SearchAdvanced.IndexRecordBuildersSources = {
        buildSnapshot: async (reason) => {
            fullBuilds += 1;
            const records = buildRecords();
            return {
                version: shared.INDEX_VERSION,
                builtAt: Date.now(),
                reason,
                stats: buildStats(records),
                records
            };
        },
        buildLocalRecordBundle: () => {
            localBundles += 1;
            return {
                records: buildRecords(),
                categoryMap: new Map()
            };
        },
        buildSourceRecordBundle: async () => ({ records: [] }),
        buildSnapshotStats: buildStats,
        filterCategoryMap: () => new Map(),
        rehydrateSourceRecords: () => []
    };

    window.EveOS.SearchAdvanced.IndexRuntimeIntegrity = {
        matchesScope(record, scope) {
            return !scope?.workspaceId || record.workspaceId === scope.workspaceId;
        },
        buildScopeRecordMatcher(snapshot, scope) {
            return record => this.matchesScope(record, scope);
        },
        computeVisibility() {
            return { state: 'visible', label: 'Visible', reasons: [] };
        },
        computeHealth() {
            return { state: 'healthy', label: 'Healthy', reasons: [] };
        },
        buildIntegrityReportSync() {
            return {};
        }
    };
    window.EveOS.SearchAdvanced.IndexRuntimeSummary = {
        buildStructureSummary() {
            return { builtAt: 0, totals: {}, workspaces: {}, groups: {}, cards: {} };
        }
    };

    persistedRaw = JSON.stringify({
        version: shared.INDEX_VERSION,
        builtAt: Date.now(),
        reason: 'stale-persisted-smoke',
        datapackFingerprint: 'dp1:stale',
        stats: { totalRecords: 1 },
        records: [{
            id: 'bookmark::stale',
            type: 'bookmark',
            title: 'Stale Bookmark',
            workspaceId: 'main',
            workspaceIds: ['main'],
            categoryName: 'Alpha',
            path: { workspaceId: 'main', categoryName: 'Alpha', pathLabel: 'Main > Alpha' },
            searchableText: 'stale bookmark'
        }]
    });

    eval(fs.readFileSync(searchPath, 'utf8'));
    eval(fs.readFileSync(graphPath, 'utf8'));
    eval(fs.readFileSync(exactScopePath, 'utf8'));
    eval(fs.readFileSync(invalidationPath, 'utf8'));
    eval(fs.readFileSync(persistencePath, 'utf8'));
    eval(fs.readFileSync(indexPath, 'utf8'));

    const indexApi = window.EveOS.SearchAdvanced.Index;
    const firstSnapshot = await indexApi.ensureFresh();
    assert(fullBuilds === 1, 'Expected stale persisted snapshot to trigger a full rebuild.');
    assert(firstSnapshot.records[0].title === 'Fresh Bookmark', 'Expected rebuilt snapshot to reflect live datapack state.');
    assert(firstSnapshot.datapackFingerprint && firstSnapshot.datapackFingerprint !== 'dp1:stale', 'Expected rebuilt snapshot to store a fresh datapack fingerprint.');
    assert(JSON.parse(savedRaw).datapackFingerprint === firstSnapshot.datapackFingerprint, 'Expected persisted snapshot to include the fresh datapack fingerprint.');

    window.eveState.links = [makeLink('updated', 'Updated Bookmark')];
    indexApi.markDirty('smoke-link-edit');

    const suggestionResult = await indexApi.suggest('updated', { workspaceId: 'main' }, {});
    const suggestionIds = suggestionResult.suggestions.map(item => item.id);
    assert(localBundles >= 1, 'Expected dirty suggestion lookup to rebuild local index records.');
    assert(suggestionIds.includes('bookmark::updated'), 'Expected dirty suggestion lookup to return the updated bookmark.');
    assert(!suggestionIds.includes('bookmark::fresh'), 'Expected dirty suggestion lookup not to return the previous bookmark.');

    console.log('PASS nexus_index_state_fingerprint_smoke:', JSON.stringify({
        fullBuilds,
        localBundles,
        suggestions: suggestionIds
    }));
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
