// --- EveOS lightweight performance monitor ---
(function () {
    'use strict';

    if (window.EvePerformanceMonitor?.ready) return;

    const MAX_LONG_TASKS = 80;
    const MAX_OPERATIONS = 160;
    const longTasks = [];
    const operations = [];

    function now() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    function cloneMeta(meta) {
        if (!meta || typeof meta !== 'object') return {};
        const output = {};
        [
            'source',
            'reason',
            'workspaceId',
            'targetWorkspaceId',
            'categoryName',
            'targetCategoryName',
            'linkCount',
            'movedCount',
            'mergedCount',
            'removedCount',
            'updated',
            'queued',
            'scanned',
            'total',
            'aborted',
            'suppressed',
            'dirty',
            'skipRender',
            'batchSize',
            'remaining',
            'domNodes',
            'images',
            'pauseMs',
            'phase',
            'scheduled',
            'checked',
            'fallback'
        ].forEach(function (key) {
            if (Object.prototype.hasOwnProperty.call(meta, key)) output[key] = meta[key];
        });
        return output;
    }

    function pushCapped(list, entry, max) {
        list.push(entry);
        if (list.length > max) list.splice(0, list.length - max);
    }

    function recordLongTask(entry) {
        pushCapped(longTasks, {
            at: Date.now(),
            startTime: Number(entry?.startTime || 0),
            duration: Number(entry?.duration || 0),
            name: String(entry?.name || 'self')
        }, MAX_LONG_TASKS);
    }

    function recordOperation(name, duration, meta) {
        pushCapped(operations, {
            at: Date.now(),
            name: String(name || 'operation'),
            duration: Number(duration || 0),
            meta: cloneMeta(meta)
        }, MAX_OPERATIONS);
    }

    function startOperation(name, meta) {
        const started = now();
        return function finishOperation(patch) {
            recordOperation(name, now() - started, Object.assign({}, meta || {}, patch || {}));
        };
    }

    function summarizeByName(list) {
        const output = {};
        list.forEach(function (entry) {
            const key = String(entry.name || 'operation');
            const bucket = output[key] || { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, lastAt: 0 };
            const duration = Number(entry.duration || 0);
            bucket.count += 1;
            bucket.totalMs += duration;
            bucket.maxMs = Math.max(bucket.maxMs, duration);
            bucket.lastMs = duration;
            bucket.lastAt = entry.at || 0;
            output[key] = bucket;
        });
        return output;
    }

    function getStats() {
        const worstLongTask = longTasks.reduce(function (best, entry) {
            return Number(entry.duration || 0) > Number(best?.duration || 0) ? entry : best;
        }, null);
        const worstOperation = operations.reduce(function (best, entry) {
            return Number(entry.duration || 0) > Number(best?.duration || 0) ? entry : best;
        }, null);
        return {
            longTaskCount: longTasks.length,
            worstLongTask: worstLongTask ? Object.assign({}, worstLongTask) : null,
            worstOperation: worstOperation ? Object.assign({}, worstOperation) : null,
            operationsByName: summarizeByName(operations),
            recentOperations: operations.slice(-12)
        };
    }

    try {
        if (typeof PerformanceObserver === 'function') {
            new PerformanceObserver(function (list) {
                list.getEntries().forEach(recordLongTask);
            }).observe({ entryTypes: ['longtask'] });
        }
    } catch (error) {
        // Long Task API is unavailable in some engines/contexts.
    }

    window.EvePerformanceMonitor = {
        ready: true,
        recordOperation,
        startOperation,
        getStats
    };
})();
