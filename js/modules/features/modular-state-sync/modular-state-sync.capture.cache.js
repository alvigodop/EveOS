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
        const receipts = new WeakMap();
        const counts = { fullCount: 0, incrementalCount: 0, reuseCount: 0, failureCount: 0 };
        const fullCauses = Object.create(null);
        const timings = { fullMs: 0, incrementalMs: 0 };
        let sections = null;
        let snapshot = null;
        let fullAuditAt = null;
        let fullReason = 'initial';
        let pendingReceipt = null;
        let epoch = 0;
        let sequence = 0;
        let latestReceipt = 0;

        function timestamp() {
            const value = Number(now());
            return Number.isFinite(value) ? value : Date.now();
        }

        function elapsedClock() {
            return typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() : Date.now();
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
        }

        function offerConfigSnapshot(signature, configDelta) {
            if (typeof signature !== 'string' || !signature
                || configDelta?.complete !== true
                || !Array.isArray(configDelta.changedKeys)
                || !configDelta.changedKeys.length) return null;
            for (let index = 0; index < configDelta.changedKeys.length; index += 1) {
                if (configDelta.changedKeys[index] !== 'audioflix') return null;
            }
            // Strings and copied scalar metadata are the entire receipt. No live config or
            // delta references survive, and parsing stays outside the mutation event path.
            const token = Object.freeze({});
            receipts.set(token, Object.freeze({ signature, epoch, sequence: ++sequence }));
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
                const configParts = checkedParts(helper.splitObject(pendingReceipt.signature));
                const audioflixJson = configParts.has('audioflix') ? configParts.get('audioflix') : 'null';
                const detachedAudioflix = JSON.parse(audioflixJson);
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

        function stats() {
            return Object.freeze({
                ...counts,
                fullCauses: Object.freeze({ ...fullCauses }),
                timings: Object.freeze({ ...timings }),
                fullAuditAt,
                capturedAt: snapshot?.capturedAt ?? null,
                pending: !!pendingReceipt,
                fullRequired: !!fullReason,
                complete: !!complete()
            });
        }

        return Object.freeze({ capture, invalidate, offerConfigSnapshot, stats });
    }

    window.EveModularCaptureCache = Object.freeze({ create });
})();
