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

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeLink(id, title, category) {
    return {
        id,
        title,
        url: 'https://example.test/' + id,
        workspace: 'main',
        category,
        done: false
    };
}

function makeBookmarkRecord(link) {
    return {
        id: 'bookmark::' + link.id,
        type: 'bookmark',
        title: link.title,
        url: link.url,
        displayUrl: link.url,
        description: '',
        provider: 'bookmark',
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
        provenance: { kind: 'bookmark', linkId: link.id },
        baseHealth: { state: 'healthy', reasons: [] },
        updatedAt: 0,
        searchableText: [link.title, link.url, link.category].join(' ').toLowerCase()
    };
}

function makeCardRecord(category) {
    return {
        id: 'card::main::' + category,
        type: 'card',
        title: category,
        provider: 'card',
        workspaceId: 'main',
        workspaceIds: ['main'],
        categoryName: category,
        path: {
            workspaceId: 'main',
            workspaceIds: ['main'],
            workspaceLabel: 'Main',
            categoryName: category,
            pathLabel: 'Main > ' + category
        },
        provenance: { kind: 'card', scopedKey: 'main::' + category },
        baseHealth: { state: 'healthy', reasons: [] },
        updatedAt: 0,
        searchableText: category.toLowerCase()
    };
}

function makeRecords(links, categories) {
    return categories.map(makeCardRecord).concat(links.map(makeBookmarkRecord));
}

function makeCategoryMap(links) {
    const map = new Map();
    links.forEach(link => {
        const key = link.workspace + '::' + link.category;
        if (!map.has(key)) {
            map.set(key, {
                scopedKey: key,
                workspaceId: link.workspace,
                categoryName: link.category,
                workspaceIds: new Set([link.workspace])
            });
        }
    });
    return map;
}

