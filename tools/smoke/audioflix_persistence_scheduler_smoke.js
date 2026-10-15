const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(ROOT, 'js/modules/features/audioflix/audioflix.state.persistence.js');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-persistence-scheduler.json');
const evidence = { ok: false, cases: [] };
let current = 'startup';

function fixture(options = {}) {
    let clock = 0, nextTimer = 0, active = 0, peak = 0;
    let state = { value: 1, revision: 0 };
    let mirrorResult = { written: true }, coreResult = true;
    const timers = new Map(), handlers = new Map(), mirrors = [], cores = [], errors = [], changes = [], held = [];
    const window = {
        setTimeout(fn, delay) { timers.set(++nextTimer, { fn, at: clock + delay }); return nextTimer; },
        clearTimeout(id) { timers.delete(id); },
        addEventListener(name, fn) {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name).push(fn);
        },
        dispatchEvent(event) { changes.push({ at: clock, detail: event.detail }); },
        saveConfig(config) {
            cores.push({ at: clock, state: JSON.parse(JSON.stringify(state)), config });
            active += 1; peak = Math.max(peak, active);
            let result;
            if (options.held) result = new Promise((resolve, reject) => held.push({ resolve, reject }));
            else if (coreResult instanceof Error && options.syncThrow) {
                active -= 1; throw coreResult;
            } else result = coreResult instanceof Error ? Promise.reject(coreResult) : coreResult;
            return Promise.resolve(result).then(value => { active -= 1; return value; }, error => {
                active -= 1; throw error;
            });
        }
    };
    if (options.noCore) delete window.saveConfig;
    vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), {
        window,
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        console: { error: (...args) => errors.push(args.map(value => String(value)).join(' ')) }
    }, { filename: SOURCE });
    const scheduler = window.EveAudioflixPersistenceScheduler.create({
        ensure: () => state,
        fallbackWrite() {
            mirrors.push({ at: clock, state: JSON.parse(JSON.stringify(state)), result: mirrorResult });
            if (mirrorResult instanceof Error) throw mirrorResult;
            return mirrorResult;
        },
        span: () => options.badDiagnostics ? () => { throw new Error('telemetry only'); } : () => {},
        touchDurability() { state.revision += 1; },
        persistTracked: work => work()
    });
    async function drain() { for (let index = 0; index < 24; index += 1) await Promise.resolve(); }
    async function advance(target) {
        assert.ok(target >= clock, 'fake clock must advance monotonically');
        for (;;) {
            const due = [...timers].filter(([, timer]) => timer.at <= target)
                .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!due) break;
            clock = due[1].at; timers.delete(due[0]); due[1].fn(); await drain();
        }
        clock = target; await drain();
    }
    return {
        scheduler, mirrors, cores, held, errors, changes, timers, advance, drain,
        peak: () => peak,
        setState(value) { state = { value, revision: state.revision }; },
        setMirror(value) { mirrorResult = value; },
        setCore(value) { coreResult = value; },
        activity(type = 'pointerdown') { for (const handler of handlers.get(type) || []) handler({}); },
        // Same boundary as Audioflix State's pagehide listener, after volume finalization.
        pagehide() { return scheduler.hasPending() ? scheduler.flush('audioflix-pagehide') : Promise.resolve(null); }
    };
}

async function test(id, work) {
    current = id;
    await work();
    evidence.cases.push(id);
}

