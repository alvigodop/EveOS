#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { installLibrarySoakInstrumentation, latencyStats, resourceGrowth, evaluateSoakBudgets } from '../qualification/audioflix_library_soak_resources.mjs';
import { attachSoakConsole, scaleSoakFixture, codePointSearchQuery, classifyResourceErrors,
    assertHeldVolume, assertGestureTotals, settleSoakPersistence, settleSoakSliderHover } from '../qualification/audioflix_library_soak.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-library-soak-contract.json');
const results = [], volumeSaveEvidence = [];
let current = '';
function instrumentationFixture() {
    const timers = new Map(), events = new Map();
    let next = 0, tick = 0, performanceObserver;
    class Observer {
        static supportedEntryTypes = ['longtask'];
        constructor(callback) { this.callback = callback; if (!performanceObserver) performanceObserver = this; }
        observe(options) { if (options.reject) throw new Error('native-observe-error'); this.observed = options; return 'native-observe'; }
        disconnect() { this.observed = null; return 'native-disconnect'; }
    }
    const window = { PerformanceObserver: Observer, MutationObserver: Observer,
        addEventListener(name, callback) { events.set(name, callback); },
        setTimeout(callback, delay, ...args) { const id = ++next; timers.set(id, { callback, delay, args }); return id; },
        clearTimeout(id) { timers.delete(id); return 'native-clear-timeout'; },
        setInterval(callback, delay, ...args) { const id = ++next; timers.set(id, { callback, delay, args }); return id; },
        clearInterval(id) { timers.delete(id); return 'native-clear-interval'; } };
    window.window = window;
    const context = vm.createContext({ window, document: { addEventListener() {} }, requestAnimationFrame: callback => callback(),
        performance: { now: () => tick }, Reflect, Map, Set, WeakMap, Object, String });
    vm.runInContext(`(${installLibrarySoakInstrumentation.toString()})()`, context);
    return { window, timers, events, advance: ms => { tick += ms; }, observer: () => performanceObserver };
}
async function check(id, work) { current = id; await work(); results.push(id); }
function volumeSaveFixture() {
    const timers = new Map(), counters = {}, saves = [], events = [];
    let nextTimer = 0;
    const window = { eveState: { config: { audioflix: { music: [{ id: 'track', title: 'Fixture', url: 'https://media.invalid/fixture.mp3', volume: .2 }] } } },
        setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
        addEventListener() {}, dispatchEvent(event) { events.push(event.detail); }, saveConfig: async () => true,
        EveAudioflixDiagnostics: { span: () => () => {}, gauge() {}, increment(name) { counters[name] = (counters[name] || 0) + 1; },
            snapshot: () => ({ counters }) } };
    const storage = new Map(), context = vm.createContext({ window, console, requestAnimationFrame: callback => callback(),
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
        CustomEvent: class { constructor(_name, options) { this.detail = options.detail; } } });
    for (const file of ['audioflix.state.schema.js', 'audioflix.state.recovery.js', 'audioflix.state.groups.js',
        'audioflix.library.index.js', 'audioflix.state.mutations.js', 'audioflix.state.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', file), 'utf8'), context, { filename: file });
    }
    const state = window.EveAudioflixState, write = window.EveAudioflixStateRecovery.write;
    window.EveAudioflixStateRecovery.write = function (key, durable, ...args) {
        saves.push({ committedGain: durable.music[0].volume, liveGain: state.ensure().music[0].volume, revision: state.getRevision() });
        return Reflect.apply(write, this, [key, durable, ...args]);
    };
    state.ensure();
    return { state, timers, saves, events, context, counters, window,
        snapshot: () => ({ commits: counters['state:volume-commit-count'] || 0, revision: state.getRevision(), persists: counters['state:persist-attempts'] || 0 }) };
}
try {
    await check('pointer-coordinates-wait-for-hover-layout-transition', async () => {
        let finishHover, settled = false, focused = false, hovered = false;
        const transition = new Promise(resolve => { finishHover = resolve; });
        const element = { closest: () => ({ getAnimations: () => [{ finished: transition }] }) };
        const context = vm.createContext({ element, requestAnimationFrame: callback => callback() });
        const slider = { focus: async () => { focused = true; }, hover: async () => { hovered = true; },
            evaluate: callback => vm.runInContext(`(${callback.toString()})(element)`, context) };
        const preparing = settleSoakSliderHover(slider).then(() => { settled = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(focused, true); assert.equal(hovered, true); assert.equal(settled, false,
            'Collapsed coordinates cannot be used while the hover expansion is moving the slider');
        finishHover(); await preparing; assert.equal(settled, true);
    });
    await check('prior-autosave-isolated-from-held-preview', async () => {
        const f = volumeSaveFixture(), previous = {}, current = {};
        f.state.previewItemVolume('music', 'track', .6, previous); f.state.commitItemVolume('music', 'track', .6, previous);
        const before = f.snapshot();
        f.state.previewItemVolume('music', 'track', .8, current);
        const pendingSave = [...f.timers.values()][0]; pendingSave(); await new Promise(resolve => setImmediate(resolve));
        assert.throws(() => assertHeldVolume(before, f.snapshot()), /Holding a pointer never persists/,
            'Legacy measurement falsely attributes the prior scheduled save to the current pointer');
        assert.equal(f.snapshot().commits, before.commits); assert.equal(f.snapshot().revision, before.revision);
        assert.equal(f.saves[0].committedGain, .6); assert.equal(f.saves[0].liveGain, .8);
        assert.equal(f.events.at(-1).reason, 'audioflix-volume');
        volumeSaveEvidence.push({ before, held: f.snapshot(), saves: f.saves, events: f.events });
    });
    await check('gesture-boundary-awaits-prior-save-before-measurement', async () => {
        const f = volumeSaveFixture(), previous = {}, current = {};
        f.state.previewItemVolume('music', 'track', .6, previous); f.state.commitItemVolume('music', 'track', .6, previous);
        let release, settled = false;
        f.window.saveConfig = () => new Promise(resolve => { release = resolve; });
        const page = { evaluate(callback, reason) { f.context.reason = reason; return vm.runInContext(`(${callback.toString()})(reason)`, f.context); } };
        const settling = settleSoakPersistence(page, 'soak-volume-ready').then(value => { settled = true; return value; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false, 'Measurement cannot start until async canonical persistence finishes');
        release(true); await settling;
        assert.equal(f.timers.size, 0, 'Previous autosave is canceled before taking the next counter baseline');
        const before = f.snapshot(); f.state.previewItemVolume('music', 'track', .8, current);
        assertHeldVolume(before, f.snapshot());
        assert.equal(f.state.durableSnapshot().music[0].volume, .6); assert.equal(f.state.ensure().music[0].volume, .8);
        f.state.commitItemVolume('music', 'track', .8, current);
        assert.equal(f.snapshot().commits - before.commits, 1); assert.equal(f.snapshot().revision - before.revision, 1);
    });
    await check('held-volume-rejects-persistence-before-release', () => {
        const before = { commits: 3, revision: 7, persists: 2 };
        assertHeldVolume(before, { ...before });
        for (const key of ['commits', 'revision', 'persists']) {
            assert.throws(() => assertHeldVolume(before, { ...before, [key]: before[key] + 1 }));
        }
    });
    await check('gesture-totals-count-real-inputs-without-weakening-durability', () => {
        const counts = { gestures: 5, pointerMoves: 100 };
        const rows = [15, 19, 20, 21, 18].map(inputs => ({ inputs, previews: inputs, commits: 1, revisions: 1, persistsWhileHeld: 0 }));
        const total = rows.reduce((sum, row) => sum + row.inputs, 0);
        assert.ok(total < counts.pointerMoves, 'Unchanged range steps legitimately emit no input');
        assertGestureTotals(total, counts, rows);
        assert.throws(() => assertGestureTotals(total + 1, counts, rows));
        assert.throws(() => assertGestureTotals(total, counts, rows.slice(1)));
        for (const [key, value] of [['inputs', 14], ['previews', 16], ['commits', 0], ['commits', 2], ['revisions', 0], ['revisions', 2], ['persistsWhileHeld', 1]]) {
            const bad = rows.map(row => ({ ...row })); bad[0][key] = value;
            assert.throws(() => assertGestureTotals(bad.reduce((sum, row) => sum + row.inputs, 0), counts, bad));
        }
    });
    await check('native-timer-semantics-and-counts', () => {
        const f = instrumentationFixture(), W = f.window;
        let invocation;
        const id = W.setTimeout(function (...values) { invocation = { thisValue: this, values }; return 'callback-result'; }, 25, 'argument', 2);
        assert.equal(W.__librarySoak.snapshot().timers.timeout, 1);
        const task = f.timers.get(id);
        assert.equal(task.delay, 25); assert.deepEqual(task.args, ['argument', 2]);
        assert.equal(task.callback.call(W, ...task.args), 'callback-result');
        assert.equal(invocation.thisValue, W); assert.deepEqual(invocation.values, ['argument', 2]);
        assert.equal(W.__librarySoak.snapshot().timers.timeout, 0);
        const interval = W.setInterval(() => 'interval-result', 30);
        assert.equal(f.timers.get(interval).callback(), 'interval-result');
        assert.equal(W.__librarySoak.snapshot().timers.interval, 1);
        assert.equal(W.clearTimeout(interval), 'native-clear-timeout');
        assert.equal(W.__librarySoak.snapshot().timers.interval, 0, 'cross-clear follows native shared timer ID pool');
        const string = W.setTimeout('native-string-callback', 30);
        assert.equal(f.timers.get(string).callback, 'native-string-callback', 'string handlers preserve native behavior');
    });
    await check('native-observer-semantics-and-errors', () => {
        const f = instrumentationFixture(), W = f.window, observer = new W.MutationObserver(() => {});
        assert.equal(observer.observe({ childList: true }), 'native-observe');
        assert.equal(observer.observe({ childList: true }), 'native-observe');
        assert.equal(W.__librarySoak.snapshot().observers.MutationObserver.observing, 1);
        assert.equal(observer.disconnect(), 'native-disconnect');
        assert.equal(W.__librarySoak.snapshot().observers.MutationObserver.observing, 0);
        assert.throws(() => observer.observe({ reject: true }), /native-observe-error/);
        assert.equal(W.__librarySoak.snapshot().observers.MutationObserver.observing, 0);
        assert.deepEqual(W.PerformanceObserver.supportedEntryTypes, ['longtask']);
    });
    await check('bounded-phase-attribution-and-unhandled-errors', () => {
        const f = instrumentationFixture(), W = f.window;
        f.advance(10); W.__librarySoak.phase('queue');
        f.advance(10); W.__librarySoak.phase('volume');
        f.observer().callback({ getEntries: () => [{ startTime: 12, duration: 75, attribution: [{ name: 'self' }] }, { startTime: 22, duration: 90 }] });
        assert.equal(W.__librarySoak.snapshot().longTasks[0].phase, 'queue');
        assert.equal(W.__librarySoak.snapshot().longTasks[1].phase, 'volume');
        for (let i = 0; i < 2500; i++) f.observer().callback({ getEntries: () => [{ startTime: 22, duration: 55 }] });
        for (let i = 0; i < 40; i++) f.events.get('unhandledrejection')({ type: 'unhandledrejection', reason: new Error('synthetic-promise-error') });
        const snap = W.__librarySoak.snapshot();
        assert.equal(snap.longTaskCount, 2502); assert.equal(snap.longTasks.length, 2048); assert.equal(snap.droppedLongTasks, 454);
        assert.equal(snap.errorCount, 40); assert.equal(snap.errors.length, 30);
        assert.equal(W.__librarySoak.drainLongTasks().length, 2048); assert.equal(W.__librarySoak.snapshot().longTasks.length, 0);
    });
    await check('numeric-resource-trends-and-fixture-scope', () => {
        assert.deepEqual(latencyStats([7, 2, 9, 4]), { count: 4, p50: 4, p95: 9, max: 9 });
        const growth = resourceGrowth([0, 1, 2].map(index => ({ dom: { nodes: 100 + index * 5, jsEventListeners: 20 + index }, heap: { usedSize: 1000 + index * 10 } })));
        assert.equal(growth.nodesPerBatch, 5); assert.equal(growth.heapBytesPerBatch, 10); assert.equal(growth.listenersDelta, 2);
        const data = scaleSoakFixture(25000);
        assert.equal(data.music.length, 25000); assert.equal(data.musicFolders.length, 50);
        assert.equal(new Set(data.music.map(item => item.id)).size, 25000);
        assert.ok(data.music.every(item => item.exposed && item.duration === 120 && item.url.startsWith('https://media.invalid/')));
    });
    await check('console-errors-are-not-silently-suppressed', () => {
        let callback; const probe = attachSoakConsole({ on: (_event, handler) => { callback = handler; } });
        callback({ type: () => 'error', text: () => 'Failed to load resource: net::ERR_FAILED' });
        callback({ type: () => 'error', text: () => 'Uncaught render failure at https://private.invalid/secret' });
        assert.equal(probe.expectedNetworkErrors, 1); assert.equal(probe.unexpectedErrors, 1);
        assert.ok(!probe.errors[0].includes('private.invalid'));
    });
    await check('fixed-performance-targets-report-regressions', () => {
        const failures = evaluateSoakBudgets({ 'search-input': { p95: 151 }, 'group-expand-pointer': { p95: 151 } },
            { 'play-pointer': { p95: 101 } }, { 'volume-drag-pointer': { max: 51 } }, true);
        assert.equal(failures.length, 4);
        assert.deepEqual(failures.map(row => row.limit), [100, 150, 150, 50]);
        assert.equal(evaluateSoakBudgets({ 'group-expand-pointer': { p95: 499 } }, {}, {}, false).length, 0);
    });
    await check('supplementary-title-search-prefix-is-well-formed', () => {
        const title = 'Track \u{1d42b}';
        assert.equal(title.slice(0, -1).charCodeAt(title.length - 2), 0xd835, 'old UTF-16 slicing reproduces the malformed query');
        assert.equal(codePointSearchQuery(title, 1), 'Track ');
        assert.equal(codePointSearchQuery(title), title);
        assert.equal(codePointSearchQuery('\u{1d42b}'.repeat(90)).length, 160, '80-codepoint limit cannot split a supplementary character');
    });
    await check('resource-errors-require-exact-deliberate-block-attribution', () => {
        const result = classifyResourceErrors([{ url: 'https://blocked.invalid/image#icon', tag: 'IMG' }, { url: 'http://127.0.0.1:8765/critical.js', tag: 'SCRIPT' }], ['https://blocked.invalid/image']);
        assert.equal(result.expected.length, 1); assert.equal(result.unexpected.length, 1);
        assert.equal(result.unexpected[0].tag, 'SCRIPT');
    });
    fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify({ ok: true, results, volumeSaveEvidence }, null, 2));
    console.log(`AUDIOFLIX_LIBRARY_SOAK_CONTRACT_SMOKE_OK passed=${results.length}/${results.length}`);
} catch (error) {
    fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify({ ok: false, current, results, error: String(error.stack || error) }, null, 2));
    console.error(`AUDIOFLIX_LIBRARY_SOAK_CONTRACT_SMOKE_FAIL ${current}\n${String(error.stack || error).split('\n').slice(0, 30).join('\n')}`); process.exitCode = 1;
}
