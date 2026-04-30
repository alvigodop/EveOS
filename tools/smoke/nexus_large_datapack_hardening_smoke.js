const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sharedPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.shared.js');
const integrityPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.runtime.integrity.js');
const summaryPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.runtime.summary.js');
const searchPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.search.js');
const graphPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.graph.js');
const exactScopePath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.exact-scope.js');
const invalidationPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.invalidation.js');
const persistencePath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.persistence.js');
const indexPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.js');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function now() {
    return Date.now();
}

async function measure(label, fn, budgetMs) {
    const startedAt = now();
    const value = await fn();
    const elapsedMs = now() - startedAt;
    assert(elapsedMs <= budgetMs, `${label} exceeded budget: ${elapsedMs}ms > ${budgetMs}ms`);
    return { value, elapsedMs };
}

function makePath(workspaceId, categoryName, linkId = '') {
    return {
        workspaceId,
        workspaceIds: [workspaceId],
        workspaceLabel: workspaceId,
        categoryName,
        linkId,
        pathLabel: `${workspaceId} > ${categoryName}`
    };
}

function makeCardRecord(workspaceId, categoryName) {
    return {
        id: `card::${workspaceId}::${categoryName}`,
        type: 'card',
        title: categoryName,
        provider: 'card',
        workspaceId,
        workspaceIds: [workspaceId],
        categoryName,
        path: makePath(workspaceId, categoryName),
        provenance: { kind: 'card', scopedKey: `${workspaceId}::${categoryName}` },
        baseHealth: { state: 'healthy', reasons: [] },
        updatedAt: 0,
        searchableText: `${workspaceId} ${categoryName}`.toLowerCase()
    };
}

function makeBookmarkRecord(workspaceId, categoryName, linkId, title) {
    return {
        id: `bookmark::${linkId}`,
        type: 'bookmark',
        title,
        url: `https://example.test/${linkId}`,
        displayUrl: `https://example.test/${linkId}`,
        description: '',
        provider: 'bookmark',
        workspaceId,
        workspaceIds: [workspaceId],
        categoryName,
        path: makePath(workspaceId, categoryName, linkId),
        provenance: { kind: 'bookmark', linkId },
        baseHealth: { state: 'healthy', reasons: [] },
        updatedAt: now(),
        searchableText: `${title} ${workspaceId} ${categoryName} ${linkId}`.toLowerCase()
    };
}

function buildCategoryMap(records) {
    const map = new Map();
    records.forEach((record) => {
        if (record.type !== 'card' && record.type !== 'bookmark') return;
        const key = `${record.workspaceId}::${record.categoryName}`;
        if (!map.has(key)) {
            map.set(key, {
                scopedKey: key,
                workspaceId: record.workspaceId,
                categoryName: record.categoryName,
                workspaceIds: new Set([record.workspaceId]),
                linkCount: 0
            });
        }
        if (record.type === 'bookmark') map.get(key).linkCount += 1;
    });
    return map;
}

