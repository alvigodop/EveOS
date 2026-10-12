window.EveAudioflixDiagnostics = window.EveAudioflixDiagnostics || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixDiagnostics;
    if (ns.ready) return;

    const LIMIT = 128, KEY_LIMIT = 64, samples = [], totals = new Map(), bootRecorded = new Set();
    const gauges = new Map(), counters = new Map();
    // Closed numeric keys prevent a caller from using an item ID, path, or secret as telemetry.
    const GAUGES = new Set(['ui:render-generation', 'ui:render-cards', 'playlist:upstream-items',
        'playlist:added-items', 'playlist:restored-items', 'playlist:missing-items',
        'state:music-items', 'state:sound-items', 'state:volume-pending']);
    const COUNTERS = new Set(['ui:render-generations', 'ui:card-generations',
        'playlist:reconcile-attempts', 'playlist:apply-attempts', 'state:persist-attempts',
        'state:persist-errors', 'state:volume-preview-count', 'state:volume-commit-count', 'queue:terminal-patches',
        'index:builds', 'index:updates']);
    const now = () => window.performance?.now?.() ?? Date.now();
    const safeDetail = (details = {}) => ({
        action: details.action ? String(details.action).slice(0, 80) : '',
        interactionId: Math.max(0, Number(details.interactionId || 0) || 0),
        error: details.error === true
    });

    function record(name, ms, details = {}) {
        const duration = Math.max(0, Number.isFinite(Number(ms)) ? Number(ms) : 0);
        const key = String(name).slice(0, 120);
        let bucket = totals.get(key);
        if (!bucket) {
            if (totals.size >= KEY_LIMIT) totals.delete(totals.keys().next().value);
            bucket = { count: 0, errors: 0, maxMs: 0, values: [] }; totals.set(key, bucket);
        }
        bucket.count += 1; bucket.errors += details.error ? 1 : 0;
        bucket.maxMs = Math.max(bucket.maxMs, duration);
        bucket.values.push(duration); if (bucket.values.length > LIMIT) bucket.values.shift();
        samples.push({ name: key, ms: duration, at: now(), ...safeDetail(details) });
        if (samples.length > LIMIT) samples.shift();
    }

    function numeric(store, allowed, name, value, add) {
        if (!allowed.has(name) || typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false;
        if (!store.has(name) && gauges.size + counters.size >= KEY_LIMIT) return false;
        store.set(name, Math.min(Number.MAX_SAFE_INTEGER, (add ? store.get(name) || 0 : 0) + value));
        return true;
    }
    const gauge = (name, value) => numeric(gauges, GAUGES, name, value, false);
    const increment = (name, delta = 1) => numeric(counters, COUNTERS, name, delta, true);
    function reset() {
        samples.length = 0; totals.clear(); gauges.clear(); counters.clear(); bootRecorded.clear();
        pendingPlayInput = null; loadingAt = null; endedAt = null;
    }

    function span(name, details = {}) {
        const started = now();
        let finished = false;
        return error => {
            if (finished) return;
            finished = true;
            record(name, now() - started, { ...details, error: !!error });
        };
    }

    function snapshot() {
        const summary = Object.create(null);
        for (const [name, bucket] of totals) {
            const values = [...bucket.values].sort((a, b) => a - b);
            const percentile = p => values[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
            summary[name] = {
                count: bucket.count, errors: bucket.errors, maxMs: bucket.maxMs,
                p50Ms: percentile(0.5), p95Ms: percentile(0.95)
            };
        }
        return { summary, recent: samples.map(value => ({ ...value })),
            gauges: Object.fromEntries(gauges), counters: Object.fromEntries(counters),
            capacity: { samples: LIMIT, timingKeys: KEY_LIMIT, metricKeys: KEY_LIMIT } };
    }

    function actionForTarget(target) {
        try {
            const actionNode = target?.closest?.('[data-af-action]');
            if (actionNode?.dataset?.afAction) return String(actionNode.dataset.afAction);
            if (target?.closest?.('.topbar-audioflix-btn')) return 'open-audioflix';
        } catch {}
        return '';
    }

    const PLAY_ACTION = /(?:^|[-:])(play|internal-view|open-queue-view|restart)(?:$|[-:])/i;
    let pendingPlayInput = null, loadingAt = null, endedAt = null;
    function noteInput(event) {
        if (event?.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(String(event.key || ''))) return;
        const action = actionForTarget(event?.target);
        if (!action || !PLAY_ACTION.test(action)) return;
        pendingPlayInput = { action, at: now() };
    }
    try {
        document.addEventListener('pointerdown', noteInput, true);
        document.addEventListener('keydown', noteInput, true);
    } catch {}

    window.addEventListener('eve:audioflix-playback', event => {
        const status = String(event.detail?.status || '');
        const timestamp = now();
        if (/^(Loading|Starting|Resolving|Buffering)\b/i.test(status)) loadingAt ??= timestamp;
        if (status === 'Ended') endedAt ??= timestamp;
        else if (/^Playing\b/.test(status)) {
            if (pendingPlayInput && timestamp - pendingPlayInput.at <= 60000) {
                const elapsed = timestamp - pendingPlayInput.at;
                record('ui:input-to-playing', elapsed, { action: pendingPlayInput.action });
                record(`ui:input-to-playing:${pendingPlayInput.action}`, elapsed, { action: pendingPlayInput.action });
                pendingPlayInput = null;
            }
            if (loadingAt !== null) { record('playback:load-to-playing', timestamp - loadingAt); loadingAt = null; }
            if (endedAt !== null) { record('queue:between-songs', timestamp - endedAt); endedAt = null; }
        } else if (status === 'Stopped') {
            endedAt = null; loadingAt = null; pendingPlayInput = null;
        }
    });

    function observeEventTiming() {
        if (typeof PerformanceObserver !== 'function') return;
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                const action = actionForTarget(entry.target);
                if (!action) continue;
                const details = { action, interactionId: entry.interactionId };
                record(`ui:input-delay:${action}`, Number(entry.processingStart || 0) - Number(entry.startTime || 0), details);
                record(`ui:handler:${action}`, Number(entry.processingEnd || 0) - Number(entry.processingStart || 0), details);
                record(`ui:interaction-total:${action}`, entry.duration, details);
            }
        });
        observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
    }

    function observeLongTasks() {
        if (typeof PerformanceObserver !== 'function') return;
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) record('ui:long-task', entry.duration);
        });
        observer.observe({ type: 'longtask', buffered: true });
    }

    function recordBootMilestones() {
        const nav = window.performance?.getEntriesByType?.('navigation')?.[0];
        if (!nav) return;
        const start = Number(nav.startTime || 0);
        const milestones = [
            ['boot:dom-interactive', nav.domInteractive],
            ['boot:dom-content-loaded', nav.domContentLoadedEventEnd],
            ['boot:window-load', nav.loadEventEnd]
        ];
        for (const [name, value] of milestones) {
            const numeric = Number(value || 0);
            if (numeric > start && !bootRecorded.has(name)) {
                bootRecorded.add(name);
                record(name, numeric - start);
            }
        }
    }

    try { observeLongTasks(); } catch { /* optional browser capability */ }
    try { observeEventTiming(); } catch { /* optional browser capability */ }
    recordBootMilestones();
    try { document.addEventListener('DOMContentLoaded', recordBootMilestones, { once: true }); } catch {}
    try { window.addEventListener('load', recordBootMilestones, { once: true }); } catch {}

    Object.assign(ns, { ready: true, record, span, snapshot, gauge, increment, reset, actionForTarget });
    record('boot:audioflix-module', now());
})();
