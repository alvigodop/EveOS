// --- Modular State Sync Worker-Assisted Section Hashing ---
(function () {
    'use strict';

    function workerMain() {
        const VOLATILE_KEYS = new Set(['date', 'generatedAt', 'lastUpdated']);
        const TAG = Object.freeze({
            object: 65536, objectEnd: 65537, array: 65538, arrayEnd: 65539,
            string: 65540, stringEnd: 65541, number: 65542, numberEnd: 65543,
            true: 65544, false: 65545, null: 65546
        });
        const decoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
        let sectionCache = new Map();

        class TokenHash {
            constructor() {
                this.first = 2166136261;
                this.second = 5381;
            }
            add(code) {
                this.first = Math.imul(this.first ^ code, 16777619);
                this.second = ((this.second << 5) + this.second) ^ code;
            }
            string(value) {
                this.add(TAG.string);
                for (let index = 0; index < value.length; index += 1) this.add(value.charCodeAt(index));
                this.add(TAG.stringEnd);
            }
            finish() {
                return 'sections-v1:' + (this.first >>> 0).toString(16).padStart(8, '0')
                    + (this.second >>> 0).toString(16).padStart(8, '0');
            }
        }

        function hashParsedValue(value, hash) {
            const stack = [];
            let current = value;
            let pending = true;
            while (pending) {
                if (current === null) hash.add(TAG.null);
                else if (typeof current === 'string') hash.string(current);
                else if (typeof current === 'number') {
                    hash.add(TAG.number);
                    const number = String(current);
                    for (let index = 0; index < number.length; index += 1) hash.add(number.charCodeAt(index));
                    hash.add(TAG.numberEnd);
                } else if (typeof current === 'boolean') hash.add(current ? TAG.true : TAG.false);
                else {
                    const array = Array.isArray(current);
                    hash.add(array ? TAG.array : TAG.object);
                    stack.push({ value: current, index: 0, keys: array ? null : Object.keys(current) });
                }
                pending = false;
                while (stack.length) {
                    const frame = stack[stack.length - 1];
                    if (frame.keys === null) {
                        if (frame.index < frame.value.length) {
                            current = frame.value[frame.index++];
                            pending = true;
                        }
                    } else {
                        while (frame.index < frame.keys.length) {
                            const key = frame.keys[frame.index++];
                            if (VOLATILE_KEYS.has(key)) continue;
                            hash.string(key);
                            current = frame.value[key];
                            pending = true;
                            break;
                        }
                    }
                    if (pending) break;
                    hash.add(frame.keys === null ? TAG.arrayEnd : TAG.objectEnd);
                    stack.pop();
                }
            }
        }

        function hashValue(value) {
            const hash = new TokenHash();
            hashParsedValue(value, hash);
            return hash.finish();
        }

        function hashSection(json, include) {
            if (typeof json !== 'string') throw new TypeError('Snapshot JSON must be a string');
            const value = JSON.parse(json);
            return include ? hashValue(value) : '';
        }

        function decodeSection(value) {
            if (typeof value === 'string') return value;
            if (!decoder) throw new TypeError('TextDecoder unavailable in modular capture worker');
            if (value instanceof ArrayBuffer) return decoder.decode(new Uint8Array(value));
            if (ArrayBuffer.isView(value)) {
                return decoder.decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
            }
            throw new TypeError('Snapshot section must be JSON text or owned bytes');
        }

        function hashEntries(entries) {
            if (!Array.isArray(entries)) throw new TypeError('Snapshot parts must be entries');
            const parts = new Map(entries.map(([key, value]) => [key, decodeSection(value)]));
            if (parts.size !== entries.length) throw new TypeError('Snapshot keys must be unique');
            const keys = Array.from(parts.keys());
            if (keys.some((key) => typeof key !== 'string')) throw new TypeError('Snapshot keys must be strings');
            keys.sort();
            const hash = new TokenHash();
            const nextCache = new Map();
            hash.add(TAG.object);
            for (const key of keys) {
                const json = parts.get(key);
                const include = !VOLATILE_KEYS.has(key);
                let cached = sectionCache.get(key);
                if (!cached || cached.json !== json) cached = { json, digest: hashSection(json, include) };
                nextCache.set(key, cached);
                if (include) {
                    hash.string(key);
                    hash.string(cached.digest);
                }
            }
            hash.add(TAG.objectEnd);
            sectionCache = nextCache;
            return hash.finish();
        }

        self.onmessage = function (event) {
            const message = event?.data || {};
            if (message.type !== 'hash-parts') return;
            try {
                self.postMessage({ id: message.id, ok: true, hash: hashEntries(message.entries) });
            } catch (error) {
                self.postMessage({ id: message.id, ok: false, error: String(error?.message || error) });
            }
        };
    }

    const workerSource = () => `;(${workerMain.toString()})();`;

    function create(options = {}) {
        const codec = options.codec || window.EveModularCaptureCodec;
        const WorkerCtor = Object.prototype.hasOwnProperty.call(options, 'WorkerCtor') ? options.WorkerCtor : window.Worker;
        const BlobCtor = Object.prototype.hasOwnProperty.call(options, 'BlobCtor') ? options.BlobCtor : window.Blob;
        const URLApi = Object.prototype.hasOwnProperty.call(options, 'URLApi') ? options.URLApi : window.URL;
        const TextEncoderCtor = Object.prototype.hasOwnProperty.call(options, 'TextEncoderCtor')
            ? options.TextEncoderCtor : window.TextEncoder;
        const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 30000);
        const setTimer = options.setTimer || (typeof window.setTimeout === 'function'
            ? window.setTimeout.bind(window) : (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : null));
        const clearTimer = options.clearTimer || (typeof window.clearTimeout === 'function'
            ? window.clearTimeout.bind(window) : (typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout.bind(globalThis) : null));
        const customFactory = typeof options.workerFactory === 'function' ? options.workerFactory : null;
        let worker = null;
        let workerUrl = '';
        let nextId = 0;
        let generation = 0;
        let preparing = 0;
        const pending = new Map();
        const counters = {
            jobs: 0,
            completed: 0,
            failures: 0,
            restarts: 0,
            fallbacks: 0,
            transferredBytes: 0,
            stringCloneJobs: 0,
            cooperativeJobs: 0
        };
        let mode = 'uninitialized';

        function releaseWorkerUrl() {
            if (!workerUrl || typeof URLApi?.revokeObjectURL !== 'function') return;
            try { URLApi.revokeObjectURL(workerUrl); } catch {}
            workerUrl = '';
        }

        function rejectPending(reason) {
            for (const job of pending.values()) {
                if (clearTimer) clearTimer(job.timer);
                job.reject(reason);
            }
            pending.clear();
        }

        function reset(reason, reject = true) {
            generation += 1;
            if (worker) {
                try { worker.terminate?.(); } catch {}
                worker = null;
            }
            releaseWorkerUrl();
            if (reject && pending.size) rejectPending(reason || new Error('Modular capture worker reset'));
        }

        function failWorker(error) {
            counters.failures += 1;
            counters.restarts += 1;
            const reason = error instanceof Error ? error : new Error(String(error?.message || error || 'Worker failed'));
            reset(reason, true);
            mode = 'restart-pending';
        }

        function bindWorker(next) {
            next.onmessage = function (event) {
                const message = event?.data || {};
                const job = pending.get(message.id);
                if (!job) return;
                pending.delete(message.id);
                if (clearTimer) clearTimer(job.timer);
                if (message.ok === true && typeof message.hash === 'string' && message.hash) {
                    counters.completed += 1;
                    job.resolve(message.hash);
                } else {
                    counters.failures += 1;
                    job.reject(new Error(String(message.error || 'Worker hash failed')));
                }
            };
            next.onerror = failWorker;
            next.onmessageerror = failWorker;
            return next;
        }

        function ensureWorker() {
            if (worker) return worker;
            try {
                if (customFactory) {
                    worker = bindWorker(customFactory(workerSource()));
                    mode = 'worker';
                    return worker;
                }
                if (typeof WorkerCtor !== 'function' || typeof BlobCtor !== 'function'
                    || typeof URLApi?.createObjectURL !== 'function') {
                    mode = 'inline';
                    return null;
                }
                workerUrl = URLApi.createObjectURL(new BlobCtor([workerSource()], { type: 'text/javascript' }));
                worker = bindWorker(new WorkerCtor(workerUrl, { name: 'eve-modular-capture-hash' }));
                mode = 'worker';
                return worker;
            } catch (error) {
                counters.failures += 1;
                reset(error, true);
                mode = 'inline';
                return null;
            }
        }

        function inlineHash(parts) {
            counters.fallbacks += 1;
            if (typeof codec?.hashParts !== 'function') return Promise.reject(new Error('Modular capture codec unavailable'));
            return Promise.resolve().then(() => codec.hashParts(parts));
        }

        async function wirePayload(entries) {
            if (typeof TextEncoderCtor !== 'function') {
                counters.stringCloneJobs += 1;
                return { entries, transfers: [] };
            }
            const encoder = new TextEncoderCtor();
            const transfers = [];
            const ownedEntries = [];
            const cooperative = typeof window.EveCooperativeWork?.encodeText === 'function';
            if (cooperative) counters.cooperativeJobs += 1;
            for (const [key, json] of entries) {
                const bytes = cooperative ? await window.EveCooperativeWork.encodeText(json, TextEncoderCtor)
                    : encoder.encode(json);
                transfers.push(bytes.buffer);
                ownedEntries.push([key, bytes.buffer]);
            }
            return { entries: ownedEntries, transfers, byteLength: transfers.reduce((total, part) => total + part.byteLength, 0) };
        }

        async function hashParts(parts) {
            if (!(parts instanceof Map)) return Promise.reject(new TypeError('Snapshot parts must be a Map'));
            const entries = Array.from(parts.entries());
            if (entries.some(([key, json]) => typeof key !== 'string' || typeof json !== 'string')) {
                return Promise.reject(new TypeError('Snapshot parts must contain string keys and JSON text'));
            }
            counters.jobs += 1;
            const active = ensureWorker();
            if (!active) return inlineHash(new Map(entries));
            const dispatchedGeneration = generation;
            let wire;
            preparing += 1;
            try { wire = await wirePayload(entries); }
            catch (error) { return Promise.reject(error); }
            finally { preparing -= 1; }
            if (generation !== dispatchedGeneration || worker !== active) throw new Error('Modular capture worker superseded during preparation');
            const id = ++nextId;
            return new Promise((resolve, reject) => {
                const timer = setTimer ? setTimer(() => {
                    const job = pending.get(id);
                    if (!job) return;
                    pending.delete(id);
                    counters.failures += 1;
                    counters.restarts += 1;
                    job.reject(new Error('Modular capture worker timed out'));
                    reset(new Error('Modular capture worker timed out'), true);
                    mode = 'restart-pending';
                }, timeoutMs) : null;
                pending.set(id, { resolve, reject, timer });
                try {
                    active.postMessage({ type: 'hash-parts', id, entries: wire.entries }, wire.transfers);
                    counters.transferredBytes += wire.byteLength || 0;
                }
                catch (error) {
                    pending.delete(id);
                    if (clearTimer) clearTimer(timer);
                    failWorker(error);
                    reject(error);
                }
            });
        }

        function destroy() {
            reset(new Error('Modular capture worker destroyed'), true);
            mode = 'destroyed';
        }

        function stats() {
            return Object.freeze({ ...counters, mode, inFlight: pending.size + preparing });
        }

        return Object.freeze({ hashParts, destroy, stats });
    }

    const defaultClient = create();
    window.EveModularCaptureWorker = Object.freeze({
        create,
        hashParts: (parts) => defaultClient.hashParts(parts),
        destroy: () => defaultClient.destroy(),
        stats: () => defaultClient.stats(),
        _sourceForTests: workerSource
    });

    window.addEventListener?.('pagehide', () => defaultClient.destroy(), { once: true });
})();
