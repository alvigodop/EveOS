const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'js', 'modules', 'features', 'data-state', 'data-state.apply.scoped.variants.js');
const assert = (condition, message) => { if (!condition) throw new Error(`ASSERT FAILED: ${message}`); };

function createContext() {
    const calls = [];
    const noOp = () => {};
    const dataStore = {
        captureReady: true,
        applySharedReady: true,
        applyScopedHelpersReady: true,
        getLinks: () => [],
        getBookmarkFolders: () => ({}),
        cloneConnections: () => [],
        getConnectionCategoryName: () => '',
        parseLibraryKey: () => null,
        findCategoryLibraryData: () => null,
        stripLegacyPinnedFlag: (entry) => entry,
        mergeLibraryEntries: noOp,
        deriveLegacyPinsFromLinks: () => [],
        replaceQuickPinsForWorkspace: noOp,
        replaceQuickPinsForCard: noOp,
        replaceQuickPinsForBookmark: noOp,
        replaceQuickPinsForFolder: noOp,
        getFolderTreesObject: () => ({}),
        buildScopedCategoryKey: () => '',
        filterFolderTreesByWorkspace: () => ({}),
        getFolderNodes: () => [],
        normalizeFolderTreeSettings: (value) => value,
        buildFolderMaps: () => ({}),
        collectFolderSubtreeIds: () => new Set(),
        mergeFolderSubtree: noOp,
        setLinks: noOp,
        setConfig: noOp,
        setBookmarkFolders: noOp,
        setQuickPins: noOp,
        applyLibraryCategories: noOp,
        applyConnections: noOp,
        applyKnowledgeState: noOp,
        createApplyFolderState: () => () => true
    };
    const window = {
        EveDataStore: dataStore,
        EveAudioflixAudio: { stopAll: async () => true },
        EveAudioflixAudioCodec: { clearCache: noOp },
        EveAudioflixState: {
            replaceDatapackState(value, reason) { calls.push({ value, reason }); }
        }
    };
    return { context: vm.createContext({ window, console, Set, Map, Object, Array, String, Promise }), dataStore, calls };
}

(function main() {
    const { context, dataStore, calls } = createContext();
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), context, { filename: SOURCE });

    assert(dataStore.applyState({ metadata: { type: 'legacy' } }) === true, 'legacy backup applies normally');
    assert(calls.length === 0, 'backup without Audioflix never wipes the current Audioflix library');

    const explicit = { music: [], soundboard: [], marker: 'explicit-empty' };
    assert(dataStore.applyState({ audioflix: explicit }) === true, 'explicit Audioflix backup applies');
    assert(calls.length === 1 && calls[0].value.marker === 'explicit-empty', 'explicit empty state is honored');

    const legacyNested = { music: [{ id: 'm1' }], marker: 'legacy-nested' };
    dataStore.applyState({ bookmarks: { config: { audioflix: legacyNested } } });
    assert(calls.length === 2 && calls[1].value.marker === 'legacy-nested', 'legacy nested Audioflix backups remain compatible');

    console.log('AUDIOFLIX_BACKUP_GUARD_SMOKE_OK');
})();
