const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const MODULES = path.join(ROOT, 'js/modules/features/modular-state-sync');
const FAILURE = path.join(ROOT, 'data/runtime/smoke-results/modular-state-sync-sections-cache/latest-failure.json');
const clone = value => JSON.parse(JSON.stringify(value));
const delta = () => ({ kind: 'core-config-delta', complete: true, changedKeys: ['audioflix'], workspaceIds: [] });
let codec, cacheApi;

function freshCodec() {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    const file = path.join(MODULES, 'modular-state-sync.capture.codec.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    return sandbox.window.EveModularCaptureCodec;
}

function structure(audio) {
    if (!audio) return null;
    return { schema: 1, music: (audio.music || []).map(item => ({ id: item.id, folder: item.folder })),
        folders: clone(audio.musicFolders || []) };
}

function seed() {
    const audioflix = { music: [{ id: 'a', title: 'Track "one" \\ 😀', folder: 'Keep', volume: 0.5 }],
        musicFolders: ['Keep'], recentPlays: [] };
    return { metadata: { version: 'test', date: 'initial', generator: 'smoke' },
        bookmarks: { links: [{ id: 'link', title: 'Bookmark', url: 'https://example.test/' }], config: { theme: 'dark' } },
        library: { categories: [{ title: 'Category' }], connections: [] },
        knowledge: { scopedStorage: { test: [{ text: 'nested }, { [ ] " \\', lastUpdated: 1 }] } },
        audioflix, audioflixStructure: structure(audioflix) };
}

function harness(options = {}) {
    let clock = options.clock ?? 1000, live = seed(), captures = 0, structures = 0;
    const store = { captureState() { captures++; return fresh(); } };
    function fresh() {
        const result = clone(live);
        result.audioflixStructure = structure(result.audioflix);
        return result;
    }
    const cache = cacheApi.create({ getStore: () => store, now: () => clock, ttlMs: 60000,
        captureStructure(audio) { structures++; return structure(audio); } });
    function offer(nextAudio, configDelta = delta()) {
        live.audioflix = clone(nextAudio);
        const detachedConfig = clone({ theme: 'dark', audioflix: live.audioflix });
        return cache.offerConfigSnapshot(JSON.stringify(detachedConfig), configDelta, detachedConfig);
    }
    return { cache, store, fresh, offer, get live() { return live; },
        get captures() { return captures; }, get structures() { return structures; },
        get now() { return clock; }, setNow(value) { clock = value; } };
}

function nextAudio(h, title = 'Updated') {
    const next = clone(h.live.audioflix);
    next.music[0].title = title;
    return next;
}

function trustedChange(h, title) {
    const token = h.offer(nextAudio(h, title));
    assert.ok(token && Object.isFrozen(token), 'Trusted snapshot must issue a frozen receipt');
    h.cache.invalidate({ kind: 'config', captureReceipt: token });
    return { token, snapshot: h.cache.capture() };
}

function assertPair(snapshot) {
    assert.ok(snapshot && Object.isFrozen(snapshot), 'Payload/hash pair must be frozen');
    assert.equal(typeof snapshot.json, 'string');
    assert.equal(typeof snapshot.hash, 'string');
    assert.ok(snapshot.hash);
    assert.equal(snapshot.hash, codec.hashState(JSON.parse(snapshot.json)), 'Serialized payload and semantic hash must agree');
}

const tests = [
    ['codec-sections-and-root-order', () => {
        const original = seed(), json = JSON.stringify(original), parts = codec.splitObject(json);
        assert.equal(parts.size, 6);
        for (const [key, value] of Object.entries(original)) assert.equal(parts.get(key), JSON.stringify(value));
        assert.equal(codec.hashParts(parts), codec.hashState(original));
        const reversed = Object.fromEntries(Object.entries(original).reverse());
        assert.equal(codec.hashState(reversed), codec.hashState(original), 'Root insertion order must not change remote identity');
        assert.equal(codec.hashParts(codec.splitObject(JSON.stringify(reversed))), codec.hashState(original));
    }],
    ['codec-nested-volatile-and-meaningful-values', () => {
        const original = seed(), edited = clone(original);
        edited.metadata.date = 'new';
        edited.bookmarks.links[0].generatedAt = 123;
        edited.audioflix.music[0].date = 'new';
        edited.knowledge.scopedStorage.test[0].lastUpdated = 2;
        assert.equal(codec.hashState(edited), codec.hashState(original), 'Nested volatile metadata must be ignored');
        edited.knowledge.scopedStorage.test[0].text += ' meaningful';
        assert.notEqual(codec.hashState(edited), codec.hashState(original), 'Meaningful nested text must remain in hash');
    }],
    ['codec-forged-overrides-cannot-poison-identity', () => {
        const candidate = freshCodec(), oracle = freshCodec(), source = seed();
        const parts = candidate.splitObject(JSON.stringify(source));
        const overrides = new Map([['audioflix', 'sections-v1:0000000000000000']]);
        const expected = oracle.hashState(source);
        assert.equal(candidate.hashParts(parts, overrides), expected, 'Legacy extra arguments cannot supply section digests');
        assert.equal(candidate.hashState(source), expected, 'Independent codec must agree after attempted override');
        parts.set('audioflix', '{"music":');
        assert.throws(() => candidate.hashParts(parts, overrides), 'An override cannot bypass JSON validation');
        assert.equal(candidate.hashState(source), expected, 'Rejected malformed sections cannot poison memoized identity');
    }],
    ['deep-snapshot-hash-and-ttl-mutation', () => {
        const h = harness(), leaf = { meaningful: 'before', date: 'volatile' };
        let nested = leaf;
        for (let depth = 0; depth < 600; depth++) nested = { nested };
        h.live.knowledge.deep = nested;
        const first = h.cache.capture();
        assertPair(first);
        assert.equal(first.full, true);
        assert.equal(first.hash, codec.hashState(h.fresh()));
        leaf.meaningful = 'after';
        assert.strictEqual(h.cache.capture(), first, 'Silent deep mutation remains memoized inside TTL');
        h.setNow(first.capturedAt + 60000);
        const audited = h.cache.capture();
        assertPair(audited);
        assert.equal(audited.full, true);
        assert.equal(h.captures, 2);
        assert.notEqual(audited.hash, first.hash, 'Deep meaningful mutation must change the full-audit hash');
        let saved = JSON.parse(audited.json).knowledge.deep;
        for (let depth = 0; depth < 600; depth++) saved = saved.nested;
        assert.equal(saved.meaningful, 'after');
    }],
    ['initial-full-and-exact-pair-reuse', () => {
        const h = harness(), first = h.cache.capture(), second = h.cache.capture();
        assertPair(first);
        assert.equal(first.full, true);
        assert.equal(first.capturedAt, 1000);
        assert.equal(h.captures, 1);
        assert.strictEqual(second, first, 'Same epoch reuses the exact immutable pair');
        assert.deepEqual(JSON.parse(first.json), h.fresh());
        assert.equal(typeof h.cache.stats(), 'object');
    }],
    ['trusted-receipt-is-detached-and-incremental', () => {
        const h = harness(), baseline = h.cache.capture(), beforeStructures = h.structures;
        const expected = nextAudio(h, 'Receipt snapshot');
        const token = h.offer(expected);
        assert.ok(Object.isFrozen(token));
        h.live.audioflix.music[0].title = 'Later unbroadcast mutation';
        h.cache.invalidate({ kind: 'config', captureReceipt: token });
        assert.equal(h.structures, beforeStructures, 'Mutation receipt consumption must defer structure work until capture');
        const result = h.cache.capture();
        assertPair(result);
        assert.equal(result.full, false);
        assert.equal(h.captures, 1, 'Trusted Audioflix-only receipt must avoid full Store.captureState');
        assert.equal(h.structures, beforeStructures + 1);
        const payload = JSON.parse(result.json);
        assert.deepEqual(payload.audioflix, expected, 'Receipt must use detached signature bytes, not current live aliases');
        assert.deepEqual(payload.audioflixStructure, structure(expected));
        for (const key of ['metadata', 'bookmarks', 'library', 'knowledge']) {
            assert.deepEqual(payload[key], JSON.parse(baseline.json)[key], `${key} must survive incremental assembly`);
        }
        payload.audioflix.music[0].title = 'Mutating parsed output';
        assert.equal(JSON.parse(result.json).audioflix.music[0].title, 'Receipt snapshot');
        assert.equal(JSON.parse(baseline.json).audioflix.music[0].title, 'Track "one" \\ 😀');
        assert.strictEqual(h.cache.capture(), result);
    }],
    ['receipt-signature-owns-actual-third-argument', () => {
        const h = harness(); h.cache.capture();
        const expected = nextAudio(h, 'Signed Audioflix');
        h.live.audioflix = clone(expected);
        const passed = clone({ theme: 'dark', audioflix: expected });
        const signature = JSON.stringify(passed);
        const token = h.cache.offerConfigSnapshot(signature, delta(), passed);
        passed.audioflix.music[0].title = 'Mutated caller-owned snapshot';
        h.cache.invalidate({ kind: 'config', captureReceipt: token });
        passed.audioflix.musicFolders.push('Uncommitted folder');
        const result = h.cache.capture(), payload = JSON.parse(result.json);
        assert.equal(result.full, false);
        assert.equal(h.captures, 1);
        assert.deepEqual(payload.audioflix, expected, 'Caller aliases must not change offered signature bytes');
        assert.deepEqual(payload.audioflixStructure, structure(expected));
        assert.equal(result.hash, freshCodec().hashState(payload), 'An independent codec must verify the immutable payload identity');
    }],
    ['incremental-pair-matches-fresh-remote-state', () => {
        const h = harness(); h.cache.capture();
        for (const title of ['Second', 'Third', 'Fourth']) {
            const { snapshot } = trustedChange(h, title);
            assertPair(snapshot);
            const freshRemote = Object.fromEntries(Object.entries(h.fresh()).reverse());
            assert.deepEqual(JSON.parse(snapshot.json), h.fresh());
            assert.equal(snapshot.hash, codec.hashState(freshRemote));
            assert.equal(snapshot.full, false);
        }
        assert.equal(h.captures, 1);
    }],
    ['untrusted-and-full-scope-invalidation', () => {
        for (const variant of ['unknown', 'copied-token', 'foreign-token', 'missing-token', 'data-scope', 'bare-remote']) {
            const h = harness(); h.cache.capture();
            h.live.library.categories[0].title = variant;
            const token = h.offer(nextAudio(h, variant));
            let detail = { kind: 'config', captureReceipt: {} };
            if (variant === 'copied-token') detail.captureReceipt = Object.freeze({ ...token });
            if (variant === 'foreign-token') {
                const other = harness(); other.cache.capture();
                detail.captureReceipt = other.offer(nextAudio(other));
            }
            if (variant === 'missing-token') detail = { kind: 'config' };
            if (variant === 'data-scope') detail = { kind: 'data', captureReceipt: token };
            if (variant === 'bare-remote') detail = undefined;
            h.cache.invalidate(detail);
            const result = h.cache.capture();
            assert.equal(result.full, true, variant);
            assert.equal(h.captures, 2, variant);
            assert.deepEqual(JSON.parse(result.json), h.fresh(), variant);
            assertPair(result);
        }
    }],
    ['receipt-eligibility-and-malformed-signatures', () => {
        const variants = [
            ['incomplete', { complete: false, changedKeys: ['audioflix'] }],
            ['other-key', { complete: true, changedKeys: ['theme'] }],
            ['multiple-keys', { complete: true, changedKeys: ['audioflix', 'theme'] }],
            ['missing-scope', {}], ['malformed-json', delta(), '{"audioflix":'],
            ['non-object-json', delta(), '[1,2,3]'],
        ];
        for (const [id, configDelta, signature] of variants) {
            const h = harness(); h.cache.capture();
            h.live.bookmarks.links[0].title = id;
            h.live.audioflix = nextAudio(h, id);
            const raw = signature ?? JSON.stringify({ theme: 'dark', audioflix: h.live.audioflix });
            const token = h.cache.offerConfigSnapshot(raw, configDelta);
            h.cache.invalidate({ kind: 'config', captureReceipt: token });
            const result = h.cache.capture();
            assert.equal(result.full, true, id);
            assert.equal(h.captures, 2, id);
            assert.deepEqual(JSON.parse(result.json), h.fresh(), id);
        }
    }],
    ['consumed-and-stale-receipts-force-full', () => {
        const h = harness(); h.cache.capture();
        const oldToken = h.offer(nextAudio(h, 'Old pending receipt'));
        const { token } = trustedChange(h, 'Current receipt');
        h.cache.invalidate({ kind: 'config', captureReceipt: token });
        assert.equal(h.cache.capture().full, true, 'Replaying consumed receipt must force full capture');
        assert.equal(h.captures, 2);
        h.cache.invalidate({ kind: 'config', captureReceipt: oldToken });
        assert.equal(h.cache.capture().full, true, 'Older trust-epoch receipt must force full capture');
        assert.equal(h.captures, 3);
    }],
    ['unknown-invalidation-dominates-later-receipt', () => {
        const h = harness(); h.cache.capture();
        h.live.knowledge.scopedStorage.test[0].text = 'Unknown full-state edit';
        h.cache.invalidate({ kind: 'data' });
        const { snapshot } = trustedChange(h, 'Later Audioflix-only edit');
        assert.equal(snapshot.full, true, 'Trusted receipt cannot erase an earlier unknown-scope invalidation');
        assert.equal(h.captures, 2);
        assert.deepEqual(JSON.parse(snapshot.json), h.fresh());
    }],
    ['ttl-full-audit-deadline-survives-incremental-captures', () => {
        const h = harness(), initial = h.cache.capture();
        h.live.bookmarks.links[0].title = 'Silent bookmark edit';
        h.setNow(initial.capturedAt + 40000);
        assert.equal(trustedChange(h, 'At forty seconds').snapshot.full, false);
        h.setNow(initial.capturedAt + 59999);
        const incremental = trustedChange(h, 'Just before audit deadline').snapshot;
        assert.equal(incremental.full, false);
        assert.equal(incremental.capturedAt, h.now);
        assert.equal(h.captures, 1);
        assert.equal(JSON.parse(incremental.json).bookmarks.links[0].title, 'Bookmark');
        h.setNow(initial.capturedAt + 60000);
        const audited = h.cache.capture();
        assert.equal(audited.full, true, 'Exactly 60000ms since full audit must force complete capture');
        assert.equal(h.captures, 2, 'Incremental capturedAt must not extend full-audit deadline');
        assert.equal(JSON.parse(audited.json).bookmarks.links[0].title, 'Silent bookmark edit');
        assertPair(audited);
    }],
    ['zero-clock-and-exact-ttl-boundary', () => {
        const h = harness({ clock: 0 }), first = h.cache.capture();
        h.setNow(59999);
        assert.strictEqual(h.cache.capture(), first);
        h.setNow(60000);
        assert.equal(h.cache.capture().full, true);
        assert.equal(h.captures, 2, 'A full audit at clock zero remains a valid deadline origin');
    }],
    ['force-fresh-and-bare-remote-invalidation', () => {
        const h = harness(); h.cache.capture();
        h.live.library.categories[0].title = 'Silent edit';
        const forced = h.cache.capture({ forceFresh: true });
        assert.equal(forced.full, true);
        assert.equal(h.captures, 2);
        assert.deepEqual(JSON.parse(forced.json), h.fresh());
        h.live.bookmarks.links[0].title = 'Remote-applied replacement';
        h.cache.invalidate();
        const remote = h.cache.capture();
        assert.equal(remote.full, true);
        assert.equal(h.captures, 3);
        assert.deepEqual(JSON.parse(remote.json), h.fresh());
    }],
    ['null-and-removed-audioflix-receipts', () => {
        for (const config of [{ theme: 'dark', audioflix: null }, { theme: 'dark' }]) {
            const h = harness(); h.cache.capture(); h.live.audioflix = null;
            const token = h.cache.offerConfigSnapshot(JSON.stringify(config), delta());
            h.cache.invalidate({ kind: 'config', captureReceipt: token });
            const result = h.cache.capture();
            assert.equal(result.full, false);
            assert.equal(h.captures, 1);
            assert.deepEqual(JSON.parse(result.json), h.fresh());
            assertPair(result);
        }
    }],
];

const failures = [], passed = [];
try {
    const sandbox = { console: { log() {}, warn() {}, error() {} } };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const name of ['modular-state-sync.capture.codec.js', 'modular-state-sync.capture.cache.js']) {
        const file = path.join(MODULES, name);
        vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    }
    codec = sandbox.EveModularCaptureCodec; cacheApi = sandbox.EveModularCaptureCache;
    assert.ok(codec && cacheApi, 'Browser codec and cache APIs must load');
    for (const [id, run] of tests) {
        try { run(); passed.push(id); }
        catch (error) { failures.push({ id, error: String(error.stack || error), actual: error.actual, expected: error.expected }); }
    }
} catch (error) { failures.push({ id: 'module-loading', error: String(error.stack || error) }); }
if (failures.length) {
    fs.mkdirSync(path.dirname(FAILURE), { recursive: true });
    fs.writeFileSync(FAILURE, JSON.stringify({ passed, total: tests.length, failures }, null, 2));
    console.error(`MODULAR_STATE_SYNC_SECTIONS_CACHE_FAIL passed=${passed.length}/${tests.length} artifact=${FAILURE}`);
    for (const failure of failures) console.error(`[${failure.id}] ${failure.error.split('\n').slice(0, 8).join('\n')}`);
    process.exitCode = 1;
} else {
    if (process.argv.includes('--verbose')) for (const id of passed) console.log(`PASS ${id}`);
    console.log(`MODULAR_STATE_SYNC_SECTIONS_CACHE_OK passed=${passed.length}/${tests.length}`);
}
