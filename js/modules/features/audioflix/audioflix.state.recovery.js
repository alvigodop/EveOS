/**
 * Guarded persistence for the Audioflix library.
 *
 * The fallback store used to read with `JSON.parse(...) catch { return {} }`. That single line turns
 * any damaged blob -- a write truncated by a full quota, a tab killed mid-save, anything -- into an
 * apparently EMPTY library. Nothing is obviously wrong at that point; the app simply shows no songs.
 * The kill comes next: the first ordinary save then serialises that empty state straight over the
 * damaged-but-still-present original, and the only copy is gone for good.
 *
 * Two rules here, both aimed at the same thing -- never destroy what cannot be rebuilt:
 *
 *   1. Unreadable data is quarantined, not discarded. The raw text is copied aside before anything
 *      is allowed to overwrite the slot, so a bad parse is recoverable by hand afterwards.
 *   2. Empty never overwrites non-empty by accident. Clearing the library is a legitimate thing to
 *      do, but it has to be asked for, not arrived at by way of a failed read.
 */
window.EveAudioflixStateRecovery = window.EveAudioflixStateRecovery || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixStateRecovery;
    if (ns.ready) return;

    const QUARANTINE_SUFFIX = '.corrupt';

    /** Rough size of a library: every array in the state, added up. Schema-agnostic on purpose. */
    function countEntries(state) {
        if (!state || typeof state !== 'object') return 0;
        return Object.values(state)
            .reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0);
    }

    /** Copy unreadable text aside so a later write cannot be the thing that loses it. */
    function quarantine(key, raw) {
        if (!raw) return null;
        const slot = `${key}${QUARANTINE_SUFFIX}`;
        try {
            // One slot, deliberately. A per-timestamp key would pile up copies of a large blob and
            // push the very quota that probably caused the damage in the first place.
            localStorage.setItem(slot, raw);
            console.warn(`[Audioflix] Unreadable library data preserved at "${slot}" —`
                + ' it was NOT deleted. Recover it before saving over the library.');
            return slot;
        } catch (error) {
            // Even the copy failed, so almost certainly a full quota. Say so loudly and let read()
            // report damaged: the write guard below is then the only thing standing between the
            // user and a silent wipe, and it will hold.
            console.error('[Audioflix] Could not preserve unreadable library data:', error);
            return null;
        }
    }

    /**
     * Read the store. Returns { state, damaged, quarantinedAt }.
     * `damaged` distinguishes "genuinely empty" from "could not be read" -- the caller must not
     * treat the second as the first.
     */
    function read(key) {
        let raw = null;
        try {
            raw = localStorage.getItem(key);
        } catch (error) {
            return { state: {}, damaged: true, quarantinedAt: null };
        }
        if (!raw) return { state: {}, damaged: false, quarantinedAt: null };
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return { state: parsed, damaged: false, quarantinedAt: null };
            }
        } catch (error) {
            // fall through to quarantine
        }
        return { state: {}, damaged: true, quarantinedAt: quarantine(key, raw) };
    }

    /**
     * Write, unless doing so would silently destroy a library.
     * Pass { allowEmpty: true } for a deliberate clear. Returns { written, reason }.
     */
    function write(key, state, options = {}) {
        const incoming = countEntries(state);
        if (incoming === 0 && options.allowEmpty !== true) {
            const existing = read(key);
            if (existing.damaged) {
                return { written: false, reason: 'stored data is unreadable; refusing to overwrite it' };
            }
            if (countEntries(existing.state) > 0) {
                console.warn('[Audioflix] Refused to save an empty library over'
                    + ` ${countEntries(existing.state)} stored entries. Nothing was lost.`);
                return { written: false, reason: 'empty state would have replaced stored entries' };
            }
        }
        try {
            localStorage.setItem(key, JSON.stringify(state));
            return { written: true, reason: '' };
        } catch (error) {
            console.warn('[Audioflix] library write failed:', error);
            return { written: false, reason: String(error && error.message || error) };
        }
    }

    Object.assign(ns, { ready: true, read, write, countEntries, QUARANTINE_SUFFIX });
})();
