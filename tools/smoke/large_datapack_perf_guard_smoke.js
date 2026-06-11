// Perf guard for large datapacks.
//
// Verifies the two main-thread serialization loops that froze big datapacks
// after the modularization are bounded:
//
//   1. Edit history auto-skips the whole-state "data" layers (datapack + oversized
//      tab) above config.editHistoryFullStateMaxLinks, while keeping the cheap
//      scoped card/folder/bookmark layers. Under the cap, full behavior is kept.
//
//   2. Modular sync's captureStateHash is memoized by a local-state epoch so idle
//      ticks don't re-capture+stringify+hash the entire datapack; invalidation
//      forces exactly one recompute.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeLinks(count, workspaceId, categoryName) {
    const links = [];
    for (let i = 0; i < count; i += 1) {
        links.push({
            id: `${workspaceId}_${categoryName}_${i}`,
            title: `Link ${i}`,
            url: `https://example.test/${workspaceId}/${i}`,
            workspace: workspaceId,
            category: categoryName
        });
    }
    return links;
}

function snapshotFrom(links) {
    return {
        links,
        bookmarkFolders: {},
        quickPins: [],
        constellationDetachedChains: {}
    };
}

function createEditHistoryContext(cap) {
    const memoryStore = new Map();
    const localStorage = {
        getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
        setItem: (k, v) => memoryStore.set(k, String(v)),
        removeItem: (k) => memoryStore.delete(k),
        clear: () => memoryStore.clear()
    };
    const config = { editHistoryFullStateMaxLinks: cap, workspaces: [] };
    const windowObject = {
        EveEditHistory: {},
        EveCoreStorage: null, // force localStorage-only path
        config
    };
    windowObject.window = windowObject;
    const context = {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp,
        Promise, setTimeout, clearTimeout, localStorage,
        window: windowObject,
        config,
        document: { getElementById: () => null }
    };
    windowObject.localStorage = localStorage;
    context.globalThis = context;
    context.self = context.window;
    return vm.createContext(context);
}

function runEditHistoryCase(cap, linkCount, label) {
    const context = createEditHistoryContext(cap);
    [
        'js/modules/core/storage.delta.js',
        'js/modules/features/edit-history/edit-history.capture.js',
        'js/modules/features/edit-history/edit-history.core.js'
    ]
        .forEach((rel) => vm.runInContext(readModule(rel), context, { filename: rel }));

    const api = context.window.EveEditHistory;
    assert(typeof api.recordDataMutation === 'function', `[${label}] recordDataMutation missing`);

    // before: linkCount links in "main"; after: same but one link's title changed
    // and one card scope touched, so card + bookmark layers have real diffs.
    const beforeLinks = makeLinks(linkCount, 'main', 'Reading');
    const afterLinks = beforeLinks.map((l) => ({ ...l }));
    afterLinks[0] = { ...afterLinks[0], title: 'CHANGED' };

    const before = snapshotFrom(beforeLinks);
    const after = snapshotFrom(afterLinks);

    api.recordDataMutation({
        before,
        after,
        source: 'perf-guard',
        delta: {
            workspaceIds: ['main'],
            affectedScopes: [{ workspaceId: 'main', categoryName: 'Reading' }],
            linkIds: [afterLinks[0].id]
        }
    });

    const layersPresent = new Set(api.getEntries().map((e) => e.scope && e.scope.layer));
    return layersPresent;
}

function runEditHistoryGuards() {
    // Large pack (linkCount > cap): datapack + workspace data layers skipped,
    // card + bookmark layers kept.
    const big = runEditHistoryCase(10, 50, 'large');
    assert(!big.has('datapack'), '[large] datapack data layer should be skipped above cap');
    assert(!big.has('workspace'), '[large] oversized tab data layer should be skipped above cap');
    assert(big.has('card'), '[large] card layer should still be recorded');
    assert(big.has('bookmark'), '[large] bookmark layer should still be recorded');

    // Small pack (linkCount <= cap): full behavior preserved.
    const small = runEditHistoryCase(1000, 3, 'small');
    assert(small.has('datapack'), '[small] datapack data layer should be recorded under cap');
    assert(small.has('workspace'), '[small] tab data layer should be recorded under cap');
    assert(small.has('card'), '[small] card layer should be recorded under cap');
    assert(small.has('bookmark'), '[small] bookmark layer should be recorded under cap');

    console.log('  ✓ edit-history scale gate: heavy layers skipped above cap, scoped layers kept, full behavior under cap');
}

function runModularSyncHashGuard() {
    let captureCalls = 0;
    const windowObject = {
        EveDataStore: {
            Store: {
                captureState() {
                    captureCalls += 1;
                    // Distinct content each call so a non-memoized impl would still
                    // return a stable hash only if it re-reads the same source — here
                    // we keep source identical so we can detect recompute via call count.
                    return { bookmarks: { links: [{ id: 'a', title: 'A' }] }, metadata: { date: Date.now() } };
                }
            }
        },
        location: { protocol: 'http:' },
        config: { modularStateSyncEnabled: true }
    };
    windowObject.window = windowObject;
    const context = {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp,
        Promise, setTimeout, clearTimeout, setInterval, clearInterval,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
        window: windowObject,
        config: windowObject.config
    };
    context.globalThis = context;
    context.self = context.window;
    const ctx = vm.createContext(context);
    vm.runInContext(readModule('js/modules/features/modular-state-sync/modular-state-sync.shared.js'), ctx,
        { filename: 'modular-state-sync.shared.js' });

    const ns = context.window.EveDataStore._modularSync;
    assert(ns && typeof ns.captureStateHash === 'function', 'captureStateHash missing');
    assert(typeof ns.invalidateLocalStateHash === 'function', 'invalidateLocalStateHash missing');

    const h1 = ns.captureStateHash();
    assert(h1 && typeof h1 === 'string', 'captureStateHash should return a hash');
    assert(captureCalls === 1, `first capture should call captureState once (got ${captureCalls})`);

    // Repeated idle calls without mutation -> served from memo, no extra captureState.
    ns.captureStateHash();
    ns.captureStateHash();
    ns.captureStateHash();
    assert(captureCalls === 1, `idle repeats must hit the memo (captureState called ${captureCalls}x, expected 1)`);

    // After a mutation invalidation, exactly one recompute.
    ns.invalidateLocalStateHash();
    ns.captureStateHash();
    assert(captureCalls === 2, `invalidation should force one recompute (got ${captureCalls})`);

    // metadata.date volatility must NOT change the content hash (memo aside).
    ns.invalidateLocalStateHash();
    const hAfter = ns.captureStateHash();
    assert(hAfter === h1, 'volatile metadata.date must be stripped from the content hash');

    console.log('  ✓ modular-sync hash memo: idle ticks free, one recompute per mutation, volatile metadata ignored');
}

function main() {
    console.log('Large datapack perf guard:');
    runEditHistoryGuards();
    runModularSyncHashGuard();
    console.log('LARGE_DATAPACK_PERF_GUARD_SMOKE_OK');
}

main();
