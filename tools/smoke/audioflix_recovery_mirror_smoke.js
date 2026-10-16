const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const DIR = 'js/modules/features/audioflix/';
const ARTIFACT = path.join(ROOT, 'data/runtime/smoke-results/audioflix-recovery-mirror.json');
const evidence = { ok: false, cases: [] };
let current = 'startup';
const drain = async () => { for (let n = 0; n < 30; n += 1) await Promise.resolve(); };

function source(relative) { return fs.readFileSync(path.join(ROOT, relative), 'utf8'); }
function run(sandbox, relative) { vm.runInContext(source(relative), sandbox, { filename: relative }); }
async function test(id, work) {
    current = id;
    let timer;
    try {
        await Promise.race([work(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Test did not settle: ${id}`)), 15000);
        })]);
        evidence.cases.push(id);
    } finally { clearTimeout(timer); }
}

async function transactionFixture() {
    const transactions = [];
    const db = {
        objectStoreNames: { contains: () => true },
        transaction(storeName, mode, options) {
            const req = {}, getReq = {};
            const tx = { error: null, objectStore: () => ({ put: () => req, get: () => getReq,
                delete: () => req, clear: () => req }) };
            transactions.push({ tx, req, getReq, storeName, mode, options });
            return tx;
        }
    };
    const sandbox = { console: { warn() {}, error() {} }, indexedDB: {
        open() {
            const request = {};
            queueMicrotask(() => request.onsuccess?.({ target: { result: db } }));
            return request;
        }
    } };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    run(sandbox, 'js/modules/core/indexeddb-store.js');
    await sandbox.IDBStore.init();
    return { api: sandbox.IDBStore, transactions };
}

function library(revision = 1) {
    return {
        durabilityRevision: revision, durabilityUpdatedAt: revision * 100,
        music: Array.from({ length: 16 }, (_, index) => ({
            id: `mirror-${index}`, title: `Track ${index}`, folder: 'Bulk',
            url: `https://example.invalid/track/${index}`, sourceId: `source-${index}`,
            description: 'owned-data-'.repeat(32768)
        })),
        soundboard: [], musicFolders: ['Bulk'], musicGroups: ['Parent', 'Child'],
        musicGroupParents: { Child: 'Parent' }, musicGroupMap: { 'mirror-0': ['Child'] },
        musicClassifiers: ['Saved'], localizeScopeDirs: { 'folder:Bulk': 'C:/Synthetic/Bulk' }
    };
}

