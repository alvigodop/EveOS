#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODULES = path.join(ROOT, 'js/modules/features/modular-state-sync');
const CODEC = path.join(MODULES, 'modular-state-sync.capture.codec.js');
const CACHE = path.join(MODULES, 'modular-state-sync.capture.cache.js');
const WORKER = path.join(MODULES, 'modular-state-sync.capture.worker.js');
const read = file => fs.readFileSync(file, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const nextTick = () => new Promise(resolve => setImmediate(resolve));

function moduleSandbox() {
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        setTimeout,
        clearTimeout,
        Promise,
        Map,
        Set,
        WeakMap,
        Object,
        Array,
        JSON,
        String,
        Number,
        Math,
        RegExp
    };
    sandbox.window = sandbox;
    sandbox.addEventListener = () => {};
    vm.createContext(sandbox);
    vm.runInContext(read(CODEC), sandbox, { filename: CODEC });
    return sandbox;
}

function representativeParts(codec) {
    const state = {
        metadata: { version: 'test', date: 'volatile' },
        bookmarks: { links: [{ id: 'b', title: 'Keep', generatedAt: 1 }] },
        library: { categories: [{ id: 'c', title: 'Library' }] },
        knowledge: { nested: { text: 'emoji 😀 and slash \\ and quote "', lastUpdated: 10 } },
        audioflix: {
            durabilityRevision: 81,
            durabilityUpdatedAt: 1234,
            music: Array.from({ length: 256 }, (_, id) => ({ id: `m-${id}`, title: `Track ${id}`, folder: 'Keep' }))
        },
        audioflixStructure: { schema: 1, music: [{ id: 'm-0', folder: 'Keep' }] }
    };
    return codec.splitObject(JSON.stringify(state));
}

async function nodeWorkerContracts() {
    const sandbox = moduleSandbox();
    vm.runInContext(read(WORKER), sandbox, { filename: WORKER });
    const codec = sandbox.EveModularCaptureCodec;
    const api = sandbox.EveModularCaptureWorker;
    const parts = representativeParts(codec);
    const expected = codec.hashParts(parts);

    const inline = await api.hashParts(parts);
    assert.equal(inline, expected, 'Explicit degraded inline path must preserve sections-v1 identity');
    assert.equal(api.stats().mode, 'inline');
    assert.equal(api.stats().fallbacks, 1);

    const workerSandbox = { posted: [] };
    workerSandbox.self = { postMessage: message => workerSandbox.posted.push(message) };
    vm.createContext(workerSandbox);
    vm.runInContext(api._sourceForTests(), workerSandbox, { filename: 'modular-capture-worker-blob.js' });
    workerSandbox.self.onmessage({ data: { type: 'hash-parts', id: 7, entries: Array.from(parts.entries()) } });
    assert.equal(workerSandbox.posted.length, 1);
    assert.equal(workerSandbox.posted[0].ok, true);
    assert.equal(workerSandbox.posted[0].hash, expected, 'Worker token walk must exactly match the public codec');

    let instances = 0;
    const client = api.create({
        workerFactory() {
            instances += 1;
            const instance = { terminate() {} };
            instance.postMessage = message => {
                if (instances === 1) {
                    queueMicrotask(() => instance.onerror(new Error('forced worker failure')));
                    return;
                }
                const hash = codec.hashParts(new Map(message.entries));
                queueMicrotask(() => instance.onmessage({ data: { id: message.id, ok: true, hash } }));
            };
            return instance;
        },
        setTimer: setTimeout,
        clearTimer: clearTimeout
    });
    await assert.rejects(client.hashParts(parts), /forced worker failure/);
    assert.equal(await client.hashParts(parts), expected, 'A later request must restart after worker failure');
    assert.equal(client.stats().restarts, 1);
    assert.equal(instances, 2);
    client.destroy();
}

function structure(audioflix) {
    return {
        schema: 1,
        music: (audioflix?.music || []).map(item => ({ id: item.id, folder: item.folder || '' }))
    };
}

function cacheSeed() {
    const audioflix = {
        durabilityRevision: 1,
        durabilityUpdatedAt: 1,
        music: [{ id: 'a', title: 'Initial', folder: 'Keep' }]
    };
    return {
        metadata: { version: 'test' },
        bookmarks: { links: [{ id: 'link', title: 'Keep', url: 'https://example.test/' }] },
        library: { categories: [] },
        knowledge: { notes: [] },
        audioflix,
        audioflixStructure: structure(audioflix)
    };
}

