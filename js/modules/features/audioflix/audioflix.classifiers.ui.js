// Renderers for the Audioflix classifier system: the Classifier Manager (overview + drill-down),
// the frontend classifier pill row, the per-track section in the settings panel, and the classifier
// scope inside the Nexus Audio Link panel. All state lives in audioflix.classifiers.js / the store;
// these are pure string builders reached through a `ctx` accessor bag.
window.EveAudioflixClassifiersUi = window.EveAudioflixClassifiersUi || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixClassifiersUi;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        const esc = ctx.esc;
        const C = () => window.EveAudioflixClassifiers;

        const PILL = 'font-size:0.72rem; padding:2px 8px; border-radius:12px; border:1px solid rgba(148,163,184,0.35); color:#e2e8f0; cursor:pointer; margin:2px;';

        function renderButton() {
            const open = ctx.getManagerOpen();
            return `<button type="button" class="audioflix-add-toggle${open ? ' is-active' : ''}" data-af-action="toggle-classifier-manager" style="margin-left: 8px;" title="Classifier Manager — automatic and manual song classifiers">🏷 Classifiers</button>`;
        }

        // Manager: every classifier with its kind + how many songs it covers, expandable into detail.
        function renderManager() {
            const api = C();
            if (!api) return '';
            const { auto, manual, totalTracks } = api.overview();
            const openId = ctx.getManagerDetailId();

            const row = (entry) => {
                const isOpen = openId === entry.id;
                const kindBadge = entry.kind === 'auto'
                    ? `<span style="font-size:0.66rem; color:#38bdf8; border:1px solid rgba(56,189,248,0.4); border-radius:8px; padding:1px 6px;">AUTO</span>`
                    : `<span style="font-size:0.66rem; color:#c084fc; border:1px solid rgba(192,132,252,0.4); border-radius:8px; padding:1px 6px;">MANUAL</span>`;
                const del = entry.kind === 'manual'
                    ? `<button type="button" class="audioflix-icon-btn danger" data-af-action="remove-classifier" data-af-classifier="${esc(entry.label)}" title="Delete this classifier (also detaches it from every song)">${ctx.closeSvg}</button>`
                    : '';
                const rename = entry.kind === 'manual'
                    ? `<button type="button" class="audioflix-icon-btn" data-af-action="rename-classifier" data-af-classifier="${esc(entry.label)}" title="Rename this classifier">✏️</button>`
                    : '';
                return `<div class="audioflix-port-item"><div style="min-width:0;"><strong>${esc(entry.label)}</strong> ${kindBadge}<code style="display:block; font-size:0.78rem; color:#94a3b8; margin-top:2px;">${entry.count} song${entry.count === 1 ? '' : 's'}${entry.buckets ? ` · ${entry.buckets} scope${entry.buckets === 1 ? '' : 's'}` : ''} — ${esc(entry.note)}</code></div><div style="display:flex; gap:6px; flex:none;"><button type="button" class="audioflix-icon-btn${isOpen ? ' is-active' : ''}" data-af-action="open-classifier-detail" data-af-classifier-id="${esc(entry.id)}" title="See what is inside this classifier">${isOpen ? '▲' : '🔍'}</button>${rename}${del}</div></div>${isOpen ? renderDetail(entry.id) : ''}`;
            };

            const addForm = `<form class="audioflix-ports-form" data-af-form="add-classifier"><label><span>New manual classifier</span><input name="name" required maxlength="40" placeholder="e.g. English only, mid artist"></label><button type="submit" data-af-action="submit-form">Add Classifier</button></form>`;
            return `<div class="audioflix-ports-mgr"><h4>Classifier Manager <span style="font-weight:500; color:#94a3b8; font-size:0.8rem;">(${auto.length} automatic · ${manual.length} manual · ${totalTracks} tracks)</span></h4>${auto.map(row).join('')}${manual.length ? manual.map(row).join('') : '<div class="audioflix-empty">No manual classifiers yet — add one below, then attach it from a track’s settings panel.</div>'}${addForm}</div>`;
        }

        // Drill-down: each scope of the classifier and the songs inside it.
        function renderDetail(id) {
            const data = C()?.detail(id);
            if (!data) return '';
            const bucket = (b) => {
                const names = b.tracks.slice(0, 25).map((t) => `<span style="${PILL} cursor:default; background:rgba(148,163,184,0.12);">${esc(t.title)}</span>`).join('');
                const more = b.tracks.length > 25 ? `<span style="font-size:0.72rem; color:#94a3b8;"> +${b.tracks.length - 25} more</span>` : '';
                const jump = `<button type="button" class="audioflix-add-toggle" data-af-action="select-frontend-group" data-af-type="music" data-af-group="${esc(b.key.startsWith('class:') ? b.key : `class:${data.kind === 'manual' ? b.key : `auto:${b.key}`}`)}" style="${PILL} background:rgba(56,189,248,0.2);" title="Show these songs in the frontend">▶ View in frontend</button>`;
                return `<div style="margin-top:6px; padding:6px 8px; background:rgba(0,0,0,0.22); border-radius:8px;"><div style="display:flex; align-items:center; justify-content:space-between; gap:8px;"><strong style="font-size:0.8rem; color:#f8fafc;">${esc(b.label)} <span style="color:#94a3b8; font-weight:500;">(${b.tracks.length})</span></strong>${jump}</div><div style="display:flex; flex-wrap:wrap; margin-top:4px;">${names || '<span style="font-size:0.75rem; color:#94a3b8;">No songs.</span>'}${more}</div></div>`;
            };
            const ranked = data.ranked?.length
                ? `<div style="margin-top:6px; font-size:0.75rem; color:#cbd5e1;"><strong style="color:#93c5fd;">Ranked listing (top ${data.ranked.length})</strong>${data.ranked.map((r) => `<div style="display:flex; justify-content:space-between; gap:8px; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05);"><span>#${r.rank} ${esc(r.track.title)}</span><span style="color:#94a3b8;">${r.groups} group${r.groups === 1 ? '' : 's'}</span></div>`).join('')}</div>`
                : '';
            return `<div style="margin:4px 0 10px; padding:8px 10px; background:rgba(15,23,42,0.5); border:1px solid rgba(148,163,184,0.25); border-radius:8px;">${(data.buckets || []).map(bucket).join('')}${ranked}</div>`;
        }

        // Frontend: a collapsed-by-default pill row (click a pill to view, click again to deselect).
        function renderFrontendRow(activeKey) {
            const entries = C()?.selectableEntries() || [];
            if (!entries.length) return '';
            const open = ctx.getFrontendOpen();
            const toggle = `<button type="button" class="audioflix-group-pill${open ? ' is-active' : ''}" data-af-action="toggle-classifier-row" title="Show classifier filters">🏷 Classifiers<span class="audioflix-group-pill-count">${entries.length}</span></button>`;
            const pills = open
                ? entries.map(([key, tracks, label]) => `<button type="button" class="audioflix-group-pill${key === activeKey ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-type="music" data-af-group="${esc(key)}">${esc(label)}<span class="audioflix-group-pill-count">${tracks.length}</span></button>`).join('')
                : '';
            return `<div class="audioflix-group-selector audioflix-classifier-selector"><span class="audioflix-scope-label">Classify:</span>${toggle}${pills}</div>`;
        }

        // Track settings panel: attach/detach manual labels; automatic memberships shown read-only.
        function renderSongSection(track) {
            const api = C();
            if (!api || !track) return '';
            const { manual, auto } = api.classifiersForTrack(track);
            const own = new Set(manual);
            const known = api.manualNames();
            const checks = known.length
                ? known.map((name) => `<label class="audioflix-group-check"><input type="checkbox" class="audioflix-classifier-cb" data-af-id="${esc(track.id)}" data-af-classifier="${esc(name)}" ${own.has(name) ? 'checked' : ''}><span>${esc(name)}</span></label>`).join('')
                : '<span class="audioflix-group-empty">No manual classifiers yet — create one below.</span>';
            const autoRow = auto.map((a) => `<span style="${PILL} background:rgba(56,189,248,0.18); cursor:default;" title="Automatic — derived from the track, not editable">${esc(a.label)}</span>`).join('');
            return `<div class="audioflix-info-groups" style="margin-top:10px;"><span class="audioflix-info-groups-label">Classifiers</span><div style="display:flex; flex-wrap:wrap; margin-bottom:4px;">${autoRow}</div><div class="audioflix-group-checklist">${checks}</div><form class="audioflix-group-quick" data-af-form="attach-classifier" data-af-id="${esc(track.id)}"><input name="name" placeholder="New classifier" autocomplete="off" maxlength="40"><button type="submit" data-af-action="submit-form">Add</button></form></div>`;
        }

        // Nexus Audio Link: classifier chips as one more collapsible scope.
        function renderNexusChips(activeFacet) {
            const entries = C()?.selectableEntries() || [];
            return entries.map(([key, tracks, label]) => {
                const facet = `classifier::${key}`;
                const on = activeFacet === facet;
                return `<button type="button" data-af-action="nexus-facet" data-af-facet="${esc(facet)}" style="${PILL} background:${on ? 'rgba(192,132,252,0.3)' : 'rgba(148,163,184,0.12)'};">${esc(label)} (${tracks.length})</button>`;
            }).join('');
        }

        return { renderButton, renderManager, renderDetail, renderFrontendRow, renderSongSection, renderNexusChips };
    };

    ns.ready = true;
})();
