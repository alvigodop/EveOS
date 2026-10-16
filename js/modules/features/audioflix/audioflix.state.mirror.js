// Large, independently recoverable AudioFlix metadata. Legacy localStorage copies stay intact.
(function () {
    'use strict';
    if (window.EveAudioflixRecoveryMirror) return;
    const caches = new Map(), flights = new Map(), writes = new Map();
    const keyFor = key => `audioflix-recovery-v1:${key}`;
    const structureKey = key => `${keyFor(key)}:structure`;
    const revision = state => Math.max(0, Number(state?.durabilityRevision) || 0);
    const updated = state => Math.max(0, Number(state?.durabilityUpdatedAt) || 0);
    const valid = value => value && typeof value === 'object' && !Array.isArray(value);
    const failure = (kind, reason) => ({ written: false, kind, reason });
    const yieldTask = () => window.EveCooperativeWork?.yieldTask?.() || Promise.resolve();
    const clock = () => window.performance?.now?.() ?? Date.now();
    const current = options => typeof options.isCurrent !== 'function' || options.isCurrent();
    const peek = key => caches.get(key) || null;
    const needs = (key, state) => (state?.music?.length || 0) > 2000 || !!peek(key)?.present;

    async function decode(envelope) {
        if (envelope === undefined || envelope === null) return null;
        if (envelope.format !== 1 || typeof envelope.body?.text !== 'function') throw new Error('Unreadable recovery envelope');
        const state = JSON.parse(await envelope.body.text());
        if (!valid(state) || revision(state) !== envelope.revision) throw new Error('Invalid recovery generation');
        return state;
    }

    async function load(key) {
        if (caches.has(key)) return caches.get(key);
        if (flights.has(key)) return flights.get(key);
        const work = (async () => {
            const store = window.IDBStore;
            if (!store?.get || !store?.setIf) return { state: null, structure: null, damaged: false, unavailable: true };
            try {
                await store.init();
                const [full, journal] = await Promise.all([store.get(keyFor(key)), store.get(structureKey(key))]);
                if (store.isAvailable?.() === false) throw new Error('IndexedDB recovery read failed');
                let state = null, structure = null, damaged = false;
                try { state = await decode(full); } catch { damaged = true; }
                try { structure = await decode(journal); } catch { damaged = true; }
                const value = { state, structure, damaged, present: full != null || journal != null };
                caches.set(key, value);
                return value;
            } catch (error) {
                return { state: null, structure: null, damaged: false, unavailable: true, reason: String(error?.message || error) };
            }
        })();
        flights.set(key, work);
        try { return await work; } finally { flights.delete(key); }
    }

    // Item-sized serialization yields between bounded records, never a structured clone of
    // the entire live library. The owner must fence every awaited boundary before committing.
    async function ownedJson(state, options) {
        const fields = [], owned = Object.create(null);
        let mark = clock();
        for (const key of Object.keys(state)) {
            const value = state[key];
            let json;
            if (Array.isArray(value)) {
                const rows = [], items = [];
                for (const item of value) {
                    const row = JSON.stringify(item) ?? 'null';
                    rows.push(row);
                    items.push(JSON.parse(row));
                    if (clock() - mark >= 8) {
                        await yieldTask();
                        if (!current(options)) throw new Error('Recovery capture superseded');
                        mark = clock();
                    }
                }
                json = `[${rows.join(',')}]`;
                owned[key] = items;
            } else {
                json = JSON.stringify(value);
                if (json !== undefined) owned[key] = JSON.parse(json);
            }
            if (json !== undefined) fields.push(`${JSON.stringify(key)}:${json}`);
            if (!current(options)) throw new Error('Recovery capture superseded');
        }
        const json = `{${fields.join(',')}}`;
        const body = window.EveCooperativeWork?.jsonBody
            ? await window.EveCooperativeWork.jsonBody(json) : new Blob([json], { type: 'application/json' });
        if (!current(options)) throw new Error('Recovery capture superseded');
        return { json, body, value: owned };
    }

    function accepts(previous, envelope, options) {
        if (!previous) return true;
        if (previous.format !== 1) return options.allowDestructive === true;
        // Even authoritative replacement must not defeat a newer cross-tab revision.
        if (previous.revision > envelope.revision) return false;
        if (previous.revision === envelope.revision && previous.updated > envelope.updated) return false;
        if (options.allowEmpty !== true && previous.count > 0 && envelope.count === 0) return false;
        if (options.allowDestructive !== true && previous.revision === envelope.revision && previous.count > envelope.count) return false;
        return true;
    }

    async function performWrite(key, state, options) {
        const store = window.IDBStore, guard = window.EveAudioflixStateRecovery;
        if (!store?.setIf || !guard) return failure('storage', 'IndexedDB recovery backend unavailable');
        const old = await load(key);
        if (!current(options)) return failure('superseded', 'Recovery generation changed');
        if (old.unavailable) return failure('storage', old.reason || 'IndexedDB recovery unavailable');
        if (old.damaged && options.allowDestructive !== true) return failure('guard', 'Unreadable recovery data preserved; explicit repair is required');
        const rejected = guard.validateWrite(state, { state: old.state || {}, damaged: old.damaged }, options);
        if (rejected) return rejected;
        const legacy = guard.read(key);
        const legacyRejected = guard.validateWrite(state, legacy, options);
        if (legacyRejected) return legacyRejected;
        try {
            const captured = await ownedJson(state, options);
            const structure = guard.captureStructure(captured.value);
            const journal = await ownedJson(structure, options);
            const envelope = body => ({ format: 1, revision: revision(state), updated: updated(state),
                count: guard.countEntries(state), body });
            const full = envelope(captured.body), structural = envelope(journal.body);
            const savedStructure = await store.setIf(structureKey(key), structural,
                previous => current(options) && accepts(previous, structural, options));
            if (!current(options)) return failure('superseded', 'Recovery generation changed');
            let accepted = true;
            const saved = await store.setIf(keyFor(key), full,
                previous => { accepted = current(options) && accepts(previous, full, options); return accepted; },
                options.allowDestructive === true ? { backupKey: `${keyFor(key)}:previous` } : {});
            if (!saved) return failure(accepted ? 'storage' : (current(options) ? 'guard' : 'superseded'),
                accepted ? 'Recovery transaction aborted' : 'Newer recovery state rejected this write');
            // Owned decoded values, never the mutable state supplied by the caller.
            caches.set(key, { state: captured.value, structure: savedStructure ? journal.value : old.structure,
                damaged: false, present: true });
            return { written: true, kind: 'indexeddb', reason: '', structureWritten: savedStructure };
        } catch (error) {
            return failure(current(options) ? 'storage' : 'superseded', String(error?.message || error));
        }
    }

    function write(key, state, options = {}) {
        // Public callers without an owner fence must detach before the first await.
        const input = typeof options.isCurrent === 'function' ? state : JSON.parse(JSON.stringify(state));
        const previous = writes.get(key) || Promise.resolve();
        const next = previous.catch(() => {}).then(() => performWrite(key, input, options));
        writes.set(key, next);
        const cleanup = () => { if (writes.get(key) === next) writes.delete(key); };
        void next.then(cleanup, cleanup);
        return next;
    }

    async function restoreConfig(config, key = 'eveAudioflixFallbackState') {
        const initial = config?.audioflix;
        const initialRevision = revision(initial), initialTime = updated(initial);
        const stateRevision = window.EveAudioflixState?.getRevision?.();
        const result = await load(key);
        if (!valid(config) || config.audioflix !== initial || revision(config.audioflix) !== initialRevision
            || updated(config.audioflix) !== initialTime || window.EveAudioflixState?.getRevision?.() !== stateRevision) {
            return { restored: false, reason: 'Local state changed while recovery loaded' };
        }
        if (!result.state) return { restored: false, reason: result.damaged ? 'Recovery data unreadable' : '' };
        const preferred = window.EveAudioflixStateRecovery?.prefer?.(initial, result.state, key);
        if (preferred === result.state) config.audioflix = JSON.parse(JSON.stringify(result.state));
        return { restored: preferred === result.state, reason: '' };
    }

    function protectPendingClose(state, hasUnmirrored, key = 'eveAudioflixFallbackState') {
        window.addEventListener('beforeunload', event => {
            if (needs(key, state()) && hasUnmirrored()) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
    }

    function createWriter(deps) {
        return (state, options) => {
            if (!needs(deps.key, state)) {
                const local = deps.fallbackWrite(state);
                if (local.written || local.kind !== 'storage') return local;
            }
            const intent = deps.intent(state), projectionDone = deps.span('state:persist:projection');
            const durable = deps.project(state);
            projectionDone?.(false);
            const done = deps.span('state:persist:mirror');
            return write(deps.key, durable, { ...intent?.options, ...options }).then(result => {
                done?.(result?.written !== true);
                if (result.written) deps.accepted(state, intent);
                if (!result.written && result.kind === 'storage') return deps.fallbackWrite(state, intent?.options);
                return result;
            });
        };
    }

    window.EveAudioflixRecoveryMirror = Object.freeze({ load, peek, needs, write, restoreConfig, protectPendingClose, createWriter });
})();
