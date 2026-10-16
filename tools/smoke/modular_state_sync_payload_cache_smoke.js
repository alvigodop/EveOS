const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SHARED = path.join(ROOT, 'js', 'modules', 'features', 'modular-state-sync', 'modular-state-sync.shared.js');
const SYNC = path.join(ROOT, 'js', 'modules', 'features', 'modular-state-sync', 'modular-state-sync.engine.sync.js');

const sharedSource = fs.readFileSync(SHARED, 'utf8');
const syncSource = fs.readFileSync(SYNC, 'utf8');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeHarness(seed = { nested: { value: 1 }, bookmarks: { links: [] } }) {
    let now = 1000;
    let live = clone(seed);
    let captures = 0;
    const requests = [];
    const warnings = [];
    const seedLinks = Array.isArray(seed?.bookmarks?.links)
        ? seed.bookmarks.links
        : (Array.isArray(seed?.links) ? seed.links : []);

    class FakeDate extends Date {
        static now() { return now; }
    }

    const sandbox = {
        console: { log() {}, warn: (...args) => warnings.push(args.join(' ')), error() {} },
        Date: FakeDate,
        JSON,
        Object,
        Array,
        Number,
        String,
        Set,
        Math,
        RegExp,
        Promise,
        window: null,
        location: { protocol: 'http:' },
        eveState: {
            config: {
                modularStateSyncEnabled: true,
                modularStateConflictStrategy: 'remote_wins'
            },
            links: clone(seedLinks)
        }
    };
    sandbox.window = sandbox;
    sandbox.window.location = sandbox.location;
    sandbox.window.eveState = sandbox.eveState;
    sandbox.window.EveDataStore = {
        Store: {
            captureState() {
                captures += 1;
                return clone(live);
            },
            applyState(next) {
                live = clone(next);
                return true;
            }
        }
    };
    sandbox.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    vm.createContext(sandbox);
    for (const module of ['codec', 'full', 'cache']) {
        const file = path.join(path.dirname(SHARED), `modular-state-sync.capture.${module}.js`);
        vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    }
    vm.runInContext(sharedSource, sandbox, { filename: SHARED });
    vm.runInContext(syncSource, sandbox, { filename: SYNC });

    const ns = sandbox.EveDataStore._modularSync;
    ns.requestJson = async (url, options = {}) => {
        requests.push({ url, options: clone(options) });
        return { ok: true, payload: { ok: true, status: { signature: `sig-${requests.length}` } } };
    };
    ns.refreshUiAfterRemoteApply = () => {};

    return {
        ns,
        requests,
        warnings,
        get captures() { return captures; },
        get live() { return live; },
        setLive(next) { live = next; },
        advance(ms) { now += ms; }
    };
}

