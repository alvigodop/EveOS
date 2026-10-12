// Validated single-item state mutations. Bulk restore/import still uses full schema normalization.
window.EveAudioflixStateMutations = window.EveAudioflixStateMutations || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixStateMutations;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const { ensure, boundedItems, syncRootOrFallback, scheduleSave, text, soundboardLimit, storageKey, recovery, normalizeVolume } = deps;
        const library = window.EveAudioflixLibraryIndex;
        const pendingVolumes = new Map();
        const gestures = new WeakMap();
        let volumeGeneration = 0;
        const isGesture = value => value !== null && ['object', 'function'].includes(typeof value);
        function metric(name, method = 'increment', value = 1) {
            try { window.EveAudioflixDiagnostics?.[method]?.(name, value); } catch { /* Optional telemetry cannot alter mutations. */ }
        }
        function pendingMetric() { metric('state:volume-pending', 'gauge', pendingVolumes.size); }
        function volumeTarget(type, id, port = false) {
            const key = library.idKey(id);
            if (!key) return null;
            const state = ensure(), row = port ? null : library.get(state, type).getById(key);
            if (!port && !row) return null;
            return { key, state, row, type: type === 'music' ? 'music' : 'sound',
                token: `${port ? 'port' : type === 'music' ? 'music' : 'sound'}:${key}`, port, portMap: port ? state.portVolumes : null };
        }
        function validPending(pending, target) {
            return !pending.invalid && target && pending.state === target.state && pending.row === target.row
                && (!pending.port || (pending.portMap === target.portMap
                    && Object.prototype.hasOwnProperty.call(target.portMap || {}, target.key)))
                && (pending.port ? target.portMap[target.key] : target.row.volume) === pending.latest;
        }
        function override(target, gain) {
            const map = target.state.portVolumes || (target.state.portVolumes = {});
            Object.defineProperty(map, target.key, { value: gain, writable: true, enumerable: true, configurable: true });
        }
        function invalidateVolume(token, pending) {
            if (!pending) return;
            if (!pending.invalid) pending.phase = 'superseded';
            pendingVolumes.set(token, { invalid: true, generation: pending.generation });
        }
        function finalizedMatches(pending, target, value) {
            if (pending.phase !== 'finalized' || value === undefined || !target
                || pending.state !== target.state || pending.row !== target.row) return false;
            if (pending.port && pending.portMap !== target.portMap) return false;
            const live = pending.port
                ? normalizeVolume(target.portMap?.[target.key] ?? pending.original, 1) : target.row.volume;
            return live === pending.latest && normalizeVolume(value, 1) === pending.latest;
        }
        function preview(type, id, value, port = false, originalValue, gesture) {
            if (gesture !== undefined && !isGesture(gesture)) return false;
            const target = volumeTarget(type, id, port);
            const token = `${port ? 'port' : type === 'music' ? 'music' : 'sound'}:${library.idKey(id)}`;
            const prior = pendingVolumes.get(token);
            const bound = gesture === undefined ? null : gestures.get(gesture);
            if (bound && (bound.retired || bound.pending !== prior || bound.pending.phase !== 'active')) return false;
            if (!target || (prior && !validPending(prior, target))) {
                invalidateVolume(token, prior);
                pendingMetric(); return false;
            }
            let pending = pendingVolumes.get(target.token);
            if (!pending) {
                if (!pending && pendingVolumes.size >= 64) return false;
                const raw = port ? target.state.portVolumes?.[target.key] ?? originalValue : target.row.volume;
                pending = { ...target, phase: 'active', generation: ++volumeGeneration,
                    original: normalizeVolume(raw, 1), latest: normalizeVolume(raw, 1),
                    originalOverride: target.state.portVolumes?.[target.key],
                    hadOverride: Object.prototype.hasOwnProperty.call(target.state.portVolumes || {}, target.key) };
                pendingVolumes.set(target.token, pending);
            }
            if (gesture !== undefined && !bound) gestures.set(gesture, { pending, retired: false });
            pending.latest = normalizeVolume(value, 1);
            if (port) { override(target, pending.latest); pending.portMap = target.state.portVolumes; }
            else target.row.volume = pending.latest;
            metric('state:volume-preview-count'); pendingMetric();
            return true;
        }
        function commit(type, id, value, port = false, gesture) {
            if (gesture !== undefined && !isGesture(gesture)) return false;
            const token = `${port ? 'port' : type === 'music' ? 'music' : 'sound'}:${library.idKey(id)}`;
            const pending = pendingVolumes.get(token), target = volumeTarget(type, id, port);
            if (gesture !== undefined) {
                const bound = gestures.get(gesture);
                if (!bound || bound.retired || bound.pending.token !== token) return false;
                bound.retired = true;
                if (bound.pending !== pending) {
                    if (pending?.invalid && pending.generation === bound.pending.generation) {
                        pendingVolumes.delete(token); pendingMetric();
                    }
                    return finalizedMatches(bound.pending, target, value);
                }
            }
            pendingVolumes.delete(token); pendingMetric();
            if (!target || (pending && !validPending(pending, target))) {
                if (pending && !pending.invalid) pending.phase = 'superseded';
                return false;
            }
            const original = pending?.original ?? normalizeVolume(port ? target.state.portVolumes?.[target.key] : target.row.volume, 1);
            // One state-owned latest intent serves all controls; an older control's release
            // cannot rewind it. Opaque gesture generations fence its later sibling releases.
            const gain = normalizeVolume(pending?.latest ?? value ?? original, 1);
            if (!port) target.row.volume = gain;
            if (gain !== original) {
                override(target, gain); scheduleSave('audioflix-volume'); metric('state:volume-commit-count');
            } else if (port && pending) {
                if (pending.hadOverride) override(target, pending.originalOverride);
                else delete target.state.portVolumes[target.key];
            }
            if (pending) pending.phase = 'finalized';
            return true;
        }
        function setItemVolume(type, id, value) {
            const gain = normalizeVolume(value, 1), target = volumeTarget(type, id);
            if (target) {
                // Legacy durable calls preserve their save/override contract even for an unchanged value.
                invalidateVolume(target.token, pendingVolumes.get(target.token));
                invalidateVolume(`port:${target.key}`, pendingVolumes.get(`port:${target.key}`));
                pendingMetric(); target.row.volume = gain;
                override(target, gain); scheduleSave('audioflix-volume'); metric('state:volume-commit-count');
            } else {
                const port = volumeTarget(type, id, true);
                if (port) { invalidateVolume(port.token, pendingVolumes.get(port.token)); pendingMetric(); override(port, gain); scheduleSave('audioflix-volume'); }
            }
            return ensure();
        }
        async function persistTracked(work) {
            let finish;
            try { finish = window.EveAudioflixDiagnostics?.span?.('state:persist'); } catch { /* Optional telemetry only. */ }
            const end = error => { try { finish?.(error); } catch { /* Optional telemetry only. */ } };
            metric('state:persist-attempts');
            const state = ensure();
            metric('state:music-items', 'gauge', state.music?.length || 0);
            metric('state:sound-items', 'gauge', state.soundboard?.length || 0);
            try {
                const result = await work();
                if (result?.written !== true) metric('state:persist-errors');
                end(result?.written !== true); return result;
            } catch (error) { metric('state:persist-errors'); end(true); throw error; }
        }
        // Ephemeral folder membership only: replaced registries automatically invalidate their cache.
        const folderSets = new WeakMap();
        function registerFolder(state, item) {
            const folder = text(item.folder || item.card, '');
            if (!folder) return;
            const folders = state.musicFolders || (state.musicFolders = []);
            let cache = folderSets.get(folders);
            if (!cache || cache.length !== folders.length) {
                cache = { length: folders.length, values: new Set(folders) };
                folderSets.set(folders, cache);
            }
            if (cache.values.has(folder)) return;
            folders.push(folder);
            cache.values.add(folder);
            cache.length = folders.length;
        }

        function addItem(type, item) {
            const isMusic = type === 'music', kind = isMusic ? 'music' : 'sound';
            // Normalize and reject first: a bad field/source must not touch live state or schedule a save.
            const added = boundedItems([item], kind, soundboardLimit)[0];
            if (!added) return null;
            const state = ensure(), key = isMusic ? 'music' : 'soundboard';
            const items = state[key] || (state[key] = []);
            items.push(added);
            if (!isMusic && items.length > soundboardLimit) {
                for (const removed of items.splice(0, items.length - soundboardLimit)) library.remove(state, 'sound', removed.id);
            }
            recovery()?.applyTrackStructure?.(storageKey, state, added, kind);
            // Recovery may restore the new item's folder; register that final identity, not its raw input.
            if (isMusic) registerFolder(state, added);
            library.upsert(state, type, added);
            syncRootOrFallback(state);
            scheduleSave(`audioflix-add-${type}`);
            return added;
        }
        function cancelPendingVolumes() {
            for (const [key, pending] of pendingVolumes) invalidateVolume(key, pending);
            pendingMetric();
        }
        // Projection is serialization-only: live rows keep the audible preview while unrelated
        // saves/captures retain the committed baseline. At most 64 pending records are inspected.
        function durableProjection(source = ensure()) {
            if (!source || typeof source !== 'object' || !pendingVolumes.size) return source;
            const originals = { music: new Map(), soundboard: new Map() };
            let projected = source, ports;
            for (const [token, pending] of pendingVolumes) {
                if (pending.invalid || pending.state !== source) continue;
                const target = pending.port ? { ...pending, portMap: source.portVolumes }
                    : { ...pending, row: library.get(source, pending.type).getById(pending.key) };
                if (!validPending(pending, target)) { invalidateVolume(token, pending); continue; }
                if (projected === source) projected = { ...source };
                if (pending.port) {
                    ports ||= { ...(source.portVolumes || {}) };
                    if (pending.hadOverride) Object.defineProperty(ports, pending.key, {
                        value: pending.originalOverride, writable: true, enumerable: true, configurable: true });
                    else delete ports[pending.key];
                } else originals[pending.type === 'music' ? 'music' : 'soundboard'].set(pending.row, pending.original);
            }
            for (const key of ['music', 'soundboard']) if (originals[key].size) {
                projected[key] = source[key].map(row => originals[key].has(row) ? { ...row, volume: originals[key].get(row) } : row);
            }
            if (ports) projected.portVolumes = ports;
            return projected;
        }
        function durableSnapshot(source = ensure()) { return JSON.parse(JSON.stringify(durableProjection(source))); }
        function finalizePendingVolumes() {
            // pagehide is a final gesture boundary; release before the synchronous mirror write.
            for (const [token, pending] of [...pendingVolumes]) {
                // UI pagehide listeners run later. Preserve their rejection marker until that
                // late release retires it; otherwise an explicit old gain could adopt a new row.
                if (pending.invalid) continue;
                if (!validPending(pending, volumeTarget(pending.type, pending.key, pending.port))) {
                    invalidateVolume(token, pending); continue;
                }
                commit(pending.type, pending.key, pending.latest, pending.port);
            }
            pendingMetric();
        }
        return { addItem, setItemVolume, persistTracked, cancelPendingVolumes, registerFolder,
            durableProjection, durableSnapshot, finalizePendingVolumes,
            previewItemVolume: (type, id, value, gesture) => preview(type, id, value, false, undefined, gesture),
            commitItemVolume: (type, id, value, gesture) => commit(type, id, value, false, gesture),
            previewPortVolume: (id, value, original, gesture) => preview('sound', id, value, true, original, gesture),
            commitPortVolume: (id, value, gesture) => commit('sound', id, value, true, gesture) };
    };
    ns.ready = true;
})();