async function main() {
    global.localStorage = {
        getItem() { return null; },
        setItem() {}
    };
    global.window = {
        EveOS: { SearchAdvanced: {} },
        eveState: {
            config: {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main' }]
            },
            links: [
                makeLink('alpha-1', 'Alpha Original', 'Alpha'),
                makeLink('beta-1', 'Beta Original', 'Beta')
            ],
            bookmarkFolders: {}
        },
        addEventListener() {},
        dispatchEvent() {}
    };

    eval(fs.readFileSync(sharedPath, 'utf8'));
    const shared = window.EveOS.SearchAdvanced.IndexShared;
    let fullLocalBuilds = 0;
    let scopedLocalBuilds = 0;

    function buildStats(records) {
        return {
            totalRecords: records.length,
            bookmarkCount: records.filter(record => record.type === 'bookmark').length,
            cardCount: records.filter(record => record.type === 'card').length,
            folderCount: 0,
            libraryCount: 0,
            knowledgeCount: records.filter(record => record.type === 'knowledge').length,
            cachedCount: records.filter(record => record.type === 'cached').length,
            providerCount: 0,
            workspaceCount: 1
        };
    }

    window.EveOS.SearchAdvanced.IndexRecordBuildersSources = {
        buildSnapshot: async reason => {
            const records = makeRecords(window.eveState.links, ['Alpha', 'Beta']);
            return {
                version: shared.INDEX_VERSION,
                builtAt: Date.now(),
                reason,
                stats: buildStats(records),
                records
            };
        },
        buildLocalRecordBundle: () => {
            fullLocalBuilds += 1;
            const records = makeRecords(window.eveState.links, ['Alpha', 'Beta']);
            return {
                links: window.eveState.links,
                categoryMap: makeCategoryMap(window.eveState.links),
                records
            };
        },
        buildScopedLocalRecordBundle: options => {
            scopedLocalBuilds += 1;
            const scopeKeys = (options.scopes || []).map(scope => scope.workspaceId + '::' + scope.categoryName);
            const scopedCategories = scopeKeys.map(key => key.split('::').slice(1).join('::'));
            const scopedLinks = window.eveState.links.filter(link => scopeKeys.includes(link.workspace + '::' + link.category));
            return {
                links: scopedLinks,
                categoryMap: makeCategoryMap(window.eveState.links),
                scopedCategoryMap: makeCategoryMap(scopedLinks),
                scopeKeys,
                linkIds: options.linkIds || [],
                records: makeRecords(scopedLinks, scopedCategories)
            };
        },
        buildSourceRecordBundle: async () => ({ records: [] }),
        buildSnapshotStats: buildStats,
        filterCategoryMap: () => new Map(),
        rehydrateSourceRecords: records => records
    };
    window.EveOS.SearchAdvanced.IndexRuntimeIntegrity = {
        matchesScope(record, scope) {
            return !scope?.categoryName || record.categoryName === scope.categoryName;
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
            return { builtAt: Date.now(), totals: {}, workspaces: {}, groups: {}, cards: {} };
        }
    };

    eval(fs.readFileSync(searchPath, 'utf8'));
    eval(fs.readFileSync(graphPath, 'utf8'));
    eval(fs.readFileSync(exactScopePath, 'utf8'));
    eval(fs.readFileSync(invalidationPath, 'utf8'));
    eval(fs.readFileSync(persistencePath, 'utf8'));
    eval(fs.readFileSync(indexPath, 'utf8'));
    const indexApi = window.EveOS.SearchAdvanced.Index;
    await indexApi.rebuild({ reason: 'surgical-smoke-initial', force: true });
    fullLocalBuilds = 0;

    window.eveState.links = [
        makeLink('alpha-1', 'Alpha Updated', 'Alpha'),
        makeLink('beta-1', 'Beta Original', 'Beta')
    ];
    indexApi.markDirty('bookmark-title-edit', {
        dataDelta: {
            kind: 'core-data-delta',
            complete: true,
            linkIds: ['alpha-1'],
            updatedLinkIds: ['alpha-1'],
            affectedScopes: [{ workspaceId: 'main', categoryName: 'Alpha' }]
        }
    });

    const patchedSnapshot = await indexApi.ensureFresh();
    const alpha = patchedSnapshot.records.find(record => record.id === 'bookmark::alpha-1');
    const beta = patchedSnapshot.records.find(record => record.id === 'bookmark::beta-1');
    assert(scopedLocalBuilds === 1, 'Expected one scoped local patch build.');
    assert(fullLocalBuilds === 0, 'Expected no full local rebuild for scoped delta.');
    assert(alpha && alpha.title === 'Alpha Updated', 'Expected patched alpha bookmark title.');
    assert(beta && beta.title === 'Beta Original', 'Expected unrelated beta bookmark to be preserved.');

    window.eveState.links = [
        makeLink('alpha-1', 'Alpha Library Link Updated', 'Alpha'),
        makeLink('beta-1', 'Beta Original', 'Beta')
    ];
    indexApi.markDirty('library-link-updated', {
        workspaceId: 'main',
        categoryName: 'Alpha',
        linkId: 'alpha-1'
    });
    const directPlan = indexApi.getInvalidationPlan();
    assert(directPlan.mode === 'local-scope', 'Expected direct mutation metadata to plan a scoped local patch.');
    const directPatchedSnapshot = await indexApi.ensureFresh();
    const directAlpha = directPatchedSnapshot.records.find(record => record.id === 'bookmark::alpha-1');
    const directBeta = directPatchedSnapshot.records.find(record => record.id === 'bookmark::beta-1');
    assert(scopedLocalBuilds === 2, 'Expected direct metadata to use one additional scoped local patch build.');
    assert(fullLocalBuilds === 0, 'Expected no full local rebuild for direct metadata patch.');
    assert(directAlpha && directAlpha.title === 'Alpha Library Link Updated', 'Expected direct metadata patch to refresh alpha.');
    assert(directBeta && directBeta.title === 'Beta Original', 'Expected direct metadata patch to preserve beta.');

    const revisionBefore = indexApi.getBuildState().revision;
    indexApi.markDirty('saveData', {
        dataDelta: {
            kind: 'core-data-delta',
            complete: true,
            linkIds: [],
            affectedScopes: [],
            hasQuickPinChanges: true
        }
    });
    assert(indexApi.getBuildState().revision === revisionBefore, 'Expected quick-pin-only saveData delta not to dirty Nexus index.');

    indexApi.markDirty('saveConfig', {
        configDelta: {
            kind: 'core-config-delta',
            complete: true,
            changedKeys: ['accent'],
            workspaceIds: []
        }
    });
    assert(indexApi.getBuildState().revision === revisionBefore, 'Expected visual-only config delta not to dirty Nexus index.');

    indexApi.markDirty('saveConfig', {
        configDelta: {
            kind: 'core-config-delta',
            complete: true,
            changedKeys: ['workspaces'],
            workspaceIds: ['main']
        }
    });
    assert(indexApi.getBuildState().revision === revisionBefore + 1, 'Expected workspace config delta to dirty Nexus index.');
    assert(indexApi.getInvalidationPlan().mode === 'local', 'Expected workspace config delta to plan a local projection refresh.');

    console.log('PASS nexus_index_surgical_delta_smoke:', JSON.stringify({
        scopedLocalBuilds,
        fullLocalBuilds,
        alphaTitle: directAlpha.title,
        betaTitle: directBeta.title
    }));
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
