const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

function runScript(context, relativePath) {
    const filePath = path.join(repoRoot, relativePath);
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

const windowObject = {
    EveLibrary: {},
    EveOS: { SearchAdvanced: {} },
    eveState: {
        config: {
            activeWorkspace: 'main'
        },
        links: [],
        bookmarkFolders: {}
    }
};
windowObject.window = windowObject;

const context = vm.createContext({
    console,
    window: windowObject,
    config: windowObject.eveState.config,
    links: windowObject.eveState.links,
    bookmarkFolders: windowObject.eveState.bookmarkFolders
});

runScript(context, 'js/modules/features/library/library-state.js');

const state = windowObject.EveLibrary.State;
['Ama', 'Amazi', 'Amazing', 'Amazing-Worlds'].forEach((name) => {
    assert(state.getCategoryDataType(name) === 'graphicNovels', `Default type should resolve for ${name}`);
});

assert(Object.keys(state.getAllLibraries()).length === 0, 'Read-only data type lookups should not create library/card buckets');

state.setAllLibraries({
    'main::Ama': {
        entries: [],
        dataType: 'graphicNovels',
        folderView: { root: 'all', chain: [], expanded: false }
    },
    'main::Amazi': {
        entries: [],
        dataType: 'graphicNovels',
        folderView: { root: 'all', chain: [], expanded: false }
    },
    'main::Amazing-Worlds': {
        entries: [{ id: 'entry-1', title: 'Amazing Worlds' }],
        dataType: 'graphicNovels',
        folderView: { root: 'all', chain: [], expanded: false }
    }
});

runScript(context, 'js/modules/features/search-advanced/sa-index.shared.js');
runScript(context, 'js/modules/features/search-advanced/sa-index.records.local.js');

const categoryMap = windowObject.EveOS.SearchAdvanced.IndexRecordBuildersLocal.buildCategoryMap([]);
assert(!categoryMap.has('main::Ama'), 'Empty transient prefix library should not become an indexed card');
assert(!categoryMap.has('main::Amazi'), 'Empty transient longer prefix library should not become an indexed card');
assert(categoryMap.has('main::Amazing-Worlds'), 'Real library entries should still create an indexed card');

windowObject.eveState.config.bookmarkIdentifiers = [{
    id: 'reading',
    label: 'Reading Queue',
    description: 'Books and long form reading list',
    quickLinks: [{ workspaceId: 'main', categoryName: 'Currently Reading' }]
}];
const bookmarkRecords = windowObject.EveOS.SearchAdvanced.IndexRecordBuildersLocal.buildBookmarkRecords([{
    id: 'label-search-link',
    title: 'Plain Bookmark',
    url: 'https://example.com/plain',
    workspace: 'main',
    category: 'Alpha',
    identifiers: ['reading']
}]);
const bookmarkRecord = bookmarkRecords[0];
assert(bookmarkRecord.provenance.identifierLabels.includes('Reading Queue'), 'Identifier label should be indexed on bookmark provenance');
assert(bookmarkRecord.searchableText.includes('reading queue'), 'Identifier label should be searchable through Nexus local records');
assert(bookmarkRecord.searchableText.includes('books and long form reading list'), 'Identifier description should be searchable through Nexus local records');
assert(bookmarkRecord.searchableText.includes('currently reading main'), 'Identifier quick-link targets should be searchable through Nexus local records');

console.log('LIBRARY_CARD_PREFIX_POLLUTION_SMOKE_OK');
