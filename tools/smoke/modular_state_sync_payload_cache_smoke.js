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
            links: []
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

    console.log('MODULAR_STATE_SYNC_PAYLOAD_CACHE_OK reuse=true payloadHash=true retry=true epoch=true ttl=true explicitFresh=true awaitedBoundary=true conflict=true');
})().catch((error) => {
    console.error(`MODULAR_STATE_SYNC_PAYLOAD_CACHE_FAIL ${error.stack || error.message}`);
    process.exitCode = 1;
});
