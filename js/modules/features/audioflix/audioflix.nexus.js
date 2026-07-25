// Nexus Audio Link — a search/index layer over the Audioflix library, the audio-side cousin of the
// EveOS nexus search. Pure query logic (no DOM): fuzzy name/artist/folder/group search, facet
// buckets (artists, groups, folders, duration minutes), a nuanced duplicate report (exact-name,
// look-alike names, shared-artist clusters), and the shared duration "around/below" matcher used by
// both the search duration facet and the frontend smart folders. Search runs surface in the nexus
// trace log via SearchMonitorBoot so this ties into the existing nexus search.
window.EveAudioflixNexus = window.EveAudioflixNexus || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixNexus;
    if (ns.ready) return;

    const S = () => window.EveAudioflixState;
    const state = () => S()?.ensure?.() || {};
    const text = (v) => String(v ?? '').trim();
    const norm = (v) => text(v).toLowerCase();
    const simKey = (v) => norm(v).replace(/[^a-z0-9]+/g, '');

    // Base list for a type. Soundboard callers pass ported sounds in via `extra` (they live in the
    // UI, not state) so search covers them too.
    function items(type, extra) {
        const base = type === 'music' ? (state().music || []) : (state().soundboard || []);
        return extra && extra.length ? base.concat(extra) : base;
    }

    function groupsOf(type, id) {
        const map = type === 'music' ? (state().musicGroupMap || {}) : (state().soundGroupMap || {});
        return map[id] || [];
    }

    // Free-text search across title/artist/folder/category and group membership.
    function search(query, type, list) {
        const q = norm(query);
        const arr = list || items(type);
        if (!q) return arr;
        return arr.filter((it) => {
            const hay = [it.title, it.artist, it.folder, it.card, it.category].map(norm).concat(groupsOf(type, it.id).map(norm)).join('  ');
            return hay.includes(q);
        });
    }

    // The minute a duration is "around": it rolls up to the next minute only PAST the :36 mark, so
    // 3:14/3:34/3:36 are "around 3" while 3:38/3:40 tip into "around 4" — the edge the spec calls for.
    const aroundMinute = (sec) => {
        const s = Number(sec);
        if (!isFinite(s) || s <= 0) return null;
        return (s % 60) > 36 ? Math.floor(s / 60) + 1 : Math.floor(s / 60);
    };
    // mode 'below' = hard under N minutes; mode 'around' = the same :36 rule as the facet buckets, so
    // filtering and bucketing never disagree at the edge.
    function durationMatch(sec, targetMin, mode) {
        const s = Number(sec);
        if (!isFinite(s) || s <= 0) return false;
        if (mode === 'below') return s < Number(targetMin) * 60;
        return aroundMinute(s) === Number(targetMin);
    }

    function getArtist(it) {
        return text(it?.artist || it?.author || it?.uploader);
    }

    // Facet buckets for the search panel and smart folders.
    function facets(type, list) {
        const arr = list || items(type);
        const artists = {}, groups = {}, folders = {}, mins = {};
        arr.forEach((it) => {
            const a = getArtist(it); if (a) artists[a] = (artists[a] || 0) + 1;
            const f = text(it.folder || it.card || it.category); if (f) folders[f] = (folders[f] || 0) + 1;
            groupsOf(type, it.id).forEach((g) => { groups[g] = (groups[g] || 0) + 1; });
            const m = aroundMinute(it.duration); if (m != null) mins[m] = (mins[m] || 0) + 1;
        });
        const toList = (o) => Object.entries(o).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
        return {
            artists: toList(artists),
            groups: toList(groups),
            folders: toList(folders),
            durations: Object.keys(mins).map(Number).sort((x, y) => x - y).map((m) => ({ min: m, count: mins[m] }))
        };
    }

    // Nuanced duplicate report: exact-name clusters, look-alike (same alphanumerics, different
    // wording), and shared-artist clusters. Feeds the "manage dups" section of the search panel.
    function dupReport(type, list) {
        const arr = list || items(type);
        const byName = {}, bySim = {}, byArtist = {};
        arr.forEach((it) => {
            const n = norm(it.title); if (n) (byName[n] = byName[n] || []).push(it);
            const sk = simKey(it.title); if (sk) (bySim[sk] = bySim[sk] || []).push(it);
            const a = norm(it.artist); if (a) (byArtist[a] = byArtist[a] || []).push(it);
        });
        const clusters = (o) => Object.values(o).filter((g) => g.length > 1);
        return {
            exact: clusters(byName),
            similar: clusters(bySim).filter((g) => new Set(g.map((x) => norm(x.title))).size > 1),
            sameArtist: Object.entries(byArtist).filter(([, g]) => g.length > 1).map(([artist, group]) => ({ artist, items: group }))
        };
    }

    // Surface a search in the nexus trace log (no-op if the monitor isn't up) — the "connect the two".
    function recordSearch(query, type, count) {
        try {
            window.SearchMonitorBoot?.recordNexusTrace?.({
                id: 'afx-' + Date.now().toString(36), kind: 'audioflix-search',
                summary: `Nexus Audio Link: "${text(query)}" -> ${count} ${type} match${count === 1 ? '' : 'es'}`,
                totalMs: 0, endedAt: Date.now()
            });
        } catch (e) { /* monitor not present */ }
    }

    Object.assign(ns, { ready: true, items, groupsOf, search, facets, dupReport, durationMatch, aroundMinute, recordSearch, getArtist });
})();
