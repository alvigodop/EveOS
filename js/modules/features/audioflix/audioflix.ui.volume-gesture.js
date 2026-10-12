window.EveAudioflixVolumeGesture = window.EveAudioflixVolumeGesture || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixVolumeGesture;
    if (ns.ready) return;
    const kind = item => ['sound', 'soundboard'].includes(item?.type) ? 'sound' : item?.type || 'music';
    const same = (a, b) => a && b && String(a.id ?? '') === String(b.id ?? '')
        && kind(a) === kind(b) && (a.ported === true) === (b.ported === true);
    const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
    const bindings = new Set();
    const release = () => { for (const binding of bindings) binding.release(); };
    const flush = () => { for (const binding of bindings) binding.flush(); };
    const playback = event => { for (const binding of bindings) binding.playback(event); };
    function globalListeners(attach) {
        const method = attach ? 'addEventListener' : 'removeEventListener';
        document[method]('pointerup', release, true);
        document[method]('pointercancel', release, true);
        window[method]('pagehide', flush);
        window[method]('eve:audioflix-playback', playback);
    }

    // Only gesture identity/value live here. Canonical values and dirty baselines belong to State.
    function create(root, selector, resolve, apply) {
        if (bindings.size >= 64) return null;
        const entries = new WeakMap(), pending = new Set();
        let destroyed = false;
        const abort = new AbortController();
        const listen = (name, callback) => root.addEventListener(name, callback, { capture: true, signal: abort.signal });
        const target = event => event.target?.matches?.(selector) ? event.target : null;
        function commit(entry) {
            clearTimeout(entry.timer);
            entry.timer = 0;
            if (!entry.dirty && !entry.rejected) return;
            entry.dirty = false;
            const state = window.EveAudioflixState;
            const method = entry.item.ported ? state?.commitPortVolume : state?.commitItemVolume;
            if (typeof method === 'function') {
                const value = entry.rejected ? undefined : entry.value;
                if (entry.item.ported) method.call(state, entry.item.id, value, entry);
                else method.call(state, entry.item.type, entry.item.id, value, entry);
            } else if (!entry.legacySaved && !entry.rejected) state?.setItemVolume?.(entry.item.type, entry.item.id, entry.value);
            entry.rejected = false;
        }
        function finish(entry, block = false) {
            if (!entry) return;
            commit(entry);
            if (block && entry.pointer) entry.blocked = true;
            else { pending.delete(entry); entries.delete(entry.element); }
        }
        function begin(element, mode) {
            if (destroyed) return null;
            const existing = entries.get(element);
            if (existing?.pointer) return existing;
            if (existing && mode !== 'pointer') return existing;
            finish(existing);
            const item = resolve(element);
            if (item?.id === null || item?.id === undefined) return null;
            const entry = { element, item: { ...item, type: item.type || 'music' }, pointer: mode === 'pointer', keyboard: mode === 'keyboard',
                value: clamp(element.value), dirty: false, blocked: false, timer: 0, legacySaved: false };
            entries.set(element, entry);
            pending.add(entry);
            return entry;
        }
        function input(element) {
            const entry = entries.get(element) || begin(element, 'keyboard');
            if (!entry || entry.blocked) return false;
            if (!same(entry.item, resolve(element))) { finish(entry, true); return false; }
            const value = clamp(element.value), state = window.EveAudioflixState;
            const preview = entry.item.ported ? state?.previewPortVolume : state?.previewItemVolume;
            if (typeof preview === 'function') {
                const accepted = entry.item.ported
                    ? preview.call(state, entry.item.id, value, entry.item.volume, entry)
                    : preview.call(state, entry.item.type, entry.item.id, value, entry);
                if (accepted === false) { entry.rejected = true; finish(entry, true); return false; }
            } else {
                state?.setItemVolume?.(entry.item.type, entry.item.id, value);
                entry.legacySaved = true;
            }
            entry.value = value;
            entry.dirty = true;
            apply(value, { persist: false, itemId: entry.item.id, type: entry.item.type, ported: entry.item.ported === true });
            clearTimeout(entry.timer);
            if (!entry.pointer) entry.timer = setTimeout(() => finish(entry), 180);
            return true;
        }
        function flush() { for (const entry of [...pending]) finish(entry, true); }
        function rebind(element, item) {
            const entry = entries.get(element);
            if (entry && !same(entry.item, item)) finish(entry, true);
        }
        listen('pointerdown', event => { const element = target(event); if (element) begin(element, 'pointer'); });
        listen('keydown', event => {
            const element = target(event);
            if (element && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) begin(element, 'keyboard');
        });
        listen('change', event => {
            const entry = entries.get(target(event));
            if (entry && !entry.keyboard) finish(entry, true);
        });
        listen('focusout', event => finish(entries.get(target(event)), true));
        listen('click', event => {
            const action = event.target?.closest?.('[data-af-action],[data-url-player-action]');
            if (action) flush();
        });
        const binding = {
            input, flush, rebind,
            // Cancellation commits the last accepted preview; it never reverts user gain.
            release() { for (const entry of [...pending]) if (entry.pointer) finish(entry); },
            playback(event) {
                for (const entry of [...pending]) {
                    const stopped = ['stopped', 'ended', 'idle'].includes(String(event.detail?.status || '').toLowerCase())
                        && String(event.detail?.item?.id ?? '') === String(entry.item.id);
                    if (stopped || !same(entry.item, resolve(entry.element))) finish(entry, true);
                }
            },
            diagnostics() { return { pending: pending.size, timers: [...pending].filter(entry => entry.timer).length }; },
            destroy() {
                if (destroyed) return;
                destroyed = true;
                for (const entry of [...pending]) finish(entry);
                abort.abort();
                bindings.delete(binding);
                if (!bindings.size) globalListeners(false);
            }
        };
        if (!bindings.size) globalListeners(true);
        bindings.add(binding);
        return binding;
    }
    function diagnostics() {
        const resources = [...bindings].map(binding => binding.diagnostics());
        return { bindings: bindings.size, globalListeners: bindings.size ? 4 : 0,
            pending: resources.reduce((sum, row) => sum + row.pending, 0),
            timers: resources.reduce((sum, row) => sum + row.timers, 0) };
    }
    Object.assign(ns, { ready: true, create, diagnostics });
})();