(async () => {
    await test('mirror500-core1500-after-mirror', async () => {
        const f = fixture(); f.scheduler.schedule('change');
        await f.advance(499); assert.equal(f.mirrors.length, 0);
        await f.advance(500); assert.equal(f.mirrors.length, 1); assert.equal(f.cores.length, 0);
        await f.advance(1999); assert.equal(f.cores.length, 0);
        await f.advance(2000); assert.equal(f.cores.length, 1); assert.equal(f.scheduler.hasPending(), false);
        assert.equal(f.cores[0].config.immediate, true);
    });
    await test('activity-postpones-only-core', async () => {
        const f = fixture(); f.scheduler.schedule('change');
        for (const time of [100, 200, 300, 400]) { await f.advance(time); f.activity(); }
        await f.advance(500); assert.equal(f.mirrors.length, 1);
        for (const [time, type] of [[1000, 'input'], [2000, 'keydown'], [3000, 'click']]) {
            await f.advance(time); f.activity(type);
        }
        await f.advance(4499); assert.equal(f.cores.length, 0); assert.equal(f.mirrors.length, 1);
        await f.advance(4500); assert.equal(f.cores.length, 1);
    });
    await test('new-mutation-retires-old-core-deadline', async () => {
        const f = fixture(); f.scheduler.schedule('first'); await f.advance(1900);
        f.setState(2); f.scheduler.schedule('background-change');
        await f.advance(2000); assert.equal(f.cores.length, 0);
        await f.advance(2399); assert.equal(f.mirrors.length, 1);
        await f.advance(2400); assert.equal(f.mirrors[1].state.value, 2);
        await f.advance(3899); assert.equal(f.cores.length, 0);
        await f.advance(3900); assert.equal(f.cores[0].state.value, 2);
    });
    await test('guard-rejection-cancels-previous-replication', async () => {
        const f = fixture(); f.scheduler.schedule('accepted'); await f.advance(600);
        f.setState(2); f.setMirror({ written: false, kind: 'guard', reason: 'rejected rollback' });
        f.scheduler.schedule('rejected'); await f.advance(3000);
        assert.equal(f.cores.length, 0); assert.equal(f.scheduler.hasPending(), true);
        assert.equal((await f.scheduler.flush('rejected-flush')).written, false);
        assert.equal(f.cores.length, 0); assert.equal(f.errors.length, 1);
    });
    await test('explicit-flush-cancels-both-deadlines', async () => {
        for (const at of [100, 1000]) {
            const f = fixture(); f.scheduler.schedule('change'); await f.advance(at);
            const result = await f.scheduler.flush('explicit');
            assert.equal(result.written, true); assert.equal(result.coreWritten, true);
            assert.equal(f.cores[0].at, at); assert.equal(f.timers.size, 0);
            await f.advance(4000); assert.equal(f.cores.length, 1); assert.equal(f.scheduler.hasPending(), false);
        }
    });
    await test('pagehide-flushes-before-or-after-mirror', async () => {
        for (const at of [499, 1000]) {
            const f = fixture(); f.scheduler.schedule('change'); await f.advance(at);
            const result = await f.pagehide();
            assert.equal(result.written, true); assert.equal(f.cores[0].at, at);
            assert.equal(f.changes.at(-1).detail.reason, 'audioflix-pagehide');
            await f.advance(4000); assert.equal(f.cores.length, 1); assert.equal(f.scheduler.hasPending(), false);
        }
    });
    await test('storage-failure-uses-immediate-core-fallback', async () => {
        const f = fixture(); f.setMirror({ written: false, kind: 'storage', reason: 'quota' });
        f.scheduler.schedule('change'); await f.advance(500);
        assert.equal(f.cores[0].at, 500); assert.equal(f.scheduler.hasPending(), false);
        const result = await f.scheduler.flush('fallback');
        assert.equal(result.written, true); assert.equal(result.mirrorWritten, false); assert.equal(result.coreWritten, true);
    });
    await test('non-success-core-values-cannot-claim-durability', async () => {
        for (const outcome of [false, null, undefined, 0]) {
            const f = fixture(); f.setMirror({ written: false, kind: 'storage', reason: 'quota' }); f.setCore(outcome);
            const result = await f.scheduler.flush('failed');
            assert.equal(result.written, false); assert.equal(result.coreWritten, outcome);
            assert.equal(result.reason, 'quota'); assert.equal(f.scheduler.hasPending(), true);
            f.setCore(true); assert.equal((await f.pagehide()).written, true);
            assert.equal(f.scheduler.hasPending(), false);
        }
    });
    await test('deferred-failure-reported-and-retried', async () => {
        for (const outcome of [false, new Error('rejected backend')]) {
            const f = fixture(); f.setCore(outcome); f.scheduler.schedule('change'); await f.advance(2000);
            assert.equal(f.errors.length, 1); assert.equal(f.scheduler.hasPending(), true);
            assert.equal(f.timers.size, 0);
            f.setCore(true); assert.equal((await f.pagehide()).written, true);
            assert.equal(f.scheduler.hasPending(), false);
        }
    });
    await test('synchronous-and-explicit-errors-remain-observable', async () => {
        const f = fixture({ syncThrow: true }); f.setCore(new Error('sync backend'));
        f.scheduler.schedule('change'); await f.advance(2000);
        assert.equal(f.errors.length, 1); assert.equal(f.scheduler.hasPending(), true);
        await assert.rejects(f.scheduler.flush('explicit-error'), /sync backend/);
        f.setCore(true); assert.equal((await f.scheduler.flush('retry')).written, true);
        const mirror = fixture(); mirror.setMirror(new Error('mirror backend'));
        await assert.rejects(mirror.scheduler.flush('mirror-error'), /mirror backend/);
        assert.equal(mirror.scheduler.hasPending(), true);
    });
    await test('waiting-flushes-serialize-and-coalesce-latest-capture', async () => {
        const f = fixture({ held: true }); const first = f.scheduler.flush('first');
        f.setState(2); const second = f.scheduler.flush('second');
        f.setState(3); const third = f.scheduler.flush('third');
        assert.equal(f.cores.length, 1); f.held[0].resolve(true); await f.drain();
        assert.equal(f.cores.length, 2); assert.equal(f.cores[1].state.value, 3); assert.equal(f.peak(), 1);
        f.held[1].resolve(true); await Promise.all([first, second, third]);
        assert.equal(f.cores.length, 2); assert.equal(f.scheduler.hasPending(), false);
    });
    await test('queued-core-cannot-bypass-newer-guard-rejection', async () => {
        const f = fixture({ held: true }); const first = f.scheduler.flush('first');
        f.setState(2); const queued = f.scheduler.flush('queued');
        f.setState(3); f.setMirror({ written: false, kind: 'guard', reason: 'stale state' });
        f.scheduler.schedule('rejected'); await f.advance(500);
        f.held[0].resolve(true); await Promise.all([first, queued]);
        assert.equal(f.cores.length, 1); assert.equal(f.scheduler.hasPending(), true);
        f.setMirror({ written: true }); const retry = f.pagehide();
        assert.equal(f.cores[1].state.value, 3); f.held[1].resolve(true); await retry;
        assert.equal(f.scheduler.hasPending(), false); assert.equal(f.peak(), 1);
    });
    await test('old-completion-preserves-new-mutation-deadline', async () => {
        const f = fixture({ held: true }); const first = f.scheduler.flush('first');
        await f.advance(100); f.setState(2); f.scheduler.schedule('newer');
        f.held[0].resolve(true); await first; assert.equal(f.scheduler.hasPending(), true);
        await f.advance(600); assert.equal(f.mirrors.at(-1).state.value, 2);
        await f.advance(2100); assert.equal(f.cores[1].state.value, 2);
        f.held[1].resolve(true); await f.drain(); assert.equal(f.scheduler.hasPending(), false);
    });
    await test('waiting-old-timer-cannot-skip-new-idle-deadline', async () => {
        const f = fixture({ held: true }); const first = f.scheduler.flush('held-first');
        f.setState(2); f.scheduler.schedule('second'); await f.advance(2000);
        assert.equal(f.cores.length, 1, 'second generation waits behind the older core');
        await f.advance(2100); f.setState(3); f.scheduler.schedule('third'); await f.advance(3000);
        f.held[0].resolve(true); await first; await f.drain();
        assert.equal(f.cores.length, 1, 'retired timer cannot promote the newest mirrored generation');
        await f.advance(4099); assert.equal(f.cores.length, 1);
        await f.advance(4100); assert.equal(f.cores[1].state.value, 3);
        f.held[1].resolve(true); await f.drain(); assert.equal(f.scheduler.hasPending(), false);
    });
    await test('mirror-only-and-optional-telemetry', async () => {
        const mirror = fixture({ noCore: true }); mirror.scheduler.schedule('mirror-only'); await mirror.advance(500);
        assert.equal(mirror.scheduler.hasPending(), false); assert.equal(mirror.errors.length, 0);
        const diagnostics = fixture({ badDiagnostics: true });
        assert.equal((await diagnostics.scheduler.flush('telemetry')).written, true);
    });
    evidence.ok = true;
    console.log(`AUDIOFLIX_PERSISTENCE_SCHEDULER_SMOKE_OK ${evidence.cases.length}/${evidence.cases.length}`);
})().catch(error => {
    evidence.error = { id: current, message: error.message, stack: error.stack };
    console.error(`AUDIOFLIX_PERSISTENCE_SCHEDULER_SMOKE_FAIL ${current}: ${error.message}\nArtifact: ${path.relative(ROOT, artifact)}`);
    process.exitCode = 1;
}).finally(() => {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
});
