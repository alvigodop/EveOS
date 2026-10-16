// Disposable qualification context only. No production module installs these counters.
export function installLibrarySoakInstrumentation() {
    const timers = { timeout: new Set(), interval: new Set() }, observers = Object.create(null);
    const errors = [], resourceErrors = [], longTasks = [], phases = [], responses = [], responseBuckets = new Map();
    const warmupResponseBuckets = new Map(), startupResponseBuckets = new Map(), pendingResponses = new Set();
    let phase = 'boot', segment = 'startup', errorCount = 0, longTaskCount = 0, droppedLongTasks = 0;
    const bounded = (list, value, max) => { list.push(value); if (list.length > max) list.shift(); };
    const stats = values => {
        const sorted = [...values].sort((a, b) => a - b);
        return { retained: sorted.length, max: sorted.at(-1) || 0,
            p50: sorted[Math.floor((sorted.length - 1) * .5)] || 0,
            p95: sorted[Math.ceil((sorted.length - 1) * .95)] || 0 };
    };
    const summarizeResponses = buckets => Object.fromEntries([...buckets].map(([name, bucket]) => {
        const total = stats(bucket.values), first = stats(bucket.firstFrames), gap = stats(bucket.frameGaps);
        return [name, { count: bucket.count, retained: total.retained, max: total.max, p50: total.p50, p95: total.p95,
            firstFrameP50: first.p50, firstFrameP95: first.p95, firstFrameMax: first.max,
            frameGapP50: gap.p50, frameGapP95: gap.p95, frameGapMax: gap.max }];
    }));
    const noteError = event => {
        if (event.type === 'error' && !event.message && event.target && event.target !== window) {
            bounded(resourceErrors, { phase, tag: event.target.tagName || '', url: String(event.target.currentSrc || event.target.src || event.target.href || '') }, 64);
            return;
        }
        errorCount += 1;
        bounded(errors, { phase, type: event.type, message: String(event.reason?.message || event.message || event.reason || 'error').slice(0, 600) }, 30);
    };
    window.addEventListener('error', noteError, true);
    window.addEventListener('unhandledrejection', noteError, true);
    const response = event => {
        const target = event.target, volume = target?.classList?.contains('audioflix-volume-slider');
        const actionTarget = volume ? target : target?.closest?.('[data-af-action]');
        if (!volume && !actionTarget) return;
        const started = performance.now(), owner = phase, ownerSegment = segment;
        const action = volume ? 'volume-input' : String(actionTarget?.dataset?.afAction || '');
        const id = String(actionTarget?.dataset?.afId || '');
        const afType = String(actionTarget?.dataset?.afType || '');
        let complete;
        const pending = new Promise(resolve => { complete = resolve; });
        pendingResponses.add(pending);
        requestAnimationFrame(() => {
            const firstFrameAt = performance.now();
            requestAnimationFrame(() => {
                const finished = performance.now(), duration = finished - started;
                const toFirstFrame = firstFrameAt - started, frameGap = finished - firstFrameAt;
                bounded(responses, { phase: owner, segment: ownerSegment, type: event.type, action, id, afType, duration,
                    toFirstFrame, frameGap, started, firstFrameAt, finished, finishedPhase: phase }, 2048);
                const buckets = ownerSegment === 'measured' ? responseBuckets
                    : ownerSegment === 'warmup' ? warmupResponseBuckets : startupResponseBuckets;
                if (buckets) {
                    if (!buckets.has(owner)) {
                        if (buckets.size >= 32) buckets.delete(buckets.keys().next().value);
                        buckets.set(owner, { count: 0, values: [], firstFrames: [], frameGaps: [] });
                    }
                    const bucket = buckets.get(owner); bucket.count += 1;
                    bounded(bucket.values, duration, 1024); bounded(bucket.firstFrames, toFirstFrame, 1024); bounded(bucket.frameGaps, frameGap, 1024);
                }
                pendingResponses.delete(pending); complete();
            });
        });
    };
    document.addEventListener('input', response, true); document.addEventListener('click', response, true);
    for (const [kind, setName, clearName] of [['timeout', 'setTimeout', 'clearTimeout'], ['interval', 'setInterval', 'clearInterval']]) {
        const nativeSet = window[setName], nativeClear = window[clearName];
        window[setName] = function (callback, delay, ...args) {
            if (typeof callback !== 'function') return Reflect.apply(nativeSet, window, [callback, delay, ...args]);
            let handle;
            const wrapped = function (...values) {
                if (kind === 'timeout') timers.timeout.delete(handle);
                return Reflect.apply(callback, this, values);
            };
            handle = Reflect.apply(nativeSet, window, [wrapped, delay, ...args]);
            timers[kind].add(handle); return handle;
        };
        window[clearName] = function (handle) {
            timers.timeout.delete(handle); timers.interval.delete(handle);
            return Reflect.apply(nativeClear, window, [handle]);
        };
    }
    for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver']) {
        const Native = window[name]; if (typeof Native !== 'function') continue;
        const counter = observers[name] = { created: 0, observing: 0, disconnected: 0, collected: 0 };
        const state = new WeakMap();
        const finalizer = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(record => {
            if (record.active) counter.observing -= 1; counter.collected += 1;
        }) : null;
        window[name] = class extends Native {
            constructor(...args) {
                super(...args); const record = { active: false }; state.set(this, record);
                counter.created += 1; finalizer?.register(this, record);
            }
            observe(...args) {
                const result = super.observe(...args), record = state.get(this);
                if (!record.active) { record.active = true; counter.observing += 1; }
                return result;
            }
            disconnect(...args) {
                const result = super.disconnect(...args), record = state.get(this);
                if (record.active) { record.active = false; counter.observing -= 1; }
                counter.disconnected += 1; return result;
            }
        };
    }
    window.__librarySoak = {
        phase(name) { phase = name; bounded(phases, { name, segment, at: performance.now() }, 2048); },
        segment(name) {
            if (!['startup', 'warmup', 'measured'].includes(name)) throw Error('Unknown soak measurement segment');
            segment = name; bounded(phases, { name: phase, segment, at: performance.now() }, 2048);
        },
        async settleResponses() { while (pendingResponses.size) await Promise.all([...pendingResponses]); },
        snapshot() { return { phase, segment, pendingResponses: pendingResponses.size,
            errorCount, errors: errors.map(error => ({ ...error })), resourceErrors: resourceErrors.map(error => ({ ...error })),
            timers: { timeout: timers.timeout.size, interval: timers.interval.size },
            observers: Object.fromEntries(Object.entries(observers).map(([key, value]) => [key, { ...value }])),
            longTaskCount, droppedLongTasks, longTasks: longTasks.map(task => ({ ...task })),
            responses: responses.map(value => ({ ...value })), responseSummary: summarizeResponses(responseBuckets),
            startupResponseSummary: summarizeResponses(startupResponseBuckets),
            warmupResponseSummary: summarizeResponses(warmupResponseBuckets) }; },
        drainLongTasks() { const result = longTasks.splice(0); return result; }
    };
    try {
        const observer = new window.PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                const owner = [...phases].reverse().find(mark => mark.at <= entry.startTime);
                longTaskCount += 1;
                if (longTasks.length >= 2048) droppedLongTasks += 1;
                bounded(longTasks, { phase: owner?.name || 'boot', segment: owner?.segment || 'startup', duration: entry.duration, start: entry.startTime,
                    attribution: (entry.attribution || []).map(part => part.name || part.containerType || 'unknown').slice(0, 4) }, 2048);
            }
        });
        observer.observe({ type: 'longtask', buffered: true });
    } catch { /* optional browser observation */ }
}

