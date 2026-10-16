import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(sandbox, file) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

async function bounded(promise, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} did not settle`)), 5000);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function yieldingSandbox(moduleSandbox, schedulerYield, schedulerPostTask) {
    let clock = 0;
    return moduleSandbox({
        Blob, TextEncoder, TextDecoder,
        performance: { now: () => (clock += 10) },
        scheduler: { yield: schedulerYield, ...(schedulerPostTask ? { postTask: schedulerPostTask } : {}) }
    });
}

async function taskPriorityContracts({ moduleSandbox, cooperativePath }) {
    for (const mode of ['background', 'yield', 'timer', 'nonbrowser']) {
        const tasks = [], calls = [];
        const options = {};
        const deferred = callback => new Promise(resolve => tasks.push(() => resolve(callback?.())));
        if (mode === 'background') options.scheduler = {
            postTask(callback, settings) { calls.push(['postTask', settings.priority]); return deferred(callback); },
            yield() { throw new Error('Background task support must take precedence over scheduler.yield'); }
        };
        if (mode === 'yield') options.scheduler = { yield() { calls.push(['yield']); return deferred(); } };
        if (mode === 'timer') {
            options.document = {};
            options.setTimeout = (callback, delay) => { calls.push(['timer', delay]); return deferred(callback); };
        }
        const sandbox = moduleSandbox(options);
        load(sandbox, cooperativePath);
        let finished = false;
        const pending = sandbox.EveCooperativeWork.yieldTask().then(() => { finished = true; });
        await Promise.resolve();
        if (mode === 'nonbrowser') {
            await pending;
            assert.equal(tasks.length, 0, 'Non-browser sandboxes retain a settled Promise fallback');
        } else {
            assert.equal(finished, false, `${mode} continuation must not run inline or in a microtask-only drain`);
            assert.equal(tasks.length, 1, `${mode} must schedule exactly one real task`);
            assert.deepEqual(calls, [mode === 'background' ? ['postTask', 'background']
                : mode === 'timer' ? ['timer', 0] : ['yield']]);
            tasks.shift()();
            await pending;
            assert.equal(finished, true);
        }
    }
}

async function encodingModeContracts({ moduleSandbox, cooperativePath }, mode) {
    let calls = 0;
    let turns = 0;
    const task = () => {
        calls += 1;
        return new Promise(resolve => setImmediate(() => {
            turns += 1;
            resolve();
        }));
    };
    const sandbox = mode === 'background'
        ? yieldingSandbox(moduleSandbox, () => { throw new Error('Unexpected yield fallback'); }, (callback, options) => {
            assert.equal(options.priority, 'background');
            return task().then(callback);
        })
        : yieldingSandbox(moduleSandbox, task);
    load(sandbox, cooperativePath);
    const api = sandbox.EveCooperativeWork;
    const inputs = [
        ['paired boundary', 'a'.repeat(262143) + '\ud83d\ude00z'],
        ['unpaired boundary', 'a'.repeat(262143) + '\ud800z\udc00'],
        ['empty', '']
    ];
    for (const [label, text] of inputs) {
        const before = calls;
        let settled = false;
        const pending = api.encodeText(text).then(bytes => {
            settled = true;
            return bytes;
        });
        await Promise.resolve();
        if (text.length) {
            assert.equal(calls, before + 1, `${label} must enter a scheduler task boundary at its first slice`);
            assert.equal(settled, false, `${label} must not finish by draining microtasks alone`);
        }
        assert.deepEqual(Buffer.from(await pending), Buffer.from(text, 'utf8'), `${label} UTF-8 bytes must match native encoding`);
        if (text.length) assert.ok(calls >= before + 2, `${label} must yield across multiple slices`);
        assert.equal(turns, calls, `${label} must await every scheduled task`);

        const body = await api.jsonBody(text);
        assert.ok(body instanceof Blob, `${label} must retain Blob transport`);
        assert.equal(body.type, 'application/json');
        assert.deepEqual(Buffer.from(await body.arrayBuffer()), Buffer.from(text, 'utf8'),
            `${label} chunked Blob must preserve native UTF-8 bytes`);
    }
    sandbox.Blob = undefined;
    for (const [label, text] of inputs) {
        assert.equal(await api.jsonBody(text), text, `${label} must retain exact string transport when Blob is unavailable`);
    }
}

async function preparationContracts({ moduleSandbox, cooperativePath, workerPath, representativeParts }) {
    for (const failure of ['destroy', 'error']) {
        let release;
        let yields = 0;
        const sandbox = yieldingSandbox(moduleSandbox, () => {
            yields += 1;
            return yields === 1 ? new Promise(resolve => { release = resolve; })
                : new Promise(resolve => setImmediate(resolve));
        });
        load(sandbox, cooperativePath);
        load(sandbox, workerPath);
        const codec = sandbox.EveModularCaptureCodec;
        const parts = representativeParts(codec);
        const expected = codec.hashParts(parts);
        const instances = [];
        const client = sandbox.EveModularCaptureWorker.create({
            workerFactory() {
                const instance = { sent: 0, terminated: false };
                instance.terminate = () => { instance.terminated = true; };
                instance.postMessage = message => {
                    instance.sent += 1;
                    const decoded = new Map(message.entries.map(([key, bytes]) => [key, new TextDecoder().decode(bytes)]));
                    const hash = codec.hashParts(decoded);
                    queueMicrotask(() => instance.onmessage({ data: { id: message.id, ok: true, hash } }));
                };
                instances.push(instance);
                return instance;
            }
        });
        try {
            const old = client.hashParts(parts);
            const rejected = assert.rejects(old, /superseded during preparation/,
                `${failure} must reject preparation owned by the previous worker`);
            assert.equal(typeof release, 'function', 'The encoding slice must remain suspended at an actual task boundary');
            assert.equal(client.stats().inFlight, 1);
            if (failure === 'destroy') client.destroy();
            else instances[0].onerror(new Error('forced preparation failure'));

            assert.equal(await bounded(client.hashParts(parts), `${failure} replacement`), expected,
                'A new worker must finish while the superseded preparation is still held');
            assert.equal(instances.length, 2);
            assert.equal(instances[0].terminated, true);
            assert.equal(instances[0].sent, 0, 'Superseded preparation must never post a worker job');
            assert.equal(client.stats().completed, 1);
            release();
            await bounded(rejected, `${failure} superseded request`);
            assert.equal(client.stats().inFlight, 0, 'Both preparation and posted-job accounting must settle');
            assert.equal(client.stats().completed, 1, 'Rejected preparation must not count as completed');
            assert.ok(client.stats().cooperativeJobs >= 2);
            if (failure === 'error') assert.equal(client.stats().restarts, 1);
        } finally {
            release?.();
            client.destroy();
        }
    }
}

async function cacheYieldContracts({ moduleSandbox, cachePath, cacheSeed, structure }) {
    async function attempt(mode, cutoff = 0) {
        const sandbox = moduleSandbox();
        load(sandbox, cachePath);
        const codec = sandbox.EveModularCaptureCodec;
        const live = cacheSeed();
        let boundaries = 0;
        let captures = 0;
        let legacyCaptures = 0;
        const hashedTitles = [];
        let cache;
        const offer = title => {
            live.audioflix.music[0].title = title;
            live.audioflix.durabilityRevision += 1;
            const token = cache.offerConfigSnapshot(JSON.stringify({ audioflix: live.audioflix }),
                { complete: true, changedKeys: ['audioflix'] });
            assert.ok(token);
            assert.equal(cache.invalidate({ kind: 'config', captureReceipt: token }), true);
        };
        const store = {
            captureState() {
                captures += 1;
                legacyCaptures += 1;
                return JSON.parse(JSON.stringify(live));
            }
        };
        if (mode === 'sections') store.captureStateSections = () => {
            captures += 1;
            return new Map(Object.entries(live).filter(([key]) => key !== 'audioflixStructure')
                .map(([key, value]) => [key, JSON.stringify(value)]));
        };
        cache = sandbox.EveModularCaptureCache.create({
            getStore: () => store,
            now: () => 1000,
            captureStructure: structure,
            yieldTask() {
                boundaries += 1;
                if (boundaries === cutoff) {
                    if (mode === 'receipt') offer('Fresh receipt');
                    else {
                        live.audioflix.music[0].title = 'Fresh authoritative capture';
                        cache.invalidate({ kind: 'knowledge' });
                    }
                }
                return Promise.resolve();
            },
            hashPartsAsync(parts) {
                hashedTitles.push(JSON.parse(parts.get('audioflix')).music[0].title);
                return Promise.resolve(codec.hashParts(parts));
            }
        });
        if (mode === 'receipt') {
            assert.ok(cache.capture());
            offer('Old receipt');
        }
        const result = await bounded(cache.captureAsync(), `${mode} capture at boundary ${cutoff}`);
        assert.ok(result);
        const expectedTitle = cutoff ? (mode === 'receipt' ? 'Fresh receipt' : 'Fresh authoritative capture')
            : mode === 'receipt' ? 'Old receipt' : 'Initial';
        assert.equal(JSON.parse(result.json).audioflix.music[0].title, expectedTitle);
        assert.deepEqual(hashedTitles, [expectedTitle], 'Stale preprocessing must be discarded before it reaches hashing');
        assert.equal(result.hash, codec.hashParts(codec.splitObject(result.json)), 'Accepted JSON and hash must identify the same immutable capture');
        assert.equal(result.full, mode !== 'receipt');
        assert.equal(captures, mode === 'receipt' || !cutoff ? 1 : 2);
        if (mode === 'sections') assert.equal(legacyCaptures, 0, 'Owned sections must avoid legacy state capture');
        assert.equal(cache.stats().staleAsyncCount, cutoff ? 1 : 0);
        return boundaries;
    }
    for (const mode of ['full', 'sections', 'receipt']) {
        const boundaries = await attempt(mode);
        assert.ok(boundaries >= 2, `${mode} capture must yield between preprocessing stages`);
        for (let cutoff = 1; cutoff <= boundaries; cutoff += 1) await attempt(mode, cutoff);
    }
}

async function captureOwnershipContracts({ moduleSandbox, cachePath, cacheSeed, structure }) {
    for (const mode of ['legacy', 'sections']) {
        const sandbox = moduleSandbox();
        load(sandbox, cachePath);
        const codec = sandbox.EveModularCaptureCodec;
        const live = cacheSeed();
        let clock = 1000;
        let mutated = false;
        let owned;
        let legacyCaptures = 0;
        let sectionCaptures = 0;
        const store = {
            captureState() {
                legacyCaptures += 1;
                return { ...live, audioflixStructure: structure(live.audioflix) };
            }
        };
        if (mode === 'sections') store.captureStateSections = () => {
            sectionCaptures += 1;
            owned = new Map(Object.entries(live).filter(([key]) => key !== 'audioflixStructure')
                .map(([key, value]) => [key, JSON.stringify(value)]));
            return owned;
        };
        const cache = sandbox.EveModularCaptureCache.create({
            getStore: () => store,
            now: () => clock,
            captureStructure: structure,
            hashPartsAsync: parts => Promise.resolve(codec.hashParts(parts)),
            yieldTask() {
                if (!mutated) {
                    mutated = true;
                    live.audioflix.music[0].title = 'Mutation after seal';
                    live.audioflix.music[0].folder = 'Changed folder';
                    live.bookmarks.links[0].title = 'Changed bookmark';
                    owned?.set('audioflix', JSON.stringify(live.audioflix));
                }
                return Promise.resolve();
            }
        });
        const first = await bounded(cache.captureAsync(), `${mode} immutable sealing`);
        const detached = JSON.parse(first.json);
        assert.equal(detached.audioflix.music[0].title, 'Initial', `${mode} must seal nested aliases before yielding`);
        assert.equal(detached.bookmarks.links[0].title, 'Keep');
        assert.equal(detached.audioflixStructure.music[0].folder, 'Keep', 'Structure must derive from the same owned audio snapshot');
        assert.equal(first.hash, codec.hashParts(codec.splitObject(first.json)));

        live.audioflix.music[0].title = 'Audit capture';
        clock = first.capturedAt + 60000;
        const audited = await bounded(cache.captureAsync(), `${mode} audit`);
        assert.equal(audited.full, true, `${mode} must retain the exact 60-second full audit deadline`);
        assert.equal(JSON.parse(audited.json).audioflix.music[0].title, 'Audit capture');
        assert.equal(audited.hash, codec.hashParts(codec.splitObject(audited.json)));
        assert.equal(cache.stats().fullCount, 2);
        assert.equal(legacyCaptures, mode === 'legacy' ? 2 : 0);
        assert.equal(sectionCaptures, mode === 'sections' ? 2 : 0);
        assert.equal(JSON.parse(first.json).audioflix.music[0].title, 'Initial', 'Later audits must not mutate the accepted immutable payload');
    }
}

export async function cooperativeCaptureContracts(options) {
    await taskPriorityContracts(options);
    await encodingModeContracts(options, 'background');
    await encodingModeContracts(options, 'yield');
    await preparationContracts(options);
    await cacheYieldContracts(options);
    await captureOwnershipContracts(options);
}