function mirrorFixture(options = {}) {
    const idb = options.idb || new Map();
    const local = options.local || new Map();
    const writes = [], heldWrites = [], heldReads = [], warnings = [];
    const sandbox = {
        Blob, TextEncoder, TextDecoder, setTimeout, clearTimeout, structuredClone, performance,
        console: { warn: (...values) => warnings.push(values.map(String).join(' ')), error() {} },
        localStorage: {
            getItem: key => local.has(key) ? local.get(key) : null,
            setItem(key, value) {
                if (options.quota && String(value).length > options.quota) {
                    throw Object.assign(new Error('synthetic localStorage quota'), { name: 'QuotaExceededError' });
                }
                local.set(key, String(value));
            },
            removeItem: key => local.delete(key)
        },
        IDBStore: {
            init: async () => { if (options.unavailable) throw new Error('synthetic IndexedDB unavailable'); return {}; },
            isAvailable: () => !options.unavailable,
            async get(key) {
                if (options.unavailable) return undefined;
                if (options.holdReads) await new Promise(resolve => heldReads.push(resolve));
                return idb.get(key);
            },
            async set(key, value) {
                if (options.unavailable) return false;
                const capture = structuredClone(value);
                writes.push({ key, value: capture });
                if (options.holdWrites) {
                    const result = await new Promise(resolve => heldWrites.push(resolve));
                    if (!result) return false;
                }
                idb.set(key, capture);
                return true;
            },
            async setIf(key, value, accept) {
                if (options.unavailable) return false;
                const capture = structuredClone(value);
                writes.push({ key, value: capture });
                if (options.failAfter !== undefined && writes.length > options.failAfter) return false;
                if (options.holdWrites) {
                    const result = await new Promise(resolve => heldWrites.push(resolve));
                    if (!result) return false;
                }
                if (typeof accept === 'function' && !accept(idb.get(key))) return false;
                idb.set(key, capture);
                return true;
            },
            remove: async key => idb.delete(key)
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    run(sandbox, `${DIR}audioflix.state.recovery.js`);
    run(sandbox, `${DIR}audioflix.state.mirror.js`);
    return { api: sandbox.EveAudioflixRecoveryMirror, guard: sandbox.EveAudioflixStateRecovery,
        sandbox, idb, local, writes, heldWrites, heldReads, warnings };
}

(async () => {
    for (const operation of ['set', 'remove', 'clear']) {
        await test(`indexeddb-${operation}-waits-for-commit`, async () => {
            const f = await transactionFixture();
            let settled = false;
            const pending = Promise.resolve(f.api[operation]('test-key', { value: 1 })).then(result => {
                settled = true; return result;
            });
            await drain();
            assert.equal(f.transactions.length, 1);
            const { req, tx } = f.transactions[0];
            req.onsuccess?.({ target: { result: true } });
            await drain();
            assert.equal(settled, false, 'request success is not committed durability');
            assert.equal(typeof tx.oncomplete, 'function');
            tx.oncomplete();
            assert.equal(await pending, true);
        });
        await test(`indexeddb-${operation}-abort-after-request-success`, async () => {
            const f = await transactionFixture();
            const pending = Promise.resolve(f.api[operation]('test-key', { value: 1 }));
            await drain();
            const { req, tx } = f.transactions[0];
            req.onsuccess?.();
            tx.error = new Error('synthetic transaction abort');
            assert.equal(typeof tx.onabort, 'function');
            tx.onabort({ target: tx });
            assert.equal(await pending.catch(() => false), false, 'abort must never report written');
        });
    }

    await test('indexeddb-conditional-write-is-atomic-and-committed', async () => {
        const f = await transactionFixture();
        let settled = false, previous;
        const pending = f.api.setIf('conditional', { revision: 2 }, value => {
            previous = value; return value.revision < 2;
        }).then(result => { settled = true; return result; });
        await drain();
        const { req, getReq, tx, mode } = f.transactions[0];
        assert.equal(mode, 'readwrite', 'predicate read and replacement share one write transaction');
        getReq.result = { revision: 1 };
        getReq.onsuccess?.({ target: getReq });
        req.onsuccess?.(); await drain();
        assert.equal(previous.revision, 1);
        assert.equal(settled, false);
        tx.oncomplete(); assert.equal(await pending, true);
    });

    await test('indexeddb-conditional-refusal-is-not-success', async () => {
        const f = await transactionFixture();
        const pending = f.api.setIf('conditional', { revision: 1 }, () => false);
        await drain();
        const { getReq, tx } = f.transactions[0];
        getReq.result = { revision: 2 }; getReq.onsuccess?.({ target: getReq });
        tx.oncomplete(); assert.equal(await pending, false);
    });

    await test('large-mirror-awaits-commit-and-owns-capture', async () => {
        const f = mirrorFixture({ holdWrites: true, quota: 1024 * 1024 });
        const state = library();
        let settled = false;
        const pending = f.api.write('commit', state).then(result => { settled = true; return result; });
        await drain();
        assert.ok(f.heldWrites.length > 0, 'large state uses a committed IndexedDB write');
        assert.equal(settled, false);
        state.music[0].title = 'MUTATED AFTER CAPTURE'; state.durabilityRevision = 99;
        while (f.heldWrites.length) { f.heldWrites.shift()(true); await drain(); }
        assert.equal((await pending).written, true);
        const cold = mirrorFixture({ idb: f.idb, local: f.local });
        const loaded = await cold.api.load('commit');
        assert.equal(loaded.state.music[0].title, 'Track 0');
        assert.equal(loaded.state.durabilityRevision, 1);
        assert.ok(loaded.structure.musicRefs.some(ref => ref.id === 'mirror-0' && !('url' in ref)));
    });

    await test('serial-writes-newest-revision-survives', async () => {
        const f = mirrorFixture({ holdWrites: true, quota: 1024 * 1024 });
        const first = f.api.write('serial', library(1));
        await drain();
        const second = f.api.write('serial', library(2));
        await drain();
        for (let n = 0; n < 20; n += 1) {
            while (f.heldWrites.length) f.heldWrites.shift()(true);
            await drain();
        }
        assert.equal((await first).written, true);
        assert.equal((await second).written, true);
        const loaded = await mirrorFixture({ idb: f.idb }).api.load('serial');
        assert.equal(loaded.state.durabilityRevision, 2);
    });

    await test('superseded-owner-cannot-commit-or-report-written', async () => {
        const f = mirrorFixture({ holdWrites: true, quota: 1024 * 1024 });
        let ownerCurrent = true;
        const pending = f.api.write('owner', library(7), { isCurrent: () => ownerCurrent });
        await drain(); assert.ok(f.heldWrites.length > 0);
        ownerCurrent = false;
        for (let n = 0; n < 20; n += 1) {
            while (f.heldWrites.length) f.heldWrites.shift()(true);
            await drain();
        }
        const result = await pending;
        assert.equal(result.written, false);
        assert.equal(result.kind, 'superseded');
        assert.equal((await mirrorFixture({ idb: f.idb }).api.load('owner')).state, null);
    });

    await test('cross-tab-stale-commit-cannot-replace-newer-mirror', async () => {
        const idb = new Map();
        const oldTab = mirrorFixture({ idb, holdWrites: true, quota: 1024 * 1024 });
        const oldWrite = oldTab.api.write('cross-tab', library(9));
        await drain();
        assert.ok(oldTab.heldWrites.length > 0);
        const newTab = mirrorFixture({ idb, quota: 1024 * 1024 });
        assert.equal((await newTab.api.write('cross-tab', library(10))).written, true);
        for (let n = 0; n < 20; n += 1) {
            while (oldTab.heldWrites.length) oldTab.heldWrites.shift()(true);
            await drain();
        }
        assert.equal((await oldWrite).written, false, 'atomic acceptance refuses the older tab at commit');
        assert.equal((await mirrorFixture({ idb }).api.load('cross-tab')).state.durabilityRevision, 10);
    });

    await test('structural-journal-survives-full-mirror-failure', async () => {
        const f = mirrorFixture({ failAfter: 1, quota: 1024 });
        assert.equal((await f.api.write('structure-only', library(3))).written, false);
        const loaded = await mirrorFixture({ idb: f.idb, local: f.local }).api.load('structure-only');
        assert.equal(loaded.state?.music?.length || 0, 0, 'topology never manufactures playable song copies');
        assert.equal(loaded.structure.musicRefs.length, 16);
        assert.ok(loaded.structure.musicRefs.every(ref => !('url' in ref)));
        assert.equal(loaded.structure.musicGroupParents.Child, 'Parent');
        const cold = mirrorFixture({ idb: f.idb, local: f.local });
        await cold.api.load('structure-only');
        const item = { id: 'mirror-0', title: 'Track 0', folder: '', classifiers: [] };
        const rebuilt = { music: [item], musicGroups: [], musicGroupMap: {}, musicFolders: [] };
        assert.equal(cold.guard.applyTrackStructure('structure-only', rebuilt, item, 'music'), true,
            'single-track reimports can consume the independent IndexedDB journal without a localStorage copy');
        assert.equal(item.folder, 'Bulk');
        assert.ok(rebuilt.musicGroupMap[item.id].includes('Child'));
    });

    await test('cold-load-does-not-overwrite-local-mutation', async () => {
        const initial = mirrorFixture();
        await initial.api.write('mutation', library(20));
        const f = mirrorFixture({ idb: initial.idb, holdReads: true });
        const config = { audioflix: { durabilityRevision: 1, music: [{ id: 'local', title: 'Before' }] } };
        const pending = f.api.restoreConfig(config, 'mutation');
        await drain();
        assert.ok(f.heldReads.length > 0);
        config.audioflix.music[0].title = 'Keep local mutation';
        config.audioflix.durabilityRevision += 1;
        for (let n = 0; n < 20; n += 1) {
            while (f.heldReads.length) f.heldReads.shift()();
            await drain();
        }
        await pending;
        assert.equal(config.audioflix.music[0].title, 'Keep local mutation');
        assert.equal(config.audioflix.durabilityRevision, 2);
    });

    await test('cold-load-does-not-overwrite-replaced-root', async () => {
        const initial = mirrorFixture();
        await initial.api.write('replacement', library(20));
        const f = mirrorFixture({ idb: initial.idb, holdReads: true });
        const config = { audioflix: { durabilityRevision: 1, music: [] } };
        const pending = f.api.restoreConfig(config, 'replacement');
        await drain();
        const replacement = { durabilityRevision: 2, music: [{ id: 'replacement' }] };
        config.audioflix = replacement;
        for (let n = 0; n < 20; n += 1) {
            while (f.heldReads.length) f.heldReads.shift()();
            await drain();
        }
        await pending;
        assert.equal(config.audioflix, replacement);
    });

    await test('legacy-fallback-and-unavailable-database', async () => {
        const key = 'legacy', legacy = { music: [{ id: 'legacy-song' }], durabilityRevision: 4 };
        const f = mirrorFixture({ unavailable: true, local: new Map([[key, JSON.stringify(legacy)]]) });
        assert.equal(f.guard.read(key).state.music[0].id, 'legacy-song');
        const updated = { ...legacy, durabilityRevision: 5 };
        assert.equal(f.guard.write(key, updated).written, true, 'legacy synchronous fallback remains usable without IndexedDB');
        const failed = mirrorFixture({ unavailable: true, quota: 1024 });
        assert.equal((await failed.api.write('unavailable', library())).written, false);
    });

    await test('empty-and-stale-shrink-cannot-destroy-mirror', async () => {
        const f = mirrorFixture();
        await f.api.write('protected', library(9));
        assert.equal((await f.api.write('protected', { music: [], soundboard: [] })).written, false);
        assert.equal((await f.api.write('protected', { music: [{ id: 'one' }], durabilityRevision: 8 })).written, false);
        const loaded = await mirrorFixture({ idb: f.idb, local: f.local }).api.load('protected');
        assert.equal(loaded.state.music.length, 16);
        assert.equal(loaded.state.durabilityRevision, 9);
    });

    await test('corrupt-indexeddb-body-is-rejected-and-preserved', async () => {
        const f = mirrorFixture();
        await f.api.write('damaged-db', library(9));
        const full = [...f.idb].find(([key]) => !key.endsWith(':structure'));
        assert.ok(full, 'committed full mirror exists before fault injection');
        const raw = '{"music":[{"id":"truncated"';
        f.idb.set(full[0], { ...full[1], body: new Blob([raw], { type: 'application/json' }) });
        const cold = mirrorFixture({ idb: f.idb });
        const loaded = await cold.api.load('damaged-db');
        assert.equal(loaded.damaged, true);
        assert.equal(loaded.state, null);
        assert.equal(loaded.structure.musicRefs.length, 16, 'good independent topology survives corrupt full state');
        assert.equal((await cold.api.write('damaged-db', library(10))).written, false);
        assert.equal(await f.idb.get(full[0]).body.text(), raw, 'rejected save leaves unreadable bytes recoverable');
    });

    await test('corrupt-legacy-remains-recoverable', async () => {
        const raw = '{"music":[{"id":"truncated"';
        const f = mirrorFixture({ unavailable: true, local: new Map([['damaged', raw]]) });
        const loaded = f.guard.read('damaged');
        assert.equal(loaded.damaged, true);
        assert.equal(f.guard.write('damaged', {}).written, false);
        assert.equal(f.local.get('damaged'), raw);
        assert.equal(f.local.get('damaged.corrupt'), raw);
    });

    evidence.ok = true;
    console.log(`AUDIOFLIX_RECOVERY_MIRROR_SMOKE_OK cases=${evidence.cases.length} committed=true legacy=true fencing=true`);
})().catch(error => {
    evidence.failed = current;
    evidence.error = String(error?.stack || error);
    console.error(`AUDIOFLIX_RECOVERY_MIRROR_SMOKE_FAIL ${current}\n${evidence.error.split('\n').slice(0, 30).join('\n')}`);
    process.exitCode = 1;
}).finally(() => {
    fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
    fs.writeFileSync(ARTIFACT, JSON.stringify(evidence, null, 2));
});
