// Renderers for the Nexus Audio Link search panel (music + soundboard, backend + frontend). Kept
// out of audioflix.ui.js: the panel has a live search box, facet chips (artists / groups / folders
// / duration), and a "manage duplicates" filter that routes each hit into its settings panel where
// the existing merge/keep-both tools live. Results render into their own container so typing can
// refresh just that container without losing input focus.
window.EveAudioflixNexusUi = window.EveAudioflixNexusUi || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixNexusUi;
    if (ns.ready) return;

    let expandedSections = { artist: false, group: false, folder: false, duration: false };

    ns.toggleSection = function toggleSection(sec) {
        if (sec in expandedSections) expandedSections[sec] = !expandedSections[sec];
    };

    ns.create = function create(deps) {
        const esc = deps.esc;
        const getNexus = deps.getNexusState;   // () -> { open, type, query, facet }
        const getPorted = deps.getPorted;      // () -> ported sounds array (soundboard only)
        const X = () => window.EveAudioflixNexus;

        function renderButton(type) {
            const st = getNexus();
            const active = st.open && st.type === type;
            return `<button type="button" class="audioflix-add-toggle${active ? ' is-active' : ''}" data-af-action="toggle-nexus" data-af-type="${esc(type)}" style="margin-left: 8px;" title="Nexus Audio Link — search & manage duplicates">🔎 Nexus Audio Link</button>`;
        }

        function filteredList(type) {
            const st = getNexus();
            const api = X();
            const all = api.items(type, type === 'sound' ? (getPorted() || []) : []);
            let list = api.search(st.query, type, all);
            const [kind, val] = String(st.facet || '').split('::');
            if (kind === 'artist') list = list.filter((it) => (it.artist || '').toLowerCase() === val.toLowerCase());
            else if (kind === 'folder') list = list.filter((it) => String(it.folder || it.card || it.category || '').toLowerCase() === val.toLowerCase());
            else if (kind === 'group') list = list.filter((it) => api.groupsOf(type, it.id).map((g) => g.toLowerCase()).includes(val.toLowerCase()));
            else if (kind === 'around') list = list.filter((it) => api.durationMatch(it.duration, Number(val), 'around'));
            else if (kind === 'below') list = list.filter((it) => api.durationMatch(it.duration, Number(val), 'below'));
            else if (kind === 'dups') {
                const rep = api.dupReport(type, all);
                const ids = new Set();
                rep.exact.concat(rep.similar).forEach((g) => g.forEach((x) => ids.add(x.id)));
                list = list.filter((it) => ids.has(it.id));
            }
            return list;
        }

        function rowHtml(it, type) {
            const meta = [it.artist, it.folder || it.card || it.category].filter(Boolean).join(' · ');
            const dupBadge = window.EveAudioflixDuplicates?.isDuplicate?.(type, it.id) ? ' <span style="color:#f87171; font-size:0.7rem;">👯 dup</span>' : '';
            return `<div style="display:flex; align-items:center; gap:8px; padding:5px 8px; border-bottom:1px solid rgba(255,255,255,0.06);"><button type="button" class="audioflix-icon-btn" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(it.id)}" title="Play">▶</button><div style="flex:1; min-width:0;"><strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(it.title)}${dupBadge}</strong><span style="font-size:0.75rem; color:#94a3b8;">${esc(meta) || '—'}</span></div><button type="button" class="audioflix-icon-btn" data-af-action="item-info" data-af-type="${esc(type)}" data-af-id="${esc(it.id)}" title="Settings / manage duplicate">⚙</button></div>`;
        }

        function renderResults(type) {
            const st = getNexus();
            const list = filteredList(type);
            if (st.query) X().recordSearch(st.query, type, list.length);
            const shown = list.slice(0, 80).map((it) => rowHtml(it, type)).join('');
            const more = list.length > 80 ? `<div style="padding:6px 8px; color:#94a3b8; font-size:0.75rem;">Showing first 80 of ${list.length}.</div>` : '';
            return (shown || '<div style="color:#94a3b8; padding:10px;">No matches.</div>') + more;
        }

        function chip(kind, val, label, count, active) {
            const on = active;
            return `<button type="button" data-af-action="nexus-facet" data-af-facet="${esc(kind + '::' + val)}" style="font-size:0.72rem; padding:2px 8px; border-radius:12px; border:1px solid rgba(148,163,184,0.35); background:${on ? 'rgba(56,189,248,0.35)' : 'rgba(148,163,184,0.12)'}; color:${on ? '#38bdf8' : '#e2e8f0'}; cursor:pointer; margin:2px; font-weight:${on ? '700' : 'normal'};" title="${on ? 'Click to deselect' : 'Click to filter'}">${esc(label)}${count != null ? ` (${count})` : ''}</button>`;
        }

        function renderPanel(type) {
            const st = getNexus();
            const api = X();
            const all = api.items(type, type === 'sound' ? (getPorted() || []) : []);
            const f = api.facets(type, all);
            const dup = api.dupReport(type, all);
            const dupCount = dup.exact.length + dup.similar.length;

            const [activeKind] = String(st.facet || '').split('::');

            const sectionRow = (secKey, title, count, chips) => {
                if (!chips || !count) return '';
                const isOpen = expandedSections[secKey] || activeKind === secKey || (secKey === 'duration' && (activeKind === 'around' || activeKind === 'below'));
                const toggleBtn = `<button type="button" class="audioflix-add-toggle${isOpen ? ' is-active' : ''}" data-af-action="toggle-nexus-section" data-af-section="${esc(secKey)}" style="font-size:0.72rem; padding:2px 8px; border-radius:10px; cursor:pointer;">${isOpen ? '▲' : '▼'} ${esc(title)} (${count})</button>`;
                return `<div style="margin-top:6px;"><div style="display:flex; align-items:center; gap:6px;">${toggleBtn}</div>${isOpen ? `<div style="display:flex; flex-wrap:wrap; gap:2px; margin-top:4px; padding-left:4px;">${chips}</div>` : ''}</div>`;
            };

            const dupChip = dupCount
                ? chip('dups', '1', `👯 Possible duplicates`, dupCount, st.facet === 'dups::1') + `<span style="font-size:0.7rem; color:#94a3b8; margin-left:6px;">open a hit's ⚙ to merge / keep both</span>`
                : '<span style="font-size:0.75rem; color:#94a3b8;">No duplicate names detected.</span>';
            const artistChips = f.artists.slice(0, 14).map((a) => chip('artist', a.name, a.name, a.count, st.facet === `artist::${a.name}`)).join('');
            const groupChips = f.groups.slice(0, 14).map((g) => chip('group', g.name, g.name, g.count, st.facet === `group::${g.name}`)).join('');
            const folderChips = f.folders.slice(0, 14).map((x) => chip('folder', x.name, x.name, x.count, st.facet === `folder::${x.name}`)).join('');
            const durChips = type === 'music' ? f.durations.map((d) => chip('around', String(d.min), `~${d.min} min`, d.count, st.facet === `around::${d.min}`)).join('') : '';
            const belowChips = type === 'music'
                ? f.durations.map((d) => d.min).filter((m) => m > 0).map((m) => chip('below', String(m), `< ${m} min`, null, st.facet === `below::${m}`)).join('')
                : '';
            const combinedDurChips = (durChips || belowChips) ? (durChips + belowChips) : '';

            const clearBtn = st.facet ? `<button type="button" class="audioflix-icon-btn" data-af-action="nexus-facet" data-af-facet="${esc(st.facet)}" title="Clear filter">✕</button>` : '';
            return `<div class="audioflix-nexus-panel" style="margin-top:8px; padding:12px; border-radius:12px; background:rgba(2,6,23,0.55); border:1px solid rgba(148,163,184,0.25);"><div style="display:flex; align-items:center; gap:8px;"><input type="text" data-af-nexus-search data-af-type="${esc(type)}" value="${esc(st.query)}" placeholder="Search ${type === 'music' ? 'tracks' : 'sounds'} by name, artist, folder, group..." style="flex:1; padding:6px 10px; border-radius:10px; border:1px solid rgba(148,163,184,0.35); background:rgba(0,0,0,0.3); color:#f8fafc;">${clearBtn}</div><div style="margin-top:6px;"><span style="font-size:0.72rem; color:#94a3b8; font-weight:700;">Manage duplicates</span><div style="display:flex; flex-wrap:wrap; gap:2px; margin-top:2px;">${dupChip}</div></div>${sectionRow('artist', 'Artists', f.artists.length, artistChips)}${sectionRow('group', 'Groups', f.groups.length, groupChips)}${sectionRow('folder', 'Folders', f.folders.length, folderChips)}${sectionRow('duration', 'Duration Filters', f.durations.length, combinedDurChips)}<div class="audioflix-nexus-results" data-af-nexus-results="${esc(type)}" style="margin-top:8px; max-height:300px; overflow-y:auto; border-top:1px solid rgba(255,255,255,0.08);">${renderResults(type)}</div></div>`;
        }

        return { renderButton, renderPanel, renderResults };
    };

    ns.ready = true;
})();
