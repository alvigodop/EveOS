const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sharedPath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.shared.js');
const persistencePath = path.join(repoRoot, 'js/modules/features/search-advanced/sa-index.persistence.js');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeRecord(index) {
    return {
        id: 'bookmark::' + index,
        type: 'bookmark',
        title: 'Bookmark ' + index,
        workspaceId: 'main',
        workspaceIds: ['main'],
        categoryName: 'Alpha',
        searchableText: 'bookmark ' + index
    };
}

function makeSnapshot(count) {
    return {
        version: 2,
        builtAt: Date.now(),
        reason: 'persistence-cap-smoke',
        datapackFingerprint: 'dp1:smoke',
        stats: { totalRecords: count },
        records: Array.from({ length: count }, (_, index) => makeRecord(index))
    };
}

async function main() {
    const removedKeys = [];
    let savedSnapshots = 0;
    let deleteHeavyCalls = 0;
    let loadSnapshot = null;

    global.localStorage = {
        getItem(key) {
            return key === 'eve.nexusIndex.v2' && loadSnapshot ? JSON.stringify(loadSnapshot) : null;
        },
        setItem() {
            savedSnapshots += 1;
        },
        removeItem(key) {
            removedKeys.push(key);
        }
    };

    global.window = {
        EveOS: { SearchAdvanced: {} },
        eveState: {
            config: {
                nexusIndexPersistMaxRecords: 3,
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main' }]
            },
            links: [],
            bookmarkFolders: {}
        },
        StorageManager: {
            async saveDataAsync() {
                savedSnapshots += 1;
                return true;
            },
            async loadDataAsync() {
                return loadSnapshot;
            },
            async deleteHeavyData() {
                deleteHeavyCalls += 1;
                return true;
            }
        },
        addEventListener() {},
        dispatchEvent() {}
    };

    eval(fs.readFileSync(sharedPath, 'utf8'));
    eval(fs.readFileSync(persistencePath, 'utf8'));

    const shared = window.EveOS.SearchAdvanced.IndexShared;
    const runtime = window.EveOS.SearchAdvanced.IndexPersistenceRuntime.create({
        shared,
        buildDatapackStateFingerprint: () => 'dp1:smoke'
    });

    await runtime.persistSnapshot(makeSnapshot(3));
    assert(savedSnapshots === 1, 'Expected small snapshots at the cap to persist.');
    assert(!shared.state.lastPersistSkipped, 'Expected no skip diagnostic for a small snapshot.');

    await runtime.persistSnapshot(makeSnapshot(4));
    assert(savedSnapshots === 1, 'Expected large snapshot not to be persisted.');
    assert(deleteHeavyCalls === 1, 'Expected stale heavy index cleanup to run.');
    assert(removedKeys.includes('eve.nexusIndex.v2'), 'Expected direct localStorage index key cleanup.');
    assert(removedKeys.includes('global_nexusIndexV2'), 'Expected StorageManager fallback index key cleanup.');
    assert(shared.state.lastPersistSkipped?.recordCount === 4, 'Expected skip diagnostic to record the large snapshot count.');

    shared.state.loaded = false;
    shared.state.snapshot = null;
    loadSnapshot = makeSnapshot(5);
    const loaded = await runtime.loadPersistedSnapshot();
    assert(loaded === null, 'Expected oversized persisted snapshot to be rejected on load.');
    assert(shared.state.dirty === true, 'Expected rejected persisted snapshot to leave index dirty for rebuild.');
    assert(shared.state.lastReason === 'persisted-snapshot-too-large', 'Expected oversized-load reason to be recorded.');

    console.log('NEXUS_INDEX_PERSISTENCE_CAP_SMOKE_OK');
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