(async () => {
    const h = makeHarness();
    const first = h.ns.captureStatePayload();
    const second = h.ns.captureStatePayload();
    assert(first && second, 'payload capture returns snapshots');
    assert.strictEqual(h.captures, 1, 'same epoch reuses detached payload');
    assert.strictEqual(second.json, first.json, 'same epoch reuses exact serialized payload');
    assert.strictEqual(second.hash, first.hash, 'same epoch reuses exact semantic hash');
    assert.strictEqual(first.hash, h.ns.hashState(JSON.parse(first.json)), 'payload and semantic hash agree');
    assert.strictEqual(h.ns.captureStateHash(), first.hash, 'hash lookup agrees with payload pair');
    assert.strictEqual(h.captures, 1, 'hash lookup does not recapture a fresh pair');

    // A failed save must not force a second capture on retry when the decision
    // already owns a known fresh hash.
    let saveAttempts = 0;
    h.ns.requestJson = async (url, options = {}) => {
        h.requests.push({ url, options: clone(options) });
        saveAttempts += 1;
        if (saveAttempts === 1) return { ok: false, payload: { ok: false, error: 'retry' } };
        return { ok: true, payload: { ok: true, status: { signature: 'saved' } } };
    };
    assert.strictEqual(await h.ns.pushLocalState(true, first.hash), false, 'failed known-hash push reports false');
    assert.strictEqual(await h.ns.pushLocalState(true, first.hash), true, 'retry with same known hash succeeds');
    assert.strictEqual(h.captures, 1, 'known-hash retry reuses detached snapshot');
    assert.strictEqual(h.requests[0].options.body, h.requests[1].options.body, 'retry sends identical immutable payload');

    const oldHash = first.hash;
    h.setLive({ nested: { value: 2 }, bookmarks: { links: [] } });
    h.ns.invalidateLocalStateHash();
    const afterMutation = h.ns.captureStatePayload();
    assert.strictEqual(h.captures, 2, 'epoch invalidation forces recapture');
    assert.notStrictEqual(afterMutation.hash, oldHash, 'epoch invalidation refreshes semantic hash');
    const requestCount = h.requests.length;
    assert.strictEqual(await h.ns.pushLocalState(true, oldHash), false, 'stale known hash is rejected');
    assert.strictEqual(h.requests.length, requestCount, 'stale known hash never reaches remote save');

    // Silent/unbroadcast nested writes retain the existing TTL semantics: they
    // remain memoized inside the window, then are discovered after 60 seconds.
    const beforeSilent = h.ns.captureStatePayload();
    h.live.nested.value = 3;
    const insideTtl = h.ns.captureStatePayload();
    assert.strictEqual(insideTtl.hash, beforeSilent.hash, 'silent nested write stays memoized inside TTL');
    assert.strictEqual(h.captures, 2, 'silent nested write does not recapture inside TTL');
    h.advance(60001);
    const afterTtl = h.ns.captureStatePayload();
    assert.strictEqual(h.captures, 3, 'TTL expiry forces recapture');
    assert.notStrictEqual(afterTtl.hash, beforeSilent.hash, 'TTL safety net observes silent nested write');

    // Explicit push with no known hash remains fresh even inside TTL.
    h.live.nested.value = 4;
    const capturesBeforeExplicit = h.captures;
    await h.ns.pushLocalState(true);
    assert.strictEqual(h.captures, capturesBeforeExplicit + 1, 'explicit force push captures fresh state');
    assert.strictEqual(JSON.parse(h.requests.at(-1).options.body).nested.value, 4, 'explicit push sends latest state');

    // Mutation during the awaited remote-status boundary must refresh local
    // identity before choosing a push payload.
    const a = makeHarness({ nested: { value: 10 }, bookmarks: { links: [] } });
    a.ns.state.lastUploadedHash = '';
    a.ns.state.lastSyncedLocalHash = '';
    a.ns.state.remoteSignature = '';
    let savedBody = null;
    a.ns.getRemoteStatus = async () => {
        a.setLive({ nested: { value: 11 }, bookmarks: { links: [] } });
        a.ns.invalidateLocalStateHash();
        return { signature: '', fileCount: 0 };
    };
    a.ns.requestJson = async (url, options = {}) => {
        if (url.endsWith('/save')) savedBody = options.body;
        return { ok: true, payload: { ok: true, status: { signature: 'after-await' } } };
    };
    await a.ns.syncCycle();
    assert(savedBody, 'sync saves after empty remote baseline');
    assert.strictEqual(JSON.parse(savedBody).nested.value, 11, 'post-await push uses refreshed payload');
    assert.strictEqual(a.ns.state.lastUploadedHash, a.ns.hashState(JSON.parse(savedBody)), 'post-await baseline hash matches saved payload');

    const guardedLink = { title: 'Keep', url: 'https://example.test/keep', category: 'Test' };
    const guardedSeed = { nested: { value: 10 }, bookmarks: { links: [guardedLink] } };
    const emptyRemote = { nested: { value: 0 }, bookmarks: { links: [] } };

    // Exact regression: bootstrap takes hash A, the local epoch changes while
    // awaiting /load, destructive empty remote is rejected, and fallback must
    // send the latest value/hash B rather than falsely marking it synchronized.
    const b = makeHarness(guardedSeed);
    b.ns.getRemoteStatus = async () => ({ signature: 'remote-zero', fileCount: 1 });
    const bootstrapSaves = [];
    b.ns.requestJson = async (url, options = {}) => {
        b.requests.push({ url, options: clone(options) });
        if (url.endsWith('/load')) {
            b.setLive({ nested: { value: 11 }, bookmarks: { links: [guardedLink] } });
            b.ns.invalidateLocalStateHash();
            return {
                ok: true,
                payload: { ok: true, state: clone(emptyRemote), status: { signature: 'remote-zero' } }
            };
        }
        if (url.endsWith('/save')) {
            bootstrapSaves.push(options.body);
            return { ok: true, payload: { ok: true, status: { signature: 'remote-eleven' } } };
        }
        return { ok: true, payload: { ok: true } };
    };
    await b.ns.bootstrap();
    assert.strictEqual(bootstrapSaves.length, 1, 'rejected bootstrap load performs one fallback save');
    assert.strictEqual(JSON.parse(bootstrapSaves[0]).nested.value, 11, 'bootstrap fallback sends newest local state');
    const bootstrapSavedHash = b.ns.hashState(JSON.parse(bootstrapSaves[0]));
    assert.strictEqual(b.ns.state.lastUploadedHash, bootstrapSavedHash, 'bootstrap uploaded baseline matches accepted payload');
    assert.strictEqual(b.ns.state.lastSyncedLocalHash, bootstrapSavedHash, 'bootstrap synced baseline matches accepted payload');
    assert.strictEqual(b.ns.state.remoteSignature, 'remote-eleven', 'bootstrap keeps signature returned by accepted save');

    // A failed fallback save must leave bootstrap dirty/retryable. Advancing
    // beyond the memo TTL and running another cycle must retry and synchronize;
    // bootstrap must never manufacture a clean baseline after the failed POST.
    const r = makeHarness(guardedSeed);
    r.ns.getRemoteStatus = async () => ({ signature: 'remote-zero', fileCount: 1 });
    let retryLoads = 0;
    let retrySaves = 0;
    let retrySavedBody = null;
    r.ns.requestJson = async (url, options = {}) => {
        r.requests.push({ url, options: clone(options) });
        if (url.endsWith('/load')) {
            retryLoads += 1;
            if (retryLoads === 1) {
                r.setLive({ nested: { value: 11 }, bookmarks: { links: [guardedLink] } });
                r.ns.invalidateLocalStateHash();
            }
            return {
                ok: true,
                payload: { ok: true, state: clone(emptyRemote), status: { signature: 'remote-zero' } }
            };
        }
        if (url.endsWith('/save')) {
            retrySaves += 1;
            if (retrySaves === 1) {
                return { ok: false, payload: { ok: false, error: 'temporary-save-failure' } };
            }
            retrySavedBody = options.body;
            return { ok: true, payload: { ok: true, status: { signature: 'remote-retried' } } };
        }
        return { ok: true, payload: { ok: true } };
    };
    await r.ns.bootstrap();
    assert.strictEqual(retrySaves, 1, 'bootstrap attempted the rejected-load fallback save once');
    assert.strictEqual(r.ns.state.lastUploadedHash, '', 'failed bootstrap save does not advance uploaded baseline');
    assert.strictEqual(r.ns.state.lastSyncedLocalHash, '', 'failed bootstrap save does not advance synced baseline');
    assert.strictEqual(r.ns.state.remoteSignature, '', 'failed bootstrap remains eligible for immediate remote retry');
    r.advance(60001);
    await r.ns.syncCycle();
    assert.strictEqual(retrySaves, 2, 'later sync cycle retries failed bootstrap fallback');
    assert(retrySavedBody, 'retry cycle eventually saves local state');
    assert.strictEqual(JSON.parse(retrySavedBody).nested.value, 11, 'retry sends the unsent local edit');
    const retryHash = r.ns.hashState(JSON.parse(retrySavedBody));
    assert.strictEqual(r.ns.state.lastUploadedHash, retryHash, 'successful retry advances uploaded baseline to accepted payload');
    assert.strictEqual(r.ns.state.lastSyncedLocalHash, retryHash, 'successful retry advances synced baseline to accepted payload');

    // The analogous syncCycle rejected-load fallback must also refresh local
    // identity after /load before uploading.
    const s = makeHarness({ nested: { value: 30 }, bookmarks: { links: [guardedLink] } });
    const sBaseline = s.ns.captureStateHash();
    s.ns.state.lastUploadedHash = sBaseline;
    s.ns.state.lastSyncedLocalHash = sBaseline;
    s.ns.state.remoteSignature = 'remote-old';
    s.setLive({ nested: { value: 31 }, bookmarks: { links: [guardedLink] } });
    s.ns.invalidateLocalStateHash();
    s.ns.getRemoteStatus = async () => ({ signature: 'remote-new', fileCount: 1 });
    let syncFallbackBody = null;
    s.ns.requestJson = async (url, options = {}) => {
        s.requests.push({ url, options: clone(options) });
        if (url.endsWith('/load')) {
            s.setLive({ nested: { value: 32 }, bookmarks: { links: [guardedLink] } });
            s.ns.invalidateLocalStateHash();
            return {
                ok: true,
                payload: { ok: true, state: clone(emptyRemote), status: { signature: 'remote-new' } }
            };
        }
        if (url.endsWith('/save')) {
            syncFallbackBody = options.body;
            return { ok: true, payload: { ok: true, status: { signature: 'remote-thirty-two' } } };
        }
        return { ok: true, payload: { ok: true } };
    };
    await s.ns.syncCycle();
    assert(syncFallbackBody, 'syncCycle rejected-load fallback performs a save');
    assert.strictEqual(JSON.parse(syncFallbackBody).nested.value, 32, 'syncCycle fallback refreshes identity after awaited load');
    assert.strictEqual(s.ns.state.lastUploadedHash, s.ns.hashState(JSON.parse(syncFallbackBody)), 'syncCycle baseline matches accepted fallback payload');

    // Remote-wins behavior remains owned by the existing conflict path.
    const c = makeHarness({ nested: { value: 20 }, bookmarks: { links: [] } });
    const localHash = c.ns.captureStateHash();
    c.ns.state.lastUploadedHash = localHash;
    c.ns.state.lastSyncedLocalHash = localHash;
    c.ns.state.remoteSignature = 'old-remote';
    c.ns.getRemoteStatus = async () => ({ signature: 'new-remote', fileCount: 1 });
    c.ns.requestJson = async (url, options = {}) => {
        c.requests.push({ url, options: clone(options) });
        if (url.endsWith('/load')) {
            return {
                ok: true,
                payload: {
                    ok: true,
                    state: { nested: { value: 21 }, bookmarks: { links: [] } },
                    status: { signature: 'new-remote' }
                }
            };
        }
        return { ok: true, payload: { ok: true, status: { signature: 'unexpected-save' } } };
    };
    await c.ns.syncCycle();
    assert.strictEqual(c.live.nested.value, 21, 'remote-wins conflict still applies remote state');
    assert(!c.requests.some((entry) => entry.url.endsWith('/save')), 'remote-wins conflict does not introduce a push');

    // Exercise the new trusted receipt through the existing awaited sync and
    // failed-save paths, not only through the standalone cache's API.
    const incrementalSeed = { metadata: {}, bookmarks: { links: [guardedLink], config: {} },
        library: {}, knowledge: {}, audioflix: { music: [{ id: 'retained', volume: 1 }] }, audioflixStructure: null };
    const incremental = makeHarness(incrementalSeed);
    const incrementalBaseline = incremental.ns.captureStateHash();
    incremental.ns.state.lastUploadedHash = incrementalBaseline;
    incremental.ns.state.lastSyncedLocalHash = incrementalBaseline;
    incremental.ns.state.remoteSignature = 'same-remote';
    let changedDuringAwait = false;
    incremental.ns.getRemoteStatus = async () => {
        if (!changedDuringAwait) {
            changedDuringAwait = true;
            incremental.live.audioflix.music[0].volume = 0.25;
            const receipt = incremental.ns.offerConfigSnapshot(JSON.stringify({ audioflix: incremental.live.audioflix }),
                { complete: true, changedKeys: ['audioflix'] });
            incremental.ns.invalidateLocalStateHash({ kind: 'config', captureReceipt: receipt });
        }
        return { signature: 'same-remote', fileCount: 1 };
    };
    const incrementalBodies = [];
    incremental.ns.requestJson = async (url, options = {}) => {
        assert(url.endsWith('/save'), 'Unchanged remote does not need a pull');
        incrementalBodies.push(options.body);
        return { ok: incrementalBodies.length > 1, payload: { ok: incrementalBodies.length > 1 } };
    };
    await incremental.ns.syncCycle();
    assert.strictEqual(incremental.captures, 1, 'Receipt received during status await avoids full capture');
    assert.strictEqual(incremental.ns.captureCacheStats().incrementalCount, 1);
    assert.strictEqual(JSON.parse(incrementalBodies[0]).audioflix.music[0].volume, 0.25);
    assert.strictEqual(incremental.ns.state.lastUploadedHash, incrementalBaseline, 'Failed receipt push never advances baseline');
    assert(incremental.ns.isLocalDirty(incremental.ns.captureStateHash()), 'Failed receipt push stays dirty');
    await incremental.ns.syncCycle();
    assert.strictEqual(incrementalBodies[0], incrementalBodies[1], 'Retry uses exact detached incremental payload');
    assert.strictEqual(incremental.ns.state.lastUploadedHash, incremental.ns.hashState(JSON.parse(incrementalBodies[1])));
    assert.strictEqual(incremental.captures, 1, 'Incremental retry never recaptures the complete store');

    // A rejected destructive remote can mutate the trusted local epoch while
    // load is awaited; fallback still sends the latest receipt, not the old memo.
    const rejectedIncremental = makeHarness(incrementalSeed);
    rejectedIncremental.ns.getRemoteStatus = async () => ({ signature: 'empty-remote', fileCount: 1 });
    let rejectedBody;
    rejectedIncremental.ns.requestJson = async (url, options = {}) => {
        if (url.endsWith('/load')) {
            rejectedIncremental.live.audioflix.music[0].volume = 0.4;
            const receipt = rejectedIncremental.ns.offerConfigSnapshot(JSON.stringify({ audioflix: rejectedIncremental.live.audioflix }),
                { complete: true, changedKeys: ['audioflix'] });
            rejectedIncremental.ns.invalidateLocalStateHash({ kind: 'config', captureReceipt: receipt });
            return { ok: true, payload: { ok: true, state: emptyRemote } };
        }
        rejectedBody = options.body;
        return { ok: true, payload: { ok: true } };
    };
    await rejectedIncremental.ns.bootstrap();
    assert.strictEqual(JSON.parse(rejectedBody).audioflix.music[0].volume, 0.4);
    assert.strictEqual(rejectedIncremental.ns.state.lastUploadedHash, rejectedIncremental.ns.hashState(JSON.parse(rejectedBody)));
    assert.strictEqual(rejectedIncremental.captures, 1, 'Rejected remote fallback uses latest trusted sections');

    console.log('MODULAR_STATE_SYNC_PAYLOAD_CACHE_OK reuse=true payloadHash=true retry=true epoch=true ttl=true explicitFresh=true awaitedBoundary=true bootstrapRejectedMutation=true failedSaveRetry=true syncRejectedMutation=true conflict=true incrementalAwait=true incrementalRetry=true incrementalRejectedRemote=true');
})().catch((error) => {
    console.error(`MODULAR_STATE_SYNC_PAYLOAD_CACHE_FAIL ${error.stack || error.message}`);
    process.exitCode = 1;
});
