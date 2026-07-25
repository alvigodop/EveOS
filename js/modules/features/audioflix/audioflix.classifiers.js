// Classifiers for the Audioflix music library — a standalone way to slice the library that is
// deliberately separate from artist/folder/group metadata.
//
// Two kinds:
//   AUTOMATIC — derived from facts about the track that the user cannot edit, so they need no
//               storage and can never go stale:
//                 * duration  — the time filter, bucketed by the :36 "around N min" rule.
//                 * grouprank — songs ordered by how many groups they belong to (most first, the
//                               unGrouped last), i.e. a ranked listing of the library.
//   MANUAL    — user-defined labels ("English only", "mid artist", ...) attached per track from the
//               track's settings panel. The registry of names lives in state.musicClassifiers; the
//               membership lives on each track's `classifiers` array.
//
// Everything here is pure query/mutation logic (no DOM) so the manager UI, the frontend pill row and
// the Nexus Audio Link panel all read the same numbers.
window.EveAudioflixClassifiers = window.EveAudioflixClassifiers || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixClassifiers;
    if (ns.ready) return;

    const S = () => window.EveAudioflixState;
    const state = () => S()?.ensure?.() || {};
    const text = (v) => String(v ?? '').trim();
    const musicItems = () => state().music || [];
    const groupsOf = (id) => (state().musicGroupMap || {})[id] || [];
    const nexus = () => window.EveAudioflixNexus;

    // ---- automatic: duration (the time filter) -------------------------------------------------
    // Uses the shared :36 roll-up so "around 3" means 3:00-3:36 and 3:38 tips into "around 4".
    function durationBuckets(list) {
        const items = list || musicItems();
        const X = nexus();
        const byMin = new Map();
        items.forEach((it) => {
            const mn = X?.aroundMinute ? X.aroundMinute(it.duration) : null;
            if (mn == null) return;
            if (!byMin.has(mn)) byMin.set(mn, []);
            byMin.get(mn).push(it);
        });
        return [...byMin.entries()].sort((a, b) => a[0] - b[0])
            .map(([min, tracks]) => ({ key: `around:${min}`, label: `~${min} min`, min, tracks }));
    }

    // ---- automatic: group rank -----------------------------------------------------------------
    // Ranked listing: most-grouped song first, songs with no group last.
    function groupRanking(list) {
        const items = list || musicItems();
        return items
            .map((it) => ({ track: it, groups: groupsOf(it.id).length }))
            .sort((a, b) => b.groups - a.groups || String(a.track.title).localeCompare(String(b.track.title)))
            .map((entry, index) => ({ rank: index + 1, track: entry.track, groups: entry.groups }));
    }
    // Buckets for the rank classifier so it can be browsed/selected like any other classifier.
    function rankBuckets(list) {
        const ranked = groupRanking(list);
        const byCount = new Map();
        ranked.forEach((r) => {
            if (!byCount.has(r.groups)) byCount.set(r.groups, []);
            byCount.get(r.groups).push(r.track);
        });
        return [...byCount.entries()].sort((a, b) => b[0] - a[0]).map(([groups, tracks]) => ({
            key: `rank:${groups}`,
            label: groups === 0 ? 'No groups' : `${groups} group${groups === 1 ? '' : 's'}`,
            groups,
            tracks
        }));
    }

    // ---- manual ---------------------------------------------------------------------------------
    const manualNames = () => (state().musicClassifiers || []).map((n) => text(n)).filter(Boolean);

    function addManual(name) {
        const clean = text(name);
        if (!clean) return { ok: false, reason: 'Give the classifier a name.' };
        const current = manualNames();
        if (current.some((n) => n.toLowerCase() === clean.toLowerCase())) return { ok: false, reason: 'That classifier already exists.' };
        S()?.update?.({ musicClassifiers: [...current, clean].slice(0, 200) }, 'audioflix-classifier-add');
        return { ok: true, name: clean };
    }

    // Removing a definition also detaches it from every track, so no orphan labels linger.
    function removeManual(name) {
        const clean = text(name);
        if (!clean) return { ok: false };
        S()?.update?.({ musicClassifiers: manualNames().filter((n) => n !== clean) }, 'audioflix-classifier-remove');
        musicItems().forEach((it) => {
            const own = (it.classifiers || []).map(text);
            if (own.includes(clean)) S()?.updateItem?.('music', it.id, { classifiers: own.filter((n) => n !== clean) });
        });
        return { ok: true };
    }

    function renameManual(oldName, newName) {
        const from = text(oldName), to = text(newName);
        if (!from || !to || from === to) return { ok: false };
        const names = manualNames();
        if (!names.includes(from)) return { ok: false, reason: 'Unknown classifier.' };
        // Exclude the classifier being renamed from the taken-check, or fixing its capitalization
        // ("mid artist" -> "Mid Artist") would collide with itself and be rejected.
        if (names.some((n) => n !== from && n.toLowerCase() === to.toLowerCase())) return { ok: false, reason: 'That name is taken.' };
        S()?.update?.({ musicClassifiers: names.map((n) => (n === from ? to : n)) }, 'audioflix-classifier-rename');
        musicItems().forEach((it) => {
            const own = (it.classifiers || []).map(text);
            if (own.includes(from)) S()?.updateItem?.('music', it.id, { classifiers: [...new Set(own.map((n) => (n === from ? to : n)))] });
        });
        return { ok: true };
    }

    // Attach/detach a manual classifier on one track (auto-registers an unknown name).
    function toggleOnTrack(trackId, name, on) {
        const clean = text(name);
        const track = musicItems().find((it) => it.id === trackId);
        if (!track || !clean) return { ok: false };
        if (!manualNames().some((n) => n.toLowerCase() === clean.toLowerCase())) addManual(clean);
        const own = new Set((track.classifiers || []).map(text).filter(Boolean));
        const shouldHave = on === undefined ? !own.has(clean) : !!on;
        if (shouldHave) own.add(clean); else own.delete(clean);
        S()?.updateItem?.('music', trackId, { classifiers: [...own] });
        return { ok: true, attached: shouldHave };
    }

    const manualTracks = (name) => musicItems().filter((it) => (it.classifiers || []).map(text).includes(text(name)));

    // ---- shared views ---------------------------------------------------------------------------
    // Manager overview: one row per classifier with its kind and how many songs it covers.
    function overview() {
        const items = musicItems();
        const dur = durationBuckets(items);
        const ranks = rankBuckets(items);
        const auto = [
            {
                id: 'auto:duration', kind: 'auto', label: '⏱ Time Filter (duration)',
                count: dur.reduce((n, b) => n + b.tracks.length, 0),
                buckets: dur.length,
                note: `${dur.length} time bucket${dur.length === 1 ? '' : 's'} · songs with a known length`
            },
            {
                id: 'auto:grouprank', kind: 'auto', label: '🏆 Group Rank',
                count: items.length,
                buckets: ranks.length,
                note: 'ordered by how many groups a song is in (most first, ungrouped last)'
            }
        ];
        const manual = manualNames().map((name) => ({
            id: `manual:${name}`, kind: 'manual', label: name,
            count: manualTracks(name).length, buckets: 0,
            note: 'manual label — attach it from a track’s settings panel'
        }));
        return { auto, manual, totalTracks: items.length };
    }

    // Manager detail for one classifier: the buckets (auto) or the member songs (manual).
    function detail(id) {
        const clean = text(id);
        if (clean === 'auto:duration') return { kind: 'auto', label: '⏱ Time Filter (duration)', buckets: durationBuckets() };
        if (clean === 'auto:grouprank') return { kind: 'auto', label: '🏆 Group Rank', buckets: rankBuckets(), ranked: groupRanking().slice(0, 50) };
        if (clean.startsWith('manual:')) {
            const name = clean.slice(7);
            return { kind: 'manual', label: name, buckets: [{ key: clean, label: name, tracks: manualTracks(name) }] };
        }
        return null;
    }

    // Selectable entries for the frontend pill row and the Nexus panel: [key, tracks, label].
    // Keys are namespaced `class:` so the existing group selector can treat them like a group.
    function selectableEntries(list) {
        const items = list || musicItems();
        const out = [];
        durationBuckets(items).forEach((b) => out.push([`class:auto:${b.key}`, b.tracks, `⏱ ${b.label}`]));
        rankBuckets(items).forEach((b) => out.push([`class:auto:${b.key}`, b.tracks, `🏆 ${b.label}`]));
        manualNames().forEach((name) => {
            const tracks = items.filter((it) => (it.classifiers || []).map(text).includes(name));
            if (tracks.length) out.push([`class:manual:${name}`, tracks, `🏷 ${name}`]);
        });
        return out;
    }

    // Resolve a `class:...` key back to its tracks (used when a pill is the active selection).
    function tracksForKey(key, list) {
        const entry = selectableEntries(list).find(([k]) => k === text(key));
        return entry ? entry[1] : [];
    }

    // Every classifier a single track belongs to — manual labels plus its automatic memberships.
    // Shown in the track settings panel so the automatic ones are visible but clearly not editable.
    function classifiersForTrack(track) {
        if (!track) return { manual: [], auto: [] };
        const X = nexus();
        const auto = [];
        const mn = X?.aroundMinute ? X.aroundMinute(track.duration) : null;
        if (mn != null) auto.push({ label: `⏱ ~${mn} min`, key: `class:auto:around:${mn}` });
        const groups = groupsOf(track.id).length;
        auto.push({ label: groups === 0 ? '🏆 No groups' : `🏆 ${groups} group${groups === 1 ? '' : 's'}`, key: `class:auto:rank:${groups}` });
        return { manual: (track.classifiers || []).map(text).filter(Boolean), auto };
    }

    Object.assign(ns, {
        ready: true,
        durationBuckets, groupRanking, rankBuckets,
        manualNames, addManual, removeManual, renameManual, toggleOnTrack, manualTracks,
        overview, detail, selectableEntries, tracksForKey, classifiersForTrack
    });
})();
