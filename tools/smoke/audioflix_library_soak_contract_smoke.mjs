#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { checkLibraryQualificationEvidence } from './audioflix_library_evidence_contract.shared.mjs';
import { installLibrarySoakInstrumentation, latencyStats, resourceGrowth, evaluateSoakBudgets } from '../qualification/audioflix_library_soak_resources.mjs';
import { installSoakSearchDiagnostics, measureSoakSearchTiming, restoreSoakSearchDiagnostics } from '../qualification/audioflix_library_soak_search_timing.mjs';
import { attachSoakConsole, scaleSoakFixture, codePointSearchQuery, classifyResourceErrors,
    assertHeldVolume, assertQueueProjection, assertGestureTotals, settleSoakPersistence, settleSoakSliderHover, recordSoakPhase } from '../qualification/audioflix_library_soak.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-library-soak-contract.json');
const results = [], volumeSaveEvidence = [], evidenceOnly = process.argv.includes('--evidence-only');
let current = '';
function instrumentationFixture(requestFrame = callback => callback()) {
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
    const context = vm.createContext({ window, document: { addEventListener(name, callback) { events.set(`document:${name}`, callback); } }, requestAnimationFrame: requestFrame,
        performance: { now: () => tick }, Reflect, Map, Set, WeakMap, Object, String });
    vm.runInContext(`(${installLibrarySoakInstrumentation.toString()})()`, context);
    return { window, timers, events, context, advance: ms => { tick += ms; }, observer: () => performanceObserver };
}
async function check(id, work) { if (evidenceOnly && !id.startsWith('qualification-evidence:')) return; current = id; await work(); results.push(id); }
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
        'audioflix.library.index.js', 'audioflix.state.mutations.js', 'audioflix.state.persistence.js', 'audioflix.state.js']) {
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
    await checkLibraryQualificationEvidence(check, ROOT);
    await check('queue-handoffs-do-not-rebuild-mounted-library', () => {
        assertQueueProjection(3, 3);
        assert.throws(() => assertQueueProjection(3, 4), /without rebuilding/);
    });
    await check('response-segments-exclude-warmup-without-hiding-cold-or-measured-failures', () => {
        const frames = [], f = instrumentationFixture(callback => frames.push(callback)), soak = f.window.__librarySoak;
        const click = () => f.events.get('document:click')({ type: 'click',
            target: { classList: { contains: () => false }, closest: () => ({}) } });
        const frame = delay => {
            f.advance(delay); const callback = frames.shift();
            assert.equal(typeof callback, 'function', 'A response frame must be pending'); callback();
        };
        soak.phase('play-pointer');
        click(); frame(75);
        soak.segment?.('warmup');
        frame(75); // The startup/cold response remains startup after this switch: 150ms.
        click(); frame(500);
        soak.segment?.('measured'); soak.phase('after-warmup');
        frame(500); // Completion after the switch must remain attributed to warmup.
        soak.phase('play-pointer');
        click(); frame(25); frame(25); // Measured response: 50ms.
        soak.phase('queue-pointer');
        click(); frame(50); frame(51); // Measured regression: 101ms.

        const snapshot = soak.snapshot(), strict = snapshot.responseSummary, startup = snapshot.startupResponseSummary;
        assert.deepEqual({ ...strict['play-pointer'] },
            { count: 1, retained: 1, max: 50, p50: 50, p95: 50, firstFrameP50: 25, firstFrameP95: 25, firstFrameMax: 25, frameGapP50: 25, frameGapP95: 25, frameGapMax: 25 },
            'Cold and warmup samples cannot contaminate measured percentiles');
        assert.deepEqual({ ...startup['play-pointer'] },
            { count: 1, retained: 1, max: 150, p50: 150, p95: 150, firstFrameP50: 75, firstFrameP95: 75, firstFrameMax: 75, frameGapP50: 75, frameGapP95: 75, frameGapMax: 75 });
        assert.deepEqual({ ...snapshot.warmupResponseSummary['play-pointer'] },
            { count: 1, retained: 1, max: 1000, p50: 1000, p95: 1000, firstFrameP50: 500, firstFrameP95: 500, firstFrameMax: 500, frameGapP50: 500, frameGapP95: 500, frameGapMax: 500 });
        const warmup = Array.from(snapshot.responses).find(row => row.duration === 1000);
        assert.deepEqual({ phase: warmup.phase, started: warmup.started, firstFrameAt: warmup.firstFrameAt,
            finished: warmup.finished, finishedPhase: warmup.finishedPhase, segment: warmup.segment },
        { phase: 'play-pointer', started: 150, firstFrameAt: 650, finished: 1150,
            finishedPhase: 'after-warmup', segment: 'warmup' });
        assert.deepEqual(evaluateSoakBudgets({}, { 'play-pointer': strict['play-pointer'] }, {}, true), [],
            'Measured 50ms passes independently of the startup 150ms failure');
        const failures = evaluateSoakBudgets({}, strict, {}, true, startup);
        assert.deepEqual(failures.map(row => [row.name, row.actual, row.limit]), [
            ['queue-pointer:visual-response', 101, 100],
            ['startup:play-pointer:visual-response', 150, 100]
        ], 'Cold 150ms and measured 101ms responses remain strict budget failures');
        for (let index = 0; index < 2050; index++) { click(); frame(1); frame(1); }
        const overflow = soak.snapshot();
        assert.equal(overflow.responses.some(row => row.segment === 'startup'), false, 'The shared raw ring has evicted cold rows');
        assert.equal(overflow.startupResponseSummary['play-pointer'].p95, 150, 'The independent startup summary survives measured ring overflow');
    });
    await check('phase-recording-awaits-operation-and-two-response-frames', async () => {
        const frames = [], f = instrumentationFixture(callback => frames.push(callback));
        const page = { evaluate(callback, value) {
            f.context.argument = value;
            return vm.runInContext(`(${callback.toString()})(argument)`, f.context);
        } };
        let releaseOperation, resolved = false;
        const operationGate = new Promise(resolve => { releaseOperation = resolve; }), resultToken = { preserved: true };
        const action = recordSoakPhase(page, 'settled-click', async () => {
            f.events.get('document:click')({ type: 'click', target: { classList: { contains: () => false }, closest: () => ({}) } });
            await operationGate;
            return resultToken;
        });
        action.then(() => { resolved = true; }, () => { resolved = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(resolved, false, 'The operation result must settle before the action can finish');
        releaseOperation(); await new Promise(resolve => setImmediate(resolve));
        assert.equal(resolved, false, 'A pending response cannot settle before its first frame');
        f.advance(16); frames.shift()(); await new Promise(resolve => setImmediate(resolve));
        assert.equal(resolved, false, 'A pending response cannot settle after only its first frame');
        f.advance(17); frames.shift()();
        assert.equal(await action, resultToken, 'Settling instrumentation preserves the operation result');
        const response = f.window.__librarySoak.snapshot().responses[0];
        assert.deepEqual({ started: response.started, firstFrameAt: response.firstFrameAt, finished: response.finished,
            finishedPhase: response.finishedPhase, segment: response.segment },
        { started: 0, firstFrameAt: 16, finished: 33, finishedPhase: 'settled-click', segment: 'startup' });
        const rejection = new Error('operation-rejection');
        await assert.rejects(recordSoakPhase(page, 'rejected-operation', async () => { throw rejection; }), error => error === rejection);
    });
    await check('delayed-long-tasks-use-action-start-phase-with-fixed-budgets', async () => {
        const frames = [], f = instrumentationFixture(callback => frames.push(callback)), phases = [];
        const page = { evaluate(callback, name) {
            f.context.phaseName = name;
            return vm.runInContext(`(${callback.toString()})(phaseName)`, f.context);
        } };
        f.advance(10);
        const result = await recordSoakPhase(page, 'volume-drag-pointer', () => {
            phases.push(f.window.__librarySoak.snapshot().phase); f.advance(60); return 'released';
        });
        assert.equal(result, 'released');
        await recordSoakPhase(page, 'persistence:soak-volume-ready', () => {
            phases.push(f.window.__librarySoak.snapshot().phase); f.advance(70);
        });
        await recordSoakPhase(page, 'nexus-open-pointer', () => {
            phases.push(f.window.__librarySoak.snapshot().phase);
            f.events.get('document:click')({ type: 'click', target: { classList: { contains: () => false }, closest: () => ({}) } });
            f.advance(70); frames.shift()(); f.advance(31); frames.shift()(); f.advance(19);
        });
        await recordSoakPhase(page, 'group-play-pointer', () => { f.advance(20); });
        f.observer().callback({ getEntries: () => [{ startTime: 12, duration: 51 }, { startTime: 75, duration: 60 }, { startTime: 150, duration: 101 }] });
        const snapshot = f.window.__librarySoak.snapshot(), tasks = snapshot.longTasks;
        assert.deepEqual(phases, ['volume-drag-pointer', 'persistence:soak-volume-ready', 'nexus-open-pointer']);
        assert.deepEqual(Array.from(tasks, task => task.phase), phases, 'Late delivery cannot assign old work to the current group-play phase');
        assert.equal(snapshot.startupResponseSummary['nexus-open-pointer'].p95, 101, 'The real response callback retains slow cold control paint time');
        const failures = evaluateSoakBudgets({}, snapshot.responseSummary,
            { 'volume-drag-pointer': { max: tasks[0].duration } }, true, snapshot.startupResponseSummary);
        assert.deepEqual(failures.map(row => [row.name, row.limit]),
            [['startup:nexus-open-pointer:visual-response', 100], ['volume-drag-pointer:self-longtask', 50]],
            'Slow Nexus still fails 100ms; a true 51ms drag task still fails 50ms');
    });
    await check('pointer-coordinates-wait-for-hover-layout-transition', async () => {
        let finishHover, settled = false, focused = false, hovered = false, trialChecked = false;
        const transition = new Promise(resolve => { finishHover = resolve; });
        const element = { closest: () => ({ getAnimations: () => [{ finished: transition }] }) };
        const context = vm.createContext({ element, requestAnimationFrame: callback => callback() });
        const slider = { focus: async () => { focused = true; }, hover: async () => { hovered = true; },
            evaluate: callback => vm.runInContext(`(${callback.toString()})(element)`, context),
            click: async options => { assert.deepEqual(options, { trial: true }); trialChecked = true; } };
        const preparing = settleSoakSliderHover(slider).then(() => { settled = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(focused, true); assert.equal(hovered, true); assert.equal(settled, false,
            'Collapsed coordinates cannot be used while the hover expansion is moving the slider');
        assert.equal(trialChecked, false); finishHover(); await preparing;
        assert.equal(settled, true); assert.equal(trialChecked, true);
    });
    await check('real-css-hover-drag-hit-target', async () => {
        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            const css = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.library.css'), 'utf8');
            await page.setContent(`<style>${css} body{margin:0;padding-top:508.2656px}
                .audioflix-item-volume-wrapper{width:240px;margin-left:50px}</style>
                <div class="audioflix-item-volume-wrapper"><input class="audioflix-volume-slider" type="range" min="0" max="1" step=".01" value="1"><span class="audioflix-volume-label">100%</span></div>`);
            await page.evaluate(() => { window.events = []; for (const type of ['pointerdown', 'input', 'change', 'pointerup'])
                document.addEventListener(type, event => window.events.push({ type, hit: event.target.matches('.audioflix-volume-slider') }), true); });
            const slider = page.locator('.audioflix-volume-slider');
            for (let iteration = 0; iteration < 20; iteration++) {
                await page.mouse.move(0, 0); await settleSoakSliderHover(slider);
                const box = await slider.boundingBox(), start = Number(await slider.inputValue()) > .7 ? .9 : .15;
                const end = start > .7 ? .55 : .85, y = box.y + box.height / 2;
                await page.evaluate(() => window.events = []);
                await page.mouse.move(box.x + box.width * start, y); await page.mouse.down();
                for (let step = 1; step <= 20; step++) await page.mouse.move(box.x + box.width * (start + (end - start) * step / 20), y);
                await page.mouse.up();
                const events = await page.evaluate(() => window.events);
                assert.ok(events.filter(event => event.type === 'input').length >= 15, `Native range receives actual drag inputs: ${iteration}`);
                assert.equal(events.filter(event => event.type === 'change').length, 1);
                assert.ok(events.every(event => event.hit), 'Every actual event lands on the intended range');
            }
        } finally { await browser.close(); }
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
    await check('search-paint-awaits-two-frames-and-retains-separate-clocks', async () => {
        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            await page.setContent('<input data-af-nexus-search data-af-type="music"><div id="results"></div>');
            await page.evaluate(() => {
                let clock = 0;
                window.__searchFrames = [];
                performance.now = () => clock;
                window.requestAnimationFrame = callback => { window.__searchFrames.push(callback); return window.__searchFrames.length; };
                window.__advanceSearchFrame = elapsed => { clock += elapsed; window.__searchFrames.shift()(clock); };
                window.EveAudioflixDiagnostics = { span() {} };
                document.querySelector('input').addEventListener('input', () => {
                    document.querySelector('#results').innerHTML = '<button data-af-action="nexus-jump-card" data-af-id="target">Match</button>';
                });
            });
            await installSoakSearchDiagnostics(page, 'target');
            let settled = false;
            const pending = measureSoakSearchTiming(page, page.locator('input'), 'Match', '[data-af-id="target"]');
            pending.then(() => { settled = true; }, () => { settled = true; });
            await page.waitForFunction(() => window.__searchFrames.length === 1, null, { polling: 10, timeout: 3000 });
            assert.equal(settled, false, 'Results commit cannot finish the paint probe');
            await page.evaluate(() => window.__advanceSearchFrame(60));
            assert.equal(settled, false, 'One animation frame cannot finish the paint probe');
            await page.evaluate(() => window.__advanceSearchFrame(60));
            const measured = await pending;
            assert.equal(measured.timing.duration, 0, 'Handler timing remains its own synchronous clock');
            assert.equal(measured.paint.duration, 120);
            assert.equal(measured.paint.targetPresent, true);
            assert.equal(measured.paint.method, 'event-to-second-animation-frame');
            assert.ok(measured.automationMs >= 0);
            const failures = evaluateSoakBudgets({ 'search-input': latencyStats([measured.timing.duration]) },
                { 'search-input': latencyStats([measured.paint.duration]) }, {}, true);
            assert.deepEqual(failures.map(row => [row.name, row.limit]), [['search-input:visual-response', 100]]);
            await restoreSoakSearchDiagnostics(page);
            assert.equal(await page.evaluate(() => window.__soakSearchTimingAbort), null);
        } finally { await browser.close(); }
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
