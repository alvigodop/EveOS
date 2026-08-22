// Card / grid / frontend renderers for the Audioflix panel. Split out of audioflix.ui.js to keep
// that view under the line cap. These are pure string builders plus the frontend group/smart-folder
// entry computers; they reach the view's helpers and mutable flags through the `ctx` bag so nothing
// here holds state. Smart folders (shared artist, duration bucket) are computed here too.
window.EveAudioflixUiRender = window.EveAudioflixUiRender || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiRender;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        const esc = ctx.esc;
        const state = ctx.state;

        function frontendMusicItems() {
            let items = (state().music || []).filter((it) => ctx.isItemExposed(it, 'music'));
            const scope = state().activeMusicFolderScope || '';
            if (scope) items = items.filter((it) => String(it.folder || it.card || '').trim() === scope);
            return items;
        }
        // Smart folders: virtual groups computed from the tracks (shared artist, or a duration
        // bucket). Keyed "smart:artist:Name" / "smart:around:3" so the normal group selector treats
        // them as a selectable group; the third tuple element is the friendly pill label.
        function frontendMusicSmartEntries(sourceItems) {
            const X = window.EveAudioflixNexus;
            const items = sourceItems || frontendMusicItems();
            const out = [];
            const byArtist = {};
            items.forEach((it) => {
                const a = (X?.getArtist ? X.getArtist(it) : String(it.artist || '').trim());
                if (a) (byArtist[a] = byArtist[a] || []).push(it);
            });
            Object.entries(byArtist)
                .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
                .forEach(([a, m]) => out.push([`smart:artist:${a}`, m, `🎤 ${a}`]));
            return out;
        }
        function frontendGroupEntries(type = 'sound') {
            if (type === 'music') {
                const items = frontendMusicItems();
                const entries = [];
                ctx.allGroups('music').forEach((g) => { const m = items.filter((it) => ctx.groupsOf(it.id, 'music').includes(g)); if (m.length) entries.push([g, m]); });
                entries.push(['Ungrouped', items.filter((it) => !ctx.groupsOf(it.id, 'music').length)]);
                return entries;
            }
            const items = [...(state().soundboard || []), ...ctx.getPorted()].filter((it) => ctx.isItemExposed(it, 'sound')), entries = [];
            ctx.allGroups('sound').forEach((g) => { const m = items.filter((it) => ctx.groupsOf(it.id, 'sound').includes(g)); if (m.length) entries.push([g, m]); });
            entries.push(['Ungrouped', items.filter((it) => !ctx.groupsOf(it.id, 'sound').length)]);
            return entries;
        }
        function frontendActiveGroup(type = 'sound') {
            const entries = frontendGroupEntries(type);
            if (type === 'music') {
                const baseItems = frontendMusicItems();
                const chosenGroup = entries.find(([name]) => name === (state().activeFrontendMusicGroup || ''));
                const groupItems = chosenGroup ? chosenGroup[1] : baseItems;
                const smart = frontendMusicSmartEntries(groupItems);
                const chosenArtist = smart.find(([key]) => key === (state().activeFrontendMusicArtist || ''));
                const artistItems = chosenArtist ? chosenArtist[1] : groupItems;
                const classifiers = ctx.classifierEntries(artistItems);
                const chosenClassifier = classifiers.find(([key]) => key === (state().activeFrontendMusicClassifier || ''));
                const items = chosenClassifier ? chosenClassifier[1] : artistItems;
                const labels = [chosenGroup?.[0] || 'All Groups', chosenArtist?.[2], chosenClassifier?.[2]].filter(Boolean);
                return {
                    name: labels.join(' / '), items, entries, smart, classifiers,
                    activeGroup: chosenGroup?.[0] || '',
                    activeArtist: chosenArtist?.[0] || '',
                    activeClassifier: chosenClassifier?.[0] || '',
                    displayName: labels.join(' / ')
                };
            }
            if (!entries.length) return { name: '', items: [], entries };
            const activeKey = state().activeFrontendGroup;
            const chosen = entries.find(([n]) => n === activeKey) || entries[0];
            return { name: chosen[0], items: chosen[1], entries };
        }

        function renderItemCard(item, type) {
            const isF = (type === 'music' ? (state().musicViewMode || 'backend') : (state().soundboardViewMode || 'backend')) === 'frontend';
            const transport = window.EveAudioflixTransport?.render?.(item, type, esc) || '';
            const rep = ctx.getActiveRepeaters()[item.id], repBadge = rep ? `<span class="audioflix-repeater-badge" title="Repeater active">🔁 Rep</span>` : '';
            const keyBadge = (isF && type === 'sound' && item.hotkey) ? `<span class="audioflix-hotkey-badge" title="Hotkey: press ${esc(item.hotkey)}">${esc(item.hotkey)}</span>` : '';
            const delBtn = (!isF && !item.isPorted) ? `<button type="button" class="audioflix-icon-btn danger" data-af-action="remove" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}">${ctx.closeSvg}</button>` : '';
            const dupLevel = window.EveAudioflixDuplicates?.duplicateLevelFor?.(type, item.id) || '';
            const dupBadge = dupLevel ? `<span class="audioflix-dup-badge${dupLevel === 'soft' ? ' is-soft' : ''}" title="${dupLevel === 'soft' ? 'Possible same-title or clipped version' : 'Matching source identity detected'}">👯 ${dupLevel === 'soft' ? 'Soft dup' : 'Dup'}</span>` : '';
            // Playlist provenance is shown in the track's settings panel; only mirror it onto the
            // card when the user opts in (keeps the grid clean by default).
            const showMarkers = state().showPlaylistMarkersOnCard === true;
            const layerVoices = type === 'sound'
                ? `<div class="audioflix-layer-voices" data-af-layer-voices="${esc(item.id)}" aria-live="off"></div>`
                : '';
            const isLibraryOnly = showMarkers && type === 'music' && window.EveAudioflixPlaylists?.isLibraryOnlyTrackInImportedGroup?.(item);
            const localBadge = isLibraryOnly ? `<span class="audioflix-local-badge is-minimized" title="Kept in EveOS; this track is not supplied by the linked playlist" data-af-action="toggle-local-badge"><span class="audioflix-local-badge-icon">⚡</span><span class="audioflix-local-badge-text"> Library-only</span></span>` : '';
            const amq = ctx.getActiveMusicQueue();
            let queueBadge = '';
            if (type === 'music' && amq.isPlaying && amq.items.includes(item.id)) {
                const qIdx = amq.items.indexOf(item.id);
                const pos = qIdx + 1;
                const isCurrent = qIdx === amq.currentIndex;
                const isPast = qIdx < amq.currentIndex;
                const statusText = isCurrent ? 'Playing' : (isPast ? 'Played' : 'Queued');
                const activeClass = isCurrent ? ' is-active' : (isPast ? ' is-past' : '');
                queueBadge = `<span class="audioflix-queue-badge${activeClass}" title="Queue position #${pos} (${statusText})">#${pos} ${statusText}</span>`;
            }
            return `<article class="audioflix-item-card${item.upstreamMissing && showMarkers ? ' is-upstream-missing' : ''}"><div class="audioflix-playback-controls"><button type="button" class="audioflix-stop" data-af-action="stop-item" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Stop">${ctx.stopSvg}</button><button type="button" class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">${ctx.playSvg}</button></div><button type="button" class="audioflix-layer-play" data-af-action="layer-play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Layer Play">${ctx.layerPlaySvg}</button><div class="audioflix-item-body"><div class="audioflix-item-title-row">${queueBadge}${dupBadge}${localBadge}${repBadge}${keyBadge}<strong>${esc(item.title)}</strong></div><span>${esc(ctx.itemMeta(item))}</span>${ctx.groupTags(item, ctx.groupsOf(item.id, type))}</div><div class="audioflix-item-actions">${ctx.internalViewButton(item, type)}${item.upstreamMissing && item.playlistId && showMarkers ? `<button type="button" class="audioflix-icon-btn" data-af-action="keep-playlist-track" data-af-id="${esc(item.id)}" title="Removed from the upstream playlist — keep it in EveOS">&#128190;</button>` : ''}<button type="button" class="audioflix-icon-btn" data-af-action="item-info" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="${isF ? 'Settings' : ''}">${ctx.cogSvg}</button>${delBtn}</div>${transport}${layerVoices}</article>`;
        }

        function renderItems(items, type) {
            if (!items.length) return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'sounds'} yet.</div>`;
            const isF = (type === 'music' ? (state().musicViewMode || 'backend') : (state().soundboardViewMode || 'backend')) === 'frontend';
            const fil = type === 'sound' && isF ? items.filter((it) => ctx.isItemExposed(it, 'sound')) : items;
            if (!fil.length) return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'exposed sounds'} yet.</div>`;
            if (isF) return type === 'music' ? renderFrontendMusicActive() : renderFrontendActive();
            const cg = ctx.getCollapsedGroups();
            const groups = new Map(); fil.forEach((it) => { const k = ctx.groupKey(it, type); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
            return [...groups.entries()].map(([n, gi]) => `<section class="audioflix-group ${cg[n] ? 'is-collapsed' : ''}" data-af-group="${esc(n)}"><button type="button" class="audioflix-group-title" data-af-action="toggle-group" data-af-group="${esc(n)}" aria-expanded="${cg[n] ? 'false' : 'true'}">${esc(n)}<span class="audioflix-group-count">${gi.length} item${gi.length === 1 ? '' : 's'}</span></button><div class="audioflix-item-grid">${gi.map((it) => renderItemCard(it, type)).join('')}</div></section>`).join('');
        }

        const renderFrontendActive = () => {
            const { name, items, entries } = frontendActiveGroup('sound');
            const selector = `<div class="audioflix-group-selector">${entries.map(([g, members]) => `<button type="button" class="audioflix-group-pill${g === name ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-type="sound" data-af-group="${esc(g)}">${esc(g)}<span class="audioflix-group-pill-count">${members.length}</span></button>`).join('')}</div>`;
            return `${selector}<div class="audioflix-item-grid" data-af-active-group="${esc(name)}">${items.map((it) => renderItemCard(it, 'sound')).join('')}</div>${items.some((it) => it.hotkey) ? '<div class="audioflix-hotkey-hint">Custom hotkeys are active system-wide.</div>' : ''}`;
        };

        const renderFrontendMusicActive = () => {
            const {
                name, items, entries, smart, classifiers,
                activeGroup, activeArtist, activeClassifier, displayName
            } = frontendActiveGroup('music');
            const musicItems = state().music || [];
            const allFolders = [...new Set(musicItems.map((it) => String(it.folder || it.card || '').trim()).filter(Boolean))];
            const activeScope = state().activeMusicFolderScope || '';
            const classifierRow = ctx.renderClassifierRow ? ctx.renderClassifierRow(activeClassifier, classifiers) : '';
            const scopePills = `<div class="audioflix-folder-scope-selector"><span class="audioflix-scope-label">Track Focus:</span><button type="button" class="audioflix-scope-pill${activeScope === '' ? ' is-active' : ''}" data-af-action="select-folder-scope" data-af-scope="">🌐 All Folders (No Focus)</button>${allFolders.map((f) => `<button type="button" class="audioflix-scope-pill${activeScope === f ? ' is-active' : ''}" data-af-action="select-folder-scope" data-af-scope="${esc(f)}">📁 ${esc(f)}</button>`).join('')}</div>`;
            const allGroupPill = `<button type="button" class="audioflix-group-pill${activeGroup === '' ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-dimension="group" data-af-type="music" data-af-group="">All Groups (No Focus)<span class="audioflix-group-pill-count">${frontendMusicItems().length}</span></button>`;
            const selector = `<div class="audioflix-group-selector"><span class="audioflix-scope-label">Group:</span>${allGroupPill}${entries.map(([g, members]) => `<button type="button" class="audioflix-group-pill${g === activeGroup ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-dimension="group" data-af-type="music" data-af-group="${esc(g)}">${esc(g)}<span class="audioflix-group-pill-count">${members.length}</span></button>`).join('')}</div>`;
            const smartOpen = ctx.smartArtistExpanded;
            const smartPills = (smart && smart.length && smartOpen) ? smart.map(([k, m, label]) => `<button type="button" class="audioflix-group-pill${k === activeArtist ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-dimension="artist" data-af-type="music" data-af-group="${esc(k)}">${esc(label)}<span class="audioflix-group-pill-count">${m.length}</span></button>`).join('') : '';
            const smartToggleBtn = (smart && smart.length) ? `<button type="button" class="audioflix-add-toggle${smartOpen ? ' is-active' : ''}" data-af-action="toggle-smart-artists" style="font-size:0.75rem; padding:3px 10px; border-radius:12px; cursor:pointer;" title="Toggle artist smart filters">🎤 Artists (${smart.length}) ${smartOpen ? '▲' : '▼'}</button>` : '';
            const smartSelector = (smart && smart.length) ? `<div class="audioflix-group-selector audioflix-smart-selector" style="align-items:center; gap:8px;"><span class="audioflix-scope-label">Smart:</span>${smartToggleBtn}${smartPills}</div>` : '';
            const amq = ctx.getActiveMusicQueue();
            const isQueuePlaying = amq.isPlaying && amq.groupName === name;
            const playGroupBtn = items.length ? (isQueuePlaying
                ? `<button type="button" class="audioflix-play-group-btn is-active" data-af-action="stop-music-group">⏹ Stop Group</button>`
                : `<button type="button" class="audioflix-play-group-btn" data-af-action="play-music-group">▶ Play Group</button>`) : '';
            // Shuffle Order pins the playing track at #1 and randomizes the rest; Activate Loop wraps
            // back to #1 at the end (reshuffling first when shuffle is on).
            const shuffleBtn = items.length
                ? `<button type="button" class="audioflix-play-group-btn${amq.shuffle ? ' is-active' : ''}" data-af-action="shuffle-music-group" title="Make the current track #1 and shuffle the rest">🔀 Shuffle Order</button>`
                : '';
            const loopBtn = items.length
                ? `<button type="button" class="audioflix-play-group-btn${amq.loop ? ' is-active' : ''}" data-af-action="loop-music-group" title="When the last track ends, loop back to #1">🔁 ${amq.loop ? 'Loop On' : 'Activate Loop'}</button>`
                : '';
            // Queue-wide internal view: unlike the per-song "open inside EveOS" (locked to one
            // track), this follows the group's queue — current track plus what's coming, with
            // prev/next and a speed control.
            const queueViewBtn = items.length
                ? `<button type="button" class="audioflix-play-group-btn" data-af-action="open-queue-view" title="Open this group's queue inside EveOS">🖥 Queue View</button>`
                : '';
            return `${scopePills}${selector}${smartSelector}${classifierRow}<div class="audioflix-frontend-subhead" style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:12px; padding:0 4px;"><div style="display:flex; align-items:center; gap:10px;"><strong style="font-size:1.05rem; color:#f8fafc;">${esc(displayName)}</strong> <span style="font-size:0.8rem; color:#94a3b8; font-weight:600;">(${items.length} track${items.length === 1 ? '' : 's'})</span></div><div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">${playGroupBtn}${shuffleBtn}${loopBtn}${queueViewBtn}</div></div><div class="audioflix-item-grid" data-af-active-group="${esc(name)}">${items.map((it) => renderItemCard(it, 'music')).join('')}</div>`;
        };

        return { frontendMusicItems, frontendMusicSmartEntries, frontendGroupEntries, frontendActiveGroup, renderItemCard, renderItems, renderFrontendActive, renderFrontendMusicActive };
    };

    ns.ready = true;
})();