export const latencyStats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * .5)] || 0,
        p95: sorted[Math.ceil((sorted.length - 1) * .95)] || 0, max: sorted.at(-1) || 0 };
};

export async function sampleSoakResources(page, cdp, label) {
    await cdp.send('HeapProfiler.collectGarbage');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const [dom, heap, scoped] = await Promise.all([cdp.send('Memory.getDOMCounters'), cdp.send('Runtime.getHeapUsage'),
        page.evaluate(() => ({ instrumentation: window.__librarySoak.snapshot(),
            mountedCards: document.querySelectorAll('#audioflix-overlay .audioflix-item-card').length,
            modularCapture: {
                cache: window.EveDataStore?._modularSync?.captureCacheStats?.() || null,
                worker: window.EveDataStore?._modularSync?.captureWorkerStats?.() || null
            },
            diagnostics: window.EveAudioflixDiagnostics?.snapshot?.() || null }))]);
    return { label, gcRequested: true, dom, heap, ...scoped };
}

export function resourceGrowth(samples) {
    const first = samples[0], final = samples.at(-1);
    const slope = key => {
        const values = samples.map(key), n = values.length;
        const meanX = (n - 1) / 2, meanY = values.reduce((sum, value) => sum + value, 0) / n;
        const numerator = values.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0);
        const denominator = values.reduce((sum, _, index) => sum + (index - meanX) ** 2, 0);
        return denominator ? numerator / denominator : 0;
    };
    return { sampleCount: samples.length, nodesDelta: final.dom.nodes - first.dom.nodes,
        listenersDelta: final.dom.jsEventListeners - first.dom.jsEventListeners,
        heapDelta: final.heap.usedSize - first.heap.usedSize,
        nodesPerBatch: slope(sample => sample.dom.nodes), heapBytesPerBatch: slope(sample => sample.heap.usedSize),
        caveat: 'post-GC trend in disposable context; not proof of leak freedom or provider endurance' };
}

export function summarizeSoakLongTasks(rows) {
    const attribution = {}, warmupAttribution = {};
    for (const row of rows) {
        const target = row.segment === 'warmup' ? warmupAttribution : attribution;
        (target[row.phase] ||= []).push(row.duration);
    }
    const summarize = buckets => Object.fromEntries(Object.entries(buckets).map(([key, values]) => [key, latencyStats(values)]));
    return { longTaskAttribution: summarize(attribution), warmupLongTaskAttribution: summarize(warmupAttribution) };
}

export function evaluateSoakBudgets(latency, responses, tasks, normalGroup, startupResponses = {}) {
    const failures = [];
    const check = (name, actual, limit, kind = 'p95') => {
        if (actual > limit) failures.push({ name, kind, actual, limit });
    };
    for (const [name, values] of Object.entries(responses)) check(`${name}:visual-response`, values.p95, 100);
    for (const [name, values] of Object.entries(startupResponses)) check(`startup:${name}:visual-response`, values.p95, 100);
    if (latency['search-input']) check('search-input', latency['search-input'].p95, 150);
    if (latency['group-expand-pointer']) check('group-expand-pointer', latency['group-expand-pointer'].p95, normalGroup ? 150 : 500);
    const drag = tasks['volume-drag-pointer'];
    if (drag) check('volume-drag-pointer:self-longtask', drag.max, 50, 'max');
    return failures;
}
