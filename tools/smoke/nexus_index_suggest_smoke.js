const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const searchPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.search.js');
const graphPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.graph.js');
const exactScopePath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.exact-scope.js');
const invalidationPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.invalidation.js');
const persistencePath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.persistence.js');
const indexPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.js');

const records = [
    {
        id: 'card-alpha',
        type: 'card',
        title: 'Alpha Card',
        workspaceId: 'main',
        categoryName: 'Alpha',
        updatedAt: 3000,
        searchableText: 'alpha card',
        path: { pathLabel: 'Main / Alpha' }
    },
    {
        id: 'bookmark-alpha',
        type: 'bookmark',
        title: 'Alpha Bookmark',
        workspaceId: 'main',
        categoryName: 'Alpha',
        updatedAt: 2000,
        searchableText: 'alpha bookmark',
        url: 'https://example.test/alpha',
        path: { pathLabel: 'Main / Alpha / Folder' }
    },
    {
        id: 'cached-alpha',
        type: 'cached',
        title: 'Alpha Cache',
        workspaceId: 'main',
        categoryName: 'Alpha',
        updatedAt: 1000,
        searchableText: 'alpha cached',
        provider: 'api',
        path: { pathLabel: 'Main / Alpha / Cache' }
    },
    {
        id: 'folder-outside-scope',
        type: 'folder',
        title: 'Alpha Folder',
        workspaceId: 'other',
        categoryName: 'Alpha',
        updatedAt: 4000,
        searchableText: 'alpha folder',
        path: { pathLabel: 'Other / Alpha' }
    }
];

function setupWindow() {
    global.window = {
        EveOS: { SearchAdvanced: {} },
        addEventListener() {}
    };
    global.localStorage = {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
    };

    window.EveOS.SearchAdvanced.IndexShared = {
        STORAGE_KEY: 'nexus-suggest-smoke',
        STORAGE_MANAGER_KEY: 'nexus-suggest-smoke-manager',
        SNAPSHOT_MAX_AGE_MS: 100000,
        SEARCH_STORAGE_KEYS: new Set(),
        INCREMENTAL_LOCAL_RECORD_TYPES: new Set(['card', 'folder', 'bookmark', 'library']),
        INDEX_VERSION: 1,
        state: { loaded: false, snapshot: null, dirty: false, buildPromise: null, revision: 0 },
        now: () => 5000,
        text(value, fallback = '') {
            return value == null ? fallback : String(value);
        },
        normalizeText(value) {
            return String(value || '').trim().toLowerCase();
        },
        toArray(value) {
            return Array.isArray(value) ? value : [];
        },
        computeFreshness() {
            return { state: 'fresh', label: 'Fresh' };
        },
        readConfig() {
            return { workspaces: [] };
        },
        buildFolderPathLabel() {
            return '';
        }
    };

    window.EveOS.SearchAdvanced.IndexRecordBuildersSources = {
        buildSnapshot: async () => ({
            version: 1,
            builtAt: 5000,
            reason: 'nexus-suggest-smoke',
            stats: { totalRecords: records.length },
            records
        }),
        buildLocalRecordBundle: () => ({ records: [], categoryMap: new Map() }),
        buildSourceRecordBundle: async () => ({ records: [] }),
        buildSnapshotStats: list => ({ totalRecords: list.length }),
        filterCategoryMap: () => new Map(),
        rehydrateSourceRecords: list => list
    };

    window.EveOS.SearchAdvanced.IndexRuntimeIntegrity = {
        matchesScope(record, scope) {
            return !scope || !scope.workspaceId || record.workspaceId === scope.workspaceId;
        },
        buildScopeRecordMatcher(snapshot, scope) {
            return record => this.matchesScope(record, scope);
        },
        computeVisibility() {
            return { state: 'visible', label: 'Visible' };
        },
        computeHealth() {
            return { state: 'healthy', label: 'Healthy' };
        },
        buildIntegrityReportSync() {
            return {};
        }
    };

    window.EveOS.SearchAdvanced.IndexRuntimeSummary = {
        buildStructureSummary: () => ({ workspaces: {}, cards: {}, groups: {} })
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    setupWindow();
    eval(fs.readFileSync(searchPath, 'utf8'));
    eval(fs.readFileSync(graphPath, 'utf8'));
    eval(fs.readFileSync(exactScopePath, 'utf8'));
    eval(fs.readFileSync(invalidationPath, 'utf8'));
    eval(fs.readFileSync(persistencePath, 'utf8'));
    eval(fs.readFileSync(indexPath, 'utf8'));

    const result = await window.EveOS.SearchAdvanced.Index.suggest('alpha', { workspaceId: 'main' }, {
        activeVectors: { bookmarks: true, knowledge: false, cachedResults: true },
        maxSuggestions: 2
    });

    const ids = result.suggestions.map(item => item.id);
    assert(result.suggestions.length === 2, 'Expected capped suggestions length of 2, got ' + result.suggestions.length);
    assert(ids.includes('card-alpha'), 'Expected card suggestion.');
    assert(ids.includes('bookmark-alpha'), 'Expected bookmark suggestion.');
    assert(!ids.includes('folder-outside-scope'), 'Suggestion scope leaked an outside workspace record.');
    assert(result.suggestions.every(item => item.visibilityState && item.healthState), 'Expected enriched health and visibility states.');

    console.log('PASS nexus_index_suggest_smoke:', ids.join(', '));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
