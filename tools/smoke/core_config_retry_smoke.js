// Deterministic VM coverage for acknowledged, ordered core config persistence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const artifact = path.join(root, 'data/runtime/smoke-results/core-config-retry.json');
const source = fs.readFileSync(path.join(root, 'js/modules/core/storage.js'), 'utf8');
const deltaSource = fs.readFileSync(path.join(root, 'js/modules/core/storage.delta.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const evidence = { ok: false, passed: [], cases: {} };

function fixture({ fallback = false, quota = false, prune = false, staged = false } = {}) {
    const config = { theme: 'dark', reader: { choice: 'accepted' }, audioflix: { music: [{ id: 'a', title: 'accepted' }] } };
    const calls = [], events = [], history = [], errors = [], offers = [], localWrites = [], yieldGates = [];
    let active = 0, peak = 0, prunes = 0;
    const storage = { syncThemeBootConfig() {}, getThemeBootConfig: value => ({ theme: value.theme }),
        saveJson(_key, value, options) {
            active += 1; peak = Math.max(peak, active);
            return new Promise((resolve, reject) => calls.push({ value, options, settled: false,
                settle(result = true) {
                    assert.equal(this.settled, false); this.settled = true; active -= 1;
                    if (result instanceof Error) reject(result); else resolve(result);
                } }));
        } };
    const window = { EveCoreStorage: fallback ? null : storage, eveState: { config },
        EveEditHistory: { recordConfigMutation: item => history.push(copy(item)) },
        EveDataStore: { _modularSync: { offerConfigSnapshot(...args) {
            offers.push(args);
            return args[1].complete && args[1].changedKeys.length === 1 && args[1].changedKeys[0] === 'audioflix'
                ? { receipt: offers.length } : null;
        } } }, dispatchEvent: event => events.push(event.detail) };
    if (prune) window.CCMaintenance = { emergencyPrune() { prunes += 1; } };
    if (staged) window.EveCooperativeWork = { yieldTask: () => new Promise(resolve => yieldGates.push(resolve)) };
    const context = vm.createContext({ window, config, setTimeout, clearTimeout,
        console: { ...console, error: (...args) => errors.push(args.map(String).join(' ')) },
        localStorage: { setItem(_key, value) {
            localWrites.push(value);
            if (quota) throw Object.assign(new Error('fixture quota'), { name: 'QuotaExceededError', code: 22 });
        } },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
    vm.runInContext(deltaSource, context, { filename: 'storage.delta.js' });
    vm.runInContext(source, context, { filename: 'storage.js' });
    context.markConfigClean(config);
    const baseline = () => ({ signature: context._lastConfigSignature, snapshot: copy(context._lastConfigSnapshot) });
    const save = options => context.saveConfig({ immediate: true, source: 'core-config-retry-smoke', ...options });
    return { context, config, calls, events, history, errors, offers, localWrites, yieldGates, baseline, save,
        peak: () => peak, prunes: () => prunes };
}

async function drain() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
async function releaseStages(f, count = 4) {
    for (let index = 0; index < count; index += 1) {
        assert.ok(f.yieldGates.length, 'A cooperative stage must be waiting');
        f.yieldGates.shift()(); await drain();
    }
}
async function run(id, work) {
    evidence.activeCase = id;
    evidence.cases[id] = await work();
    evidence.passed.push(id);
    evidence.activeCase = null;
}

(async () => {
    for (const mode of ['reject', 'false']) await run(`${mode}-identical-retry`, async () => {
        const f = fixture(), initial = f.baseline();
        f.config.audioflix.music[0].title = 'retry payload';
        const first = f.save();
        assert.equal(f.events.length, 1, 'mutation remains synchronous');
        assert.equal(f.history.length, 1, 'history remains synchronous');
        assert.deepEqual(f.baseline(), initial, 'pending write is not an accepted baseline');
        f.calls[0].settle(mode === 'reject' ? new Error('fixture rejected') : false);
        assert.equal(await first, false);
        assert.deepEqual(f.baseline(), initial, 'failed write leaves accepted baseline intact');
        const retry = f.save();
        assert.equal(f.calls.length, 2, 'identical failed payload reaches storage again');
        assert.equal(f.events.length, 1, 'persistence-only retry does not duplicate mutation events');
        assert.equal(f.history.length, 1, 'persistence-only retry does not duplicate edit history');
        f.calls[1].settle(true);
        assert.equal(await retry, true);
        assert.equal(f.baseline().snapshot.audioflix.music[0].title, 'retry payload');
        assert.equal(await f.save(), true);
        assert.equal(f.calls.length, 2, 'accepted unchanged payload can skip storage');
        return { returned: [false, true], backendCalls: f.calls.length, accepted: f.baseline() };
    });

    await run('pending-duplicate-actual-result', async () => {
        const outcomes = [];
        for (const outcome of [false, true]) {
            const f = fixture(); f.config.reader.choice = 'pending';
            const first = f.save(), duplicate = f.save();
            assert.equal(duplicate, first, 'in-flight duplicate returns the exact persistence promise');
            assert.equal(f.calls.length, 1); assert.equal(f.events.length, 1); assert.equal(f.history.length, 1);
            f.calls[0].settle(outcome);
            assert.deepEqual(await Promise.all([first, duplicate]), [outcome, outcome]);
            outcomes.push({ outcome, calls: f.calls.length });
        }
        return outcomes;
    });

    await run('pending-revert-order-immutable-receipts', async () => {
        const f = fixture(), initial = f.baseline();
        f.config.reader.choice = 'pending book change';
        const first = f.save();
        f.config.reader.choice = 'accepted';
        f.config.audioflix.music[0].title = 'queued audio';
        const audio = f.save();
        assert.deepEqual(Array.from(f.events[1].meta.configDelta.changedKeys).sort(), ['audioflix', 'reader']);
        assert.equal(f.events[1].captureReceipt, null, 'conflicting pending book write forbids audio-only receipt');
        assert.equal(f.offers.length, 1, 'conflicting request never offers an untrusted receipt');
        f.config.audioflix.music[0].title = 'accepted';
        const reverted = f.save();
        assert.equal(f.events[2].captureReceipt, null);
        f.config.reader.choice = 'live mutation after capture';
        f.config.audioflix.music[0].title = 'live mutation after capture';
        assert.equal(f.calls.length, 1, 'conflicting writes serialize before backend invocation');
        assert.equal(f.calls[0].value.reader.choice, 'pending book change', 'first payload is detached');
        f.calls[0].settle(true); await first; await drain();
        assert.equal(f.calls.length, 2);
        assert.equal(f.calls[1].value.reader.choice, 'accepted');
        assert.equal(f.calls[1].value.audioflix.music[0].title, 'queued audio');
        f.calls[1].settle(true); await audio; await drain();
        assert.equal(f.calls.length, 3, 'reverting to previously accepted config cannot skip behind pending writes');
        assert.equal(f.calls[2].value.audioflix.music[0].title, 'accepted');
        f.calls[2].settle(true); assert.equal(await reverted, true);
        assert.equal(f.peak(), 1); assert.deepEqual(f.baseline(), initial);
        assert.equal(f.config.reader.choice, 'live mutation after capture', 'accepted capture never swaps live config');
        assert.equal(f.events.length, 3); assert.equal(f.history.length, 3);
        assert.ok(f.offers.every(args => args.length === 2), 'receipt API receives immutable signature plus delta only');
        return { order: f.calls.map(call => copy(call.value)), peak: f.peak(), receiptOffers: f.offers.length };
    });

    await run('failed-write-revert-invalidates-consumers', async () => {
        const f = fixture(), initial = f.baseline();
        f.config.audioflix.music[0].title = 'failed mutation';
        const failed = f.save(); f.calls[0].settle(false); assert.equal(await failed, false);
        f.config.audioflix.music[0].title = 'accepted';
        const reverted = f.save();
        assert.equal(f.events.length, 2, 'revert after failed persistence must invalidate stale mutation consumers');
        assert.equal(f.events[1].captureReceipt, null, 'unacknowledged predecessor requires conservative full capture');
        assert.deepEqual(Array.from(f.events[1].meta.configDelta.changedKeys), ['audioflix']);
        assert.equal(f.history[1].before.audioflix.music[0].title, 'failed mutation');
        assert.equal(f.history[1].after.audioflix.music[0].title, 'accepted');
        assert.equal(await reverted, true); assert.equal(f.calls.length, 1, 'already accepted backing state needs no duplicate write');
        assert.deepEqual(f.baseline(), initial);
        return { events: f.events.length, history: f.history.length, backendCalls: f.calls.length };
    });

    await run('late-failure-newer-ack', async () => {
        const f = fixture(), initial = f.baseline();
        f.config.reader.choice = 'older failure'; const older = f.save();
        f.config.reader.choice = 'newer accepted'; const newer = f.save();
        await drain(); assert.equal(f.calls.length, 1, 'newer acknowledgement cannot overtake older unsettled write');
        f.calls[0].settle(new Error('late older failure'));
        assert.equal(await older, false); await drain();
        assert.deepEqual(f.baseline(), initial);
        assert.equal(f.calls.length, 2); f.calls[1].settle(true);
        assert.equal(await newer, true); await drain();
        assert.equal(f.baseline().snapshot.reader.choice, 'newer accepted', 'older failure cannot restore obsolete baseline');
        return { calls: f.calls.length, peak: f.peak(), accepted: f.baseline() };
    });

    await run('detached-null-capture', async () => {
        const f = fixture(); f.context.cloneConfigForDelta = () => null;
        f.config.reader.choice = 'first'; const first = f.save();
        f.config.reader.choice = 'queued'; const second = f.save();
        f.config.reader.choice = 'later live';
        assert.equal(f.calls[0].value.reader.choice, 'first'); assert.equal(f.calls[0].options.skipClone, false);
        f.calls[0].settle(true); await first; await drain();
        assert.equal(f.calls[1].value.reader.choice, 'queued'); assert.equal(f.calls[1].options.skipClone, false);
        f.calls[1].settle(true); assert.equal(await second, true);
        return { values: f.calls.map(call => call.value.reader.choice), peak: f.peak() };
    });

    await run('cooperative-stages-immutable-duplicate-and-failed-retry', async () => {
        const f = fixture({ staged: true }), initial = f.baseline();
        f.config.reader.choice = 'sealed cooperative';
        const first = f.save({ cooperative: true }), duplicate = f.save({ cooperative: true });
        assert.equal(first, duplicate, 'Staged duplicates retain the exact pending persistence promise');
        assert.equal(f.calls.length, 0); assert.equal(f.events.length, 0);
        f.config.reader.choice = 'later unannounced live edit';
        await releaseStages(f);
        assert.equal(f.calls.length, 1); assert.equal(f.calls[0].value.reader.choice, 'sealed cooperative');
        assert.equal(f.events.length, 1); assert.equal(f.history.length, 1);
        f.calls[0].settle(false);
        assert.deepEqual(await Promise.all([first, duplicate]), [false, false]);
        assert.deepEqual(f.baseline(), initial);
        f.config.reader.choice = 'sealed cooperative';
        const retry = f.save({ cooperative: true }); await releaseStages(f);
        assert.equal(f.calls.length, 2); assert.equal(f.events.length, 1); assert.equal(f.history.length, 1);
        f.calls[1].settle(true); assert.equal(await retry, true);
        assert.equal(f.baseline().snapshot.reader.choice, 'sealed cooperative');
        return { backendCalls: f.calls.length, events: f.events.length, peak: f.peak() };
    });

    await run('cooperative-superseded-by-normal-save', async () => {
        const f = fixture({ staged: true }); f.config.reader.choice = 'retired staged';
        const retired = f.save({ cooperative: true });
        f.config.reader.choice = 'new normal'; const newest = f.save();
        assert.equal(f.calls.length, 0, 'Normal successor still waits for its staged predecessor');
        await releaseStages(f, 1);
        assert.equal(await retired, false); assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].value.reader.choice, 'new normal');
        assert.equal(f.events.length, 1, 'Retired preparation must never publish an older mutation');
        f.calls[0].settle(true); assert.equal(await newest, true);
        assert.equal(f.baseline().snapshot.reader.choice, 'new normal');
        return { backendCalls: f.calls.length, events: f.events.length };
    });

    await run('cooperative-owner-retirement-before-publication', async () => {
        const f = fixture({ staged: true }), initial = f.baseline(); let current = true;
        f.config.reader.choice = 'retired by Audioflix generation';
        const pending = f.save({ cooperative: true, isCurrent: () => current });
        current = false; await releaseStages(f, 1);
        assert.equal(await pending, false); assert.equal(f.calls.length, 0); assert.equal(f.events.length, 0);
        assert.deepEqual(f.baseline(), initial);
        return { backendCalls: 0, events: 0 };
    });

    await run('cooperative-revert-behind-normal-inflight', async () => {
        const f = fixture({ staged: true }), initial = f.baseline();
        f.config.reader.choice = 'inflight normal'; const first = f.save();
        f.config.reader.choice = 'accepted'; const reverted = f.save({ cooperative: true });
        assert.equal(f.calls.length, 1); f.calls[0].settle(true); await first; await drain();
        await releaseStages(f);
        assert.equal(f.calls.length, 2); assert.equal(f.calls[1].value.reader.choice, 'accepted');
        assert.equal(f.events[1].captureReceipt, null, 'Revert behind an in-flight predecessor cannot offer a receipt');
        f.calls[1].settle(true); assert.equal(await reverted, true); assert.deepEqual(f.baseline(), initial);
        assert.equal(f.peak(), 1);
        return { backendCalls: f.calls.length, peak: f.peak() };
    });

    await run('cooperative-retirement-after-publication-keeps-retry-dirty', async () => {
        const f = fixture({ staged: true }), initial = f.baseline(); let current = true;
        f.config.reader.choice = 'published pending';
        const retired = f.save({ cooperative: true, isCurrent: () => current });
        await releaseStages(f, 3); assert.equal(f.events.length, 1); assert.equal(f.calls.length, 0);
        current = false; await releaseStages(f, 1); assert.equal(await retired, false);
        assert.deepEqual(f.baseline(), initial);
        const retry = f.save({ cooperative: true }); await releaseStages(f);
        assert.equal(f.events.length, 1); assert.equal(f.calls.length, 1);
        f.calls[0].settle(true); assert.equal(await retry, true);
        assert.equal(f.baseline().snapshot.reader.choice, 'published pending');
        return { events: f.events.length, backendCalls: f.calls.length };
    });

    await run('cooperative-seals-committed-volume-projection', async () => {
        const f = fixture({ staged: true }); f.config.audioflix.music[0].volume = .8;
        f.context.window.EveAudioflixState = {
            durableProjectionForSerialization(value) {
                return { ...value, music: value.music.map(row => ({ ...row, volume: .2 })) };
            },
            durableSnapshot() { throw new Error('Cooperative serialization must not add a redundant full clone'); }
        };
        const pending = f.save({ cooperative: true }); f.config.audioflix.music[0].volume = .9;
        await releaseStages(f);
        assert.equal(f.calls[0].value.audioflix.music[0].volume, .2);
        assert.equal(JSON.parse(f.offers[0][0]).audioflix.music[0].volume, .2);
        f.calls[0].settle(true); assert.equal(await pending, true);
        assert.equal(f.config.audioflix.music[0].volume, .9, 'Serialization never swaps the audible preview');
        return { persistedGain: f.baseline().snapshot.audioflix.music[0].volume, liveGain: .9 };
    });

    await run('fallback-success', async () => {
        const f = fixture({ fallback: true }); f.config.reader.choice = 'fallback accepted';
        assert.equal(await f.save(), true); assert.equal(f.localWrites.length, 1);
        assert.equal(f.baseline().snapshot.reader.choice, 'fallback accepted');
        return { writes: f.localWrites.length, accepted: f.baseline() };
    });

    for (const prune of [false, true]) await run(`fallback-unrecoverable-quota-prune-${prune}`, async () => {
        const f = fixture({ fallback: true, quota: true, prune }), initial = f.baseline();
        f.config.reader.choice = 'cannot persist';
        assert.equal(await f.save(), false); assert.deepEqual(f.baseline(), initial);
        assert.equal(await f.save(), false, 'identical fallback failure retries rather than claiming clean');
        assert.equal(f.localWrites.length, prune ? 4 : 2); assert.equal(f.prunes(), prune ? 2 : 0);
        return { writes: f.localWrites.length, prunes: f.prunes(), accepted: f.baseline() };
    });

    evidence.ok = true;
    console.log(`CORE_CONFIG_RETRY_SMOKE_OK ${evidence.passed.length}/${evidence.passed.length} retry=true ordered=true immutable=true fallback=true`);
})().catch(error => {
    evidence.failure = error.stack || String(error);
    console.error(`CORE_CONFIG_RETRY_SMOKE_FAIL ${evidence.activeCase || 'initialization'} `
        + evidence.failure.split('\n').slice(0, 30).join('\n'));
    console.error(`Diagnostics: ${artifact}`);
    process.exitCode = 1;
}).finally(() => {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
});