function buildStats(records) {
    const workspaceIds = new Set();
    const stats = {
        totalRecords: records.length,
        bookmarkCount: 0,
        cardCount: 0,
        folderCount: 0,
        libraryCount: 0,
        knowledgeCount: 0,
        cachedCount: 0,
        providerCount: 1,
        workspaceCount: 0
    };
    records.forEach((record) => {
        if (record.type === 'bookmark') stats.bookmarkCount += 1;
        if (record.type === 'card') stats.cardCount += 1;
        workspaceIds.add(record.workspaceId);
    });
    stats.workspaceCount = workspaceIds.size;
    return stats;
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
                activeWorkspace: 'ws0',
                viewMode: 'grid',
                showInactiveTabs: true,
                showHiddenSidebarGroups: true,
                workspaces: Array.from({ length: 6 }, (_, index) => ({
                    id: `ws${index}`,
                    name: `Workspace ${index}`,
                    icon: 'Tab',
                    subTabs: []
                })),
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

async function main() {
    setupWindow();
    eval(fs.readFileSync(sharedPath, 'utf8'));
    eval(fs.readFileSync(integrityPath, 'utf8'));
    eval(fs.readFileSync(summaryPath, 'utf8'));
    eval(fs.readFileSync(searchPath, 'utf8'));
    eval(fs.readFileSync(graphPath, 'utf8'));
    eval(fs.readFileSync(exactScopePath, 'utf8'));
    eval(fs.readFileSync(invalidationPath, 'utf8'));
    eval(fs.readFileSync(persistencePath, 'utf8'));

    const shared = window.EveOS.SearchAdvanced.IndexShared;
    let records = [];
    let fullBuilds = 0;
    let scopedBuilds = 0;

    for (let workspaceIndex = 0; workspaceIndex < 6; workspaceIndex += 1) {
        const workspaceId = `ws${workspaceIndex}`;
        for (let categoryIndex = 0; categoryIndex < 40; categoryIndex += 1) {
            const categoryName = `Card ${workspaceIndex}-${categoryIndex}`;
            records.push(makeCardRecord(workspaceId, categoryName));
            for (let bookmarkIndex = 0; bookmarkIndex < 20; bookmarkIndex += 1) {
                const linkId = `link-${workspaceIndex}-${categoryIndex}-${bookmarkIndex}`;
                const title = linkId === 'link-3-17-9'
                    ? 'Target Alpha Exact Bookmark'
                    : `Bookmark ${workspaceIndex}-${categoryIndex}-${bookmarkIndex}`;
                records.push(makeBookmarkRecord(workspaceId, categoryName, linkId, title));
            }
        }
    }

    window.EveOS.SearchAdvanced.IndexRecordBuildersSources = {
        buildSnapshot: async (reason) => {
            fullBuilds += 1;
            return {
                version: shared.INDEX_VERSION,
                builtAt: now(),
                reason,
                stats: buildStats(records),
                records: records.map(record => ({ ...record, path: { ...record.path }, provenance: { ...record.provenance } }))
            };
        },
        buildLocalRecordBundle: () => ({
            records: records.map(record => ({ ...record, path: { ...record.path }, provenance: { ...record.provenance } })),
            categoryMap: buildCategoryMap(records)
        }),
        buildScopedLocalRecordBundle: (options) => {
            scopedBuilds += 1;
            const scopes = new Set((options.scopes || []).map(scope => `${scope.workspaceId}::${scope.categoryName}`));
            const linkIds = new Set(options.linkIds || []);
            const scopedRecords = records.filter((record) => {
                const scopeKey = `${record.workspaceId}::${record.categoryName}`;
                if (scopes.has(scopeKey)) return true;
                return record.type === 'bookmark' && linkIds.has(record.provenance.linkId);
            });
            return {
                records: scopedRecords.map(record => ({ ...record, path: { ...record.path }, provenance: { ...record.provenance } })),
                categoryMap: buildCategoryMap(records),
                scopedCategoryMap: buildCategoryMap(scopedRecords),
                scopeKeys: Array.from(scopes),
                linkIds: Array.from(linkIds)
            };
        },
        buildSourceRecordBundle: async () => ({ records: [] }),
        buildSnapshotStats: buildStats,
        filterCategoryMap: () => new Map(),
        rehydrateSourceRecords: recordsToKeep => recordsToKeep
    };

    eval(fs.readFileSync(indexPath, 'utf8'));
    const indexApi = window.EveOS.SearchAdvanced.Index;

    const rebuild = await measure('large rebuild', () => indexApi.rebuild({ reason: 'large-smoke', force: true }), 6000);
    assert(rebuild.value.records.length === records.length, 'Expected all large datapack records to be indexed.');

    const search = await measure('large search', () => indexApi.search('target alpha exact', { workspaceId: 'ws3' }, {}), 2500);
    assert(search.value.records[0]?.id === 'bookmark::link-3-17-9', 'Expected exact local bookmark to rank first.');

    const summary = await measure('large structure summary', () => Promise.resolve(indexApi.getStructureSummary()), 1500);
    assert(summary.value.totals.bookmarkCount === 4800, 'Expected structure summary to count all bookmarks.');

    const graph = await measure('large graph projection', () => indexApi.buildGraphProjection({ scope: { workspaceId: 'ws3' } }), 5000);
    assert(graph.value.nodes.length > 0 && graph.value.edges.length > 0, 'Expected graph projection to include nodes and edges.');

    records = records.map((record) => {
        if (record.id !== 'bookmark::link-3-17-9') return record;
        return Object.assign({}, record, {
            title: 'Target Alpha Exact Bookmark Updated',
            searchableText: 'target alpha exact bookmark updated'
        });
    });
    indexApi.markDirty('bookmark-title-edit', {
        workspaceId: 'ws3',
        categoryName: 'Card 3-17',
        linkId: 'link-3-17-9'
    });
    assert(indexApi.getInvalidationPlan().mode === 'local-scope', 'Expected direct large-datapack edit to use scoped patch mode.');

    const patched = await measure('large scoped patch', () => indexApi.ensureFresh(), 2500);
    const patchedRecord = patched.value.records.find(record => record.id === 'bookmark::link-3-17-9');
    assert(scopedBuilds === 1, 'Expected one scoped rebuild for the targeted edit.');
    assert(fullBuilds === 1, 'Expected no extra full rebuild after the initial large build.');
    assert(patchedRecord?.title === 'Target Alpha Exact Bookmark Updated', 'Expected scoped patch to refresh the edited record.');

    console.log('PASS nexus_large_datapack_hardening_smoke:', JSON.stringify({
        totalRecords: records.length,
        fullBuilds,
        scopedBuilds,
        timings: {
            rebuildMs: rebuild.elapsedMs,
            searchMs: search.elapsedMs,
            summaryMs: summary.elapsedMs,
            graphMs: graph.elapsedMs,
            patchMs: patched.elapsedMs
        }
    }));
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
