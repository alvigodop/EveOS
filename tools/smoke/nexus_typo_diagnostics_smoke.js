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
            id: 'bookmark::partial-only',
            type: 'bookmark',
            title: 'Chihiro Cooking Notes',
            url: 'https://example.test/chihiro-cooking',
            workspaceId: 'main',
            categoryName: 'Studio',
            searchableText: 'chihiro cooking notes'
        }),
        makeRecord({
            id: 'bookmark::astro-boy',
            type: 'bookmark',
            title: 'Astro Boy ROMs',
            workspaceId: 'main',
            categoryName: 'Games',
            searchableText: 'astro boy roms'
        }),
        makeRecord({
            id: 'bookmark::astroboy',
            type: 'bookmark',
            title: 'Astroboy Legacy',
            workspaceId: 'main',
            categoryName: 'Games',
            searchableText: 'astroboy legacy'
        }),
        makeRecord({
            id: 'bookmark::astro-writing',
            type: 'bookmark',
            title: 'Astro Writing Focused',
            workspaceId: 'main',
            categoryName: 'Writing',
            searchableText: 'astro writing focused'
        }),
        makeRecord({
            id: 'bookmark::last-round',
            type: 'bookmark',
            title: 'DOA5 Last Round Mods',
            workspaceId: 'main',
            categoryName: 'Mods',
            searchableText: 'doa5 last round mods'
        }),
        makeRecord({
            id: 'bookmark::last-royal',
            type: 'bookmark',
            title: 'The Pirates: The Last Royal Treasure',
            workspaceId: 'main',
            categoryName: 'Movies',
            searchableText: 'the pirates the last royal treasure'
        }),
        makeRecord({
            id: 'bookmark::ad-astra',
            type: 'bookmark',
            title: 'Ad Astra',
            workspaceId: 'main',
            categoryName: 'Movies',
            searchableText: 'ad astra movie'
        }),
        makeRecord({
            id: 'bookmark::subsequence-noise',
            type: 'bookmark',
            title: 'A Situation Full of Erections',
            workspaceId: 'main',
            categoryName: 'Reading',
            searchableText: 'a situation full of erections'
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
        }),
        makeRecord({
            id: 'bookmark::missing-folder',
            type: 'bookmark',
            title: 'Missing Folder Bookmark',
            workspaceId: 'main',
            categoryName: 'Studio',
            searchableText: 'missing folder bookmark',
            provenance: { missingFolder: true, missingParent: true, linkId: 'missing-folder' },
            baseHealth: { state: 'broken', reasons: ['Folder parent no longer exists.'] }
        }),
        makeRecord({
            id: 'cached::source-only',
            type: 'cached',
            title: 'Source Only Cache',
            provider: 'google',
            workspaceId: 'main',
            categoryName: 'Studio',
            updatedAt: Date.now(),
            searchableText: 'source only cache',
            provenance: { sourceOnly: true },
            baseHealth: { state: 'warning', reasons: ['Result exists only in saved source/cache data.'] }
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

    // The index facade refuses to initialize until its modular runtimes are present — load
    // them in the same order as the production manifest (12-existing-features.js).
    [
        'js/modules/features/search-advanced/sa-index.search.compact.js',
        'js/modules/features/search-advanced/sa-index.search.js',
        'js/modules/features/search-advanced/sa-index.graph.js',
        'js/modules/features/search-advanced/sa-index.exact-scope.js',
        'js/modules/features/search-advanced/sa-index.invalidation.js',
        'js/modules/features/search-advanced/sa-index.persistence.js'
    ].forEach((relPath) => {
        eval(fs.readFileSync(path.join(repoRoot, relPath), 'utf8'));
    });
    eval(fs.readFileSync(indexPath, 'utf8'));

    const indexApi = window.EveOS.SearchAdvanced.Index;
    const searchResult = await indexApi.search('sprited chihro', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    const rankedIds = searchResult.records.map(record => record.id);
    assert(rankedIds[0] === 'card::spirited' || rankedIds[0] === 'bookmark::spirited', 'Expected a local typo match to rank first: ' + rankedIds.join(', '));
    assert(rankedIds.indexOf('cached::spirited') > rankedIds.indexOf('bookmark::spirited'), 'Expected cached/web-like evidence below local path truth: ' + rankedIds.join(', '));
    assert(!rankedIds.includes('bookmark::partial-only'), 'A record matching only one query token leaked into results: ' + rankedIds.join(', '));
    assert(searchResult.records.every(record => record.diagnostic), 'Expected every result to carry a diagnostic object.');

    const shortResult = await indexApi.search('un', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    assert(shortResult.records.length === 0, 'A two-character substring query returned unrelated results: ' + shortResult.records.map(record => record.id).join(', '));

    const partialResult = await indexApi.search('spirited ch', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    assert(partialResult.records.some(record => record.id === 'bookmark::spirited'), 'A short final prefix failed to match a longer title token.');

    const literalResult = await indexApi.search('astro', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    const literalIds = literalResult.records.map(record => record.id);
    assert(literalIds.includes('bookmark::astro-boy'), 'Literal astro result is missing.');
    assert(!literalIds.includes('bookmark::ad-astra'), 'Typo-distance result leaked into a literal result set.');
    assert(!literalIds.includes('bookmark::subsequence-noise'), 'Cross-word subsequence noise leaked into results.');
    assert(!literalIds.includes('bookmark::last-round'), 'Last Round manufactured astro across a word boundary.');
    assert(!literalIds.includes('bookmark::last-royal'), 'Last Royal manufactured astro across a word boundary.');

    const compactResult = await indexApi.search('astrob', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    const compactIds = compactResult.records.map(record => record.id);
    assert(compactIds.includes('bookmark::astro-boy'), 'Compact query did not match the spaced Astro Boy title.');
    assert(compactIds.includes('bookmark::astroboy'), 'Compact query did not match the unspaced Astroboy title.');
    assert(!compactIds.includes('bookmark::astro-writing'), 'Extended compact query collapsed to the shorter astro token.');
    assert(!compactIds.includes('bookmark::ad-astra'), 'Compact query leaked into a typo-distance result.');
    assert(!compactIds.includes('bookmark::subsequence-noise'), 'Compact query leaked into cross-word subsequence noise.');
    assert(!compactIds.includes('bookmark::last-round'), 'Compact query leaked into Last Round.');
    assert(!compactIds.includes('bookmark::last-royal'), 'Compact query leaked into Last Royal.');

    const spacedCompactResult = await indexApi.search('astro b', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    const spacedCompactIds = spacedCompactResult.records.map(record => record.id);
    assert(spacedCompactIds.includes('bookmark::astro-boy'), 'Spaced compact prefix did not match Astro Boy.');
    assert(spacedCompactIds.includes('bookmark::astroboy'), 'Spaced compact prefix did not match Astroboy.');
    assert(!spacedCompactIds.includes('bookmark::astro-writing'), 'Spaced compact prefix leaked into Astro Writing.');

    const compactSuggestionResult = await indexApi.suggest('astrob', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true },
        maxSuggestions: 8
    });
    const compactSuggestionIds = compactSuggestionResult.suggestions.map(record => record.id);
    assert(compactSuggestionIds.includes('bookmark::astro-boy'), 'Compact suggestion did not include Astro Boy.');
    assert(compactSuggestionIds.includes('bookmark::astroboy'), 'Compact suggestion did not include Astroboy.');
    assert(!compactSuggestionIds.includes('bookmark::astro-writing'), 'Compact suggestion leaked into Astro Writing.');

    const operatorResult = await indexApi.search('type:bookmark sprited chihro', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    assert(operatorResult.records.length === 1 && operatorResult.records[0].id === 'bookmark::spirited', 'Expected type:bookmark operator to filter to the local bookmark.');

    const staleResult = await indexApi.search('flag:stale', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true }
    });
    assert(staleResult.records.some(record => record.id === 'cached::spirited'), 'Expected flag:stale operator to expose stale cached records.');

    const report = await indexApi.getIntegrityReport({ scope: null });
    assert(report.issueCount >= 2, 'Expected integrity report to expose concrete issue rows.');
    assert(report.byReason['Workspace path is missing.'] >= 1, 'Expected broken path reason bucket.');
    assert(report.byReason['Folder parent no longer exists.'] >= 1, 'Expected missing folder parent reason bucket.');
    assert(report.byReason['Result exists only in saved source/cache data.'] >= 1, 'Expected source-only reason bucket.');
    assert(report.issues.some(issue => issue.id === 'bookmark::orphaned' && issue.severity === 'error'), 'Expected orphaned bookmark issue detail.');
    assert(report.issues.some(issue => issue.id === 'bookmark::missing-folder' && issue.severity === 'error'), 'Expected missing-folder bookmark issue detail.');
    assert(report.issues.some(issue => issue.id === 'cached::spirited' && issue.severity === 'warning'), 'Expected stale cached issue detail.');
    assert(report.issues.some(issue => issue.id === 'cached::source-only' && issue.severity === 'warning'), 'Expected source-only cache issue detail.');
    assert(report.missingParentRecords >= 1, 'Expected missing parent records to be counted.');
    assert(report.sourceOnlyRecords >= 1, 'Expected source-only records to be counted.');

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
