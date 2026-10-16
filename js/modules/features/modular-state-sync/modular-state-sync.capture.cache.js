// --- Modular State Sync Detached Section Capture Cache ---
(function () {
    'use strict';

    const REQUIRED_SECTIONS = Object.freeze([
        'metadata', 'bookmarks', 'library', 'knowledge', 'audioflix', 'audioflixStructure'
    ]);

    function create(options = {}) {
        const getStore = options.getStore || (() => window.EveDataStore?.Store);
        const now = options.now || (() => Date.now());
        const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : 60000;
        const captureStructure = options.captureStructure || ((audioflix) => (
            window.EveAudioflixStateRecovery?.captureStructure?.(audioflix) || null
        ));
        const hashPartsAsync = typeof options.hashPartsAsync === 'function' ? options.hashPartsAsync : null;
        const yieldTask = options.yieldTask || (() => window.EveCooperativeWork?.yieldTask?.() || Promise.resolve());
        const receipts = new WeakMap();
        const counts = {
            fullCount: 0,
            incrementalCount: 0,
            reuseCount: 0,
            failureCount: 0,
            staleAsyncCount: 0
        };
        const fullCauses = Object.create(null);
        const timings = { fullMs: 0, incrementalMs: 0, asyncFullMs: 0, asyncIncrementalMs: 0 };
        let sections = null;
        let snapshot = null;
        let fullAuditAt = null;
        let fullReason = 'initial';
        let pendingReceipt = null;
        let epoch = 0;
        let sequence = 0;
        let latestReceipt = 0;
        let captureGeneration = 0;
        let traceSequence = 0;

        function timestamp() {
            const value = Number(now());
            return Number.isFinite(value) ? value : Date.now();
        }

        function elapsedClock() {
            return typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() : Date.now();
        }

        function traceEnabled() {
            return window.__soakDebug?.enabled === true;
        }

        function trace(value) {
            if (!traceEnabled()) return;
            try { window.__soakDebug?.note?.(value); } catch { /* Qualification telemetry is observational only. */ }
        }

        function workerStats() {
            try { return window.EveModularCaptureWorker?.stats?.() || null; }
            catch { return null; }
        }

        function fresh(at) {
            return fullAuditAt !== null && at >= fullAuditAt && at - fullAuditAt < ttlMs;
        }

        function complete() {
            return sections && REQUIRED_SECTIONS.every((key) => sections.has(key));
        }

        function requireFull(cause) {
            fullReason = fullReason || cause;
            pendingReceipt = null;
            latestReceipt = 0;
            epoch += 1;
            captureGeneration += 1;
        }

        function offerConfigSnapshot(signature, configDelta) {
            if (typeof signature !== 'string' || !signature
                || configDelta?.complete !== true
                || !Array.isArray(configDelta.changedKeys)
                || !configDelta.changedKeys.length) return null;
            for (let index = 0; index < configDelta.changedKeys.length; index += 1) {
                if (configDelta.changedKeys[index] !== 'audioflix') return null;
            }
            // Only the immutable signature owns the receipt. Extra legacy object
            // arguments are deliberately ignored; decoding stays outside mutation events.
            const token = Object.freeze({});
            receipts.set(token, Object.freeze({
                signature,
                epoch,
                sequence: ++sequence
            }));
            return token;
        }

        function invalidate(detail) {
            const token = detail?.kind === 'config' ? detail.captureReceipt : null;
            const receipt = token && (typeof token === 'object' || typeof token === 'function')
                ? receipts.get(token) : null;
            if (receipt) receipts.delete(token);
            if (!receipt || receipt.epoch !== epoch) {
                requireFull(detail?.kind === 'config' ? 'untrusted-config' : 'unknown-scope');
                return false;
            }
            if (fullReason || !complete()) {
                requireFull('incomplete-baseline');
                return false;
            }
            if (!fresh(timestamp())) {
                requireFull('expired');
                return false;
            }
            // Notifications can arrive out of order; a consumed older receipt cannot roll
            // back the most recent committed signature in this trusted baseline epoch.
            if (receipt.sequence <= latestReceipt) return true;
            latestReceipt = receipt.sequence;
            pendingReceipt = receipt;
            captureGeneration += 1;
            return true;
        }

        function codec() {
            const value = window.EveModularCaptureCodec;
            if (typeof value?.splitObject !== 'function' || typeof value?.hashParts !== 'function') {
                throw new Error('Modular capture codec unavailable');
            }
            return value;
        }

        function checkedParts(value) {
            if (!value || typeof value.get !== 'function' || typeof value.entries !== 'function') {
                throw new Error('Capture must be a JSON object');
            }
            return value;
        }

        function assemble(parts) {
            return '{' + Array.from(parts, ([key, raw]) => JSON.stringify(key) + ':' + raw).join(',') + '}';
        }

        function accept(parts, json, hash, full, cause, at) {
            if (typeof json !== 'string' || !json || typeof hash !== 'string' || !hash) {
                throw new Error('Invalid detached capture');
            }
            const next = Object.freeze({ json, hash, capturedAt: at, full, cause });
            sections = parts;
            snapshot = next;
            pendingReceipt = null;
            if (full) {
                fullAuditAt = at;
                fullReason = '';
                latestReceipt = 0;
                epoch += 1;
                counts.fullCount += 1;
                fullCauses[cause] = (fullCauses[cause] || 0) + 1;
            } else {
                counts.incrementalCount += 1;
            }
            return next;
        }

        function captureFull(cause) {
            const started = elapsedClock();
            try {
                const store = getStore();
                if (typeof store?.captureState !== 'function') return null;
                // Native serialization defines this exact detached payload and its sections.
                // The hash always comes from these strings, never a second live capture.
                const json = JSON.stringify(store.captureState());
                if (typeof json !== 'string') return null;
                const helper = codec();
                const parts = checkedParts(helper.splitObject(json));
                return accept(parts, json, helper.hashParts(parts), true, cause, timestamp());
            } catch {
                counts.failureCount += 1;
                return null;
            } finally {
                timings.fullMs += Math.max(0, elapsedClock() - started);
            }
        }

        function captureIncremental() {
            const started = elapsedClock();
            try {
                const helper = codec();
                const configSnapshot = JSON.parse(pendingReceipt.signature);
                if (!configSnapshot || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
                    throw new Error('Invalid detached config snapshot');
                }
                const detachedAudioflix = Object.prototype.hasOwnProperty.call(configSnapshot, 'audioflix')
                    ? configSnapshot.audioflix : null;
                const audioflixJson = JSON.stringify(detachedAudioflix);
                const structure = detachedAudioflix ? captureStructure(detachedAudioflix) : null;
                const structureJson = JSON.stringify(structure || null);
                const parts = new Map(sections);
                parts.set('audioflix', audioflixJson);
                parts.set('audioflixStructure', structureJson);
                const json = assemble(parts);

                const hash = helper.hashParts(parts);
                const at = timestamp();
                // Expensive structure construction must not let an audit deadline pass.
                if (!fresh(at)) {
                    requireFull('expired');
                    return null;
                }
                return accept(parts, json, hash, false, 'audioflix-config', at);
            } catch {
                counts.failureCount += 1;
                requireFull('invalid-receipt');
                return null;
            } finally {
                timings.incrementalMs += Math.max(0, elapsedClock() - started);
            }
        }

        function capture({ forceFresh = false } = {}) {
            const at = timestamp();
            if (forceFresh) requireFull('forceFresh');
            if (!snapshot || fullReason || !fresh(at)) {
                return captureFull(forceFresh ? 'forceFresh' : (fullReason || 'expired'));
            }
            if (pendingReceipt) {
                const next = captureIncremental();
                return next || captureFull(fullReason || 'invalid-receipt');
            }
            counts.reuseCount += 1;
            return snapshot;
        }

        function asyncHash(parts) {
            if (!hashPartsAsync) return Promise.resolve(codec().hashParts(parts));
            return Promise.resolve(hashPartsAsync(parts));
        }

        async function continueCapture(generation, receipt) {
            await yieldTask();
            if (generation === captureGeneration && (!receipt || pendingReceipt === receipt)) return true;
            counts.staleAsyncCount += 1;
            return false;
        }

        async function captureFullAsync(cause) {
            const started = elapsedClock();
            const generation = captureGeneration;
            const debug = traceEnabled();
            const attempt = debug ? ++traceSequence : 0;
            const stages = {};
            let outcome = 'failed';
            try {
                const store = getStore();
                if (typeof store?.captureState !== 'function') return null;
                const prepared = await window.EveModularCaptureFull.prepare({
                    store, codec: codec(), captureStructure,
                    checkpoint: () => continueCapture(generation),
                    measure(name, operation) {
                        const at = debug ? elapsedClock() : 0;
                        try { return operation(); }
                        finally { if (debug) stages[name] = Math.max(0, elapsedClock() - at); }
                    }
                });
                if (!prepared) { outcome = 'stale'; return null; }
                const { json } = prepared, parts = checkedParts(prepared.parts);
                let mark = debug ? elapsedClock() : 0;
                const pendingHash = asyncHash(parts);
                if (debug) { stages.handoffMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                const hash = await pendingHash;
                if (debug) stages.workerWaitMs = Math.max(0, elapsedClock() - mark);
                if (generation !== captureGeneration) {
                    counts.staleAsyncCount += 1;
                    outcome = 'stale';
                    return null;
                }
                outcome = 'accepted';
                return accept(parts, json, hash, true, cause, timestamp());
            } catch {
                counts.failureCount += 1;
                if (generation === captureGeneration) requireFull('async-failure');
                else counts.staleAsyncCount += 1;
                return null;
            } finally {
                const totalMs = Math.max(0, elapsedClock() - started);
                timings.asyncFullMs += totalMs;
                const worker = debug ? workerStats() : null;
                if (debug && (totalMs >= 25 || worker?.mode !== 'worker' || worker?.failures || worker?.fallbacks)) {
                    trace({ kind: 'capture-full-timing', attempt, generation, cause, outcome, totalMs, ...stages, worker });
                }
            }
        }

        async function captureIncrementalAsync() {
            const started = elapsedClock();
            const generation = captureGeneration;
            const receipt = pendingReceipt;
            const debug = traceEnabled();
            const attempt = debug ? ++traceSequence : 0;
            const stages = {};
            let outcome = 'failed';
            try {
                if (!receipt) return null;
                // Do not begin a large native parse inline with the event that supplied a
                // receipt. Recheck its generation after giving pending input/paint priority.
                if (!await continueCapture(generation, receipt)) { outcome = 'stale'; return null; }
                let mark = debug ? elapsedClock() : 0;
                const configSnapshot = JSON.parse(receipt.signature);
                if (debug) { stages.receiptParseMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                if (!configSnapshot || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
                    throw new Error('Invalid detached config snapshot');
                }
                const detachedAudioflix = Object.prototype.hasOwnProperty.call(configSnapshot, 'audioflix')
                    ? configSnapshot.audioflix : null;
                if (!await continueCapture(generation, receipt)) { outcome = 'stale'; return null; }
                if (debug) mark = elapsedClock();
                const audioflixJson = JSON.stringify(detachedAudioflix);
                if (debug) { stages.audioJsonMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                if (!await continueCapture(generation, receipt)) { outcome = 'stale'; return null; }
                if (debug) mark = elapsedClock();
                const structure = detachedAudioflix ? captureStructure(detachedAudioflix) : null;
                if (debug) { stages.captureStructureMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                if (!await continueCapture(generation, receipt)) { outcome = 'stale'; return null; }
                if (debug) mark = elapsedClock();
                const structureJson = JSON.stringify(structure || null);
                if (debug) { stages.structureJsonMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                const parts = new Map(sections);
                parts.set('audioflix', audioflixJson);
                parts.set('audioflixStructure', structureJson);
                if (debug) { stages.partsCopyMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                const json = assemble(parts);
                if (debug) { stages.assembleMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                if (!await continueCapture(generation, receipt)) { outcome = 'stale'; return null; }
                if (debug) mark = elapsedClock();
                const pendingHash = asyncHash(parts);
                if (debug) { stages.handoffMs = Math.max(0, elapsedClock() - mark); mark = elapsedClock(); }
                const hash = await pendingHash;
                if (debug) stages.workerWaitMs = Math.max(0, elapsedClock() - mark);
                if (generation !== captureGeneration || pendingReceipt !== receipt) {
                    counts.staleAsyncCount += 1;
                    outcome = 'stale';
                    return null;
                }
                const at = timestamp();
                if (!fresh(at)) {
                    requireFull('expired');
                    outcome = 'expired';
                    return null;
                }
                outcome = 'accepted';
                return accept(parts, json, hash, false, 'audioflix-config', at);
            } catch {
                counts.failureCount += 1;
                if (generation === captureGeneration && pendingReceipt === receipt) requireFull('invalid-receipt');
                else counts.staleAsyncCount += 1;
                return null;
            } finally {
                const totalMs = Math.max(0, elapsedClock() - started);
                timings.asyncIncrementalMs += totalMs;
                const worker = debug ? workerStats() : null;
                if (debug && (totalMs >= 25 || worker?.mode !== 'worker' || worker?.failures || worker?.fallbacks)) {
                    trace({ kind: 'capture-incremental-timing', attempt, generation,
                        receiptSequence: receipt?.sequence || 0, outcome, totalMs, ...stages, worker });
                }
            }
        }

        async function captureAsync({ forceFresh = false } = {}) {
            if (forceFresh) requireFull('forceFresh');
            for (let attempt = 0; attempt < 2; attempt += 1) {
                const at = timestamp();
                if (!snapshot || fullReason || !fresh(at)) {
                    const next = await captureFullAsync(forceFresh ? 'forceFresh' : (fullReason || 'expired'));
                    if (next) return next;
                    continue;
                }
                if (pendingReceipt) {
                    const next = await captureIncrementalAsync();
                    if (next) return next;
                    continue;
                }
                counts.reuseCount += 1;
                return snapshot;
            }
            return null;
        }

        function stats() {
            return Object.freeze({
                ...counts,
                fullCauses: Object.freeze({ ...fullCauses }),
                timings: Object.freeze({ ...timings }),
                fullAuditAt,
                capturedAt: snapshot?.capturedAt ?? null,
                pending: !!pendingReceipt,
                fullRequired: !!fullReason,
                complete: !!complete(),
                generation: captureGeneration
            });
        }

        return Object.freeze({ capture, captureAsync, invalidate, offerConfigSnapshot, stats });
    }

    window.EveModularCaptureCache = Object.freeze({ create });
})();