async function asyncCaptureFencingContracts() {
    const sandbox = moduleSandbox();
    vm.runInContext(read(CACHE), sandbox, { filename: CACHE });
    const codec = sandbox.EveModularCaptureCodec;
    const jobs = [];
    let live = cacheSeed();
    let clock = 1000;
    const cache = sandbox.EveModularCaptureCache.create({
        getStore: () => ({ captureState: () => clone(live) }),
        now: () => clock,
        ttlMs: 60000,
        captureStructure: structure,
        hashPartsAsync(parts) {
            return new Promise((resolve, reject) => jobs.push({ parts: new Map(parts), resolve, reject }));
        }
    });
    const delta = { complete: true, changedKeys: ['audioflix'] };
    const baseline = cache.capture();
    assert.ok(baseline?.hash);

    function offer(title, revision) {
        const audioflix = clone(live.audioflix);
        audioflix.music[0].title = title;
        audioflix.durabilityRevision = revision;
        audioflix.durabilityUpdatedAt = revision;
        live.audioflix = audioflix;
        live.audioflixStructure = structure(audioflix);
        const token = cache.offerConfigSnapshot(JSON.stringify({ theme: 'dark', audioflix }), delta);
        assert.ok(token);
        cache.invalidate({ kind: 'config', captureReceipt: token });
    }

    offer('Old worker job', 2);
    const pending = cache.captureAsync();
    await nextTick();
    assert.equal(jobs.length, 1, 'First async capture must dispatch one hash job');

    offer('Newest worker job', 3);
    jobs[0].resolve(codec.hashParts(jobs[0].parts));
    await nextTick();
    assert.equal(jobs.length, 2, 'Superseded completion must retry against the newest generation');
    jobs[1].resolve(codec.hashParts(jobs[1].parts));
    const newest = await pending;
    assert.equal(JSON.parse(newest.json).audioflix.music[0].title, 'Newest worker job');
    assert.ok(cache.stats().staleAsyncCount >= 1, 'Late worker completion must be counted and discarded');

    offer('Worker error recovery', 4);
    const recovery = cache.captureAsync();
    await nextTick();
    assert.equal(jobs.length, 3);
    jobs[2].reject(new Error('forced async hash failure'));
    await nextTick();
    assert.equal(jobs.length, 4, 'Current-generation hash failure must force a full authoritative retry');
    jobs[3].resolve(codec.hashParts(jobs[3].parts));
    const recovered = await recovery;
    assert.equal(recovered.full, true);
    assert.equal(JSON.parse(recovered.json).audioflix.music[0].title, 'Worker error recovery');

    clock = Number(recovered.capturedAt) + 60000;
    const audit = cache.captureAsync();
    await nextTick();
    assert.equal(jobs.length, 5, 'Exact 60-second deadline must dispatch a full audit hash');
    jobs[4].resolve(codec.hashParts(jobs[4].parts));
    assert.equal((await audit).full, true);
}

async function browserContext(label, url, page) {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.addScriptTag({ path: CODEC });
    await page.addScriptTag({ path: WORKER });
    const result = await page.evaluate(async () => {
        const state = {
            metadata: { version: 'browser' },
            bookmarks: { links: [] },
            library: { categories: [] },
            knowledge: { text: 'worker' },
            audioflix: { music: Array.from({ length: 128 }, (_, id) => ({ id, title: `Track ${id}` })) },
            audioflixStructure: { schema: 1 }
        };
        const codec = window.EveModularCaptureCodec;
        const parts = codec.splitObject(JSON.stringify(state));
        const expected = codec.hashParts(parts);
        const actual = await window.EveModularCaptureWorker.hashParts(parts);
        const stats = window.EveModularCaptureWorker.stats();
        window.EveModularCaptureWorker.destroy();
        return { expected, actual, stats };
    });
    assert.equal(result.actual, result.expected, `${label} worker must preserve sections-v1 identity`);
    assert.equal(result.stats.mode, 'worker', `${label} must actually execute the Blob worker, not degraded inline hashing`);
    assert.ok(result.stats.completed >= 1);
}

async function browserBootstrapContracts() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-modular-worker-'));
    const html = path.join(temp, 'index.html');
    fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>worker smoke</title>', 'utf8');
    const server = http.createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><meta charset="utf-8"><title>worker smoke</title>');
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await browserContext('file://', pathToFileURL(html).href, page);
        await browserContext('http://', `http://127.0.0.1:${address.port}/`, page);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

await nodeWorkerContracts();
await asyncCaptureFencingContracts();
await browserBootstrapContracts();
console.log('MODULAR_STATE_SYNC_WORKER_SMOKE_OK');
