// Track/sound settings modal for the Audioflix panel (the cog panel): details rows, duplicate
// manager, group assignment, classifiers, localization paths and the per-track localize form. Split
// out of audioflix.ui.js to keep that view under the project line cap; every helper and open-flag it
// needs arrives through the `ctx` bag so this module stays stateless.
window.EveAudioflixUiModal = window.EveAudioflixUiModal || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiModal;
    if (ns.ready) return;

    ns.create = function create(ctx) {
        const { esc, closeSvg, state, formatDuration, isItemExposed, groupsOf, allGroups,
            internalViewButton, findItem, uiLoc, uiClass, renderLocalizeForm } = ctx;
        const activeRepeaters = ctx.getActiveRepeaters;
        const localizeFormOpen = ctx.getLocalizeFormOpen;

        const renderInfoModal = (item, type) => {
            const dur = formatDuration(item.duration), src = item.isPorted ? `${item.category} (Ported)` : (type === 'music' ? 'Music Library' : 'Local Soundboard'), row = (lbl, val) => `<div class="audioflix-info-row"><span>${lbl}</span><strong>${val}</strong></div>`;
            const exposeRow = row('Expose to Frontend', `<input type="checkbox" class="audioflix-expose-cb" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" ${isItemExposed(item, type) ? 'checked' : ''}>`);
            const hotkeyRow = type === 'sound' ? row('Global Hotkey', `<input type="text" class="audioflix-hotkey-input" placeholder="e.g. ctrl+y, f5" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" value="${esc(item.hotkey || '')}">`) : '';
            const rep = activeRepeaters()[item.id], repeaterBlock = type === 'sound' ? `<div class="audioflix-repeater"><span class="audioflix-repeater-title">Sound Repeater</span><div class="audioflix-repeater-row"><label class="audioflix-repeater-field"><span>Interval (sec)</span><input type="number" step="0.1" min="0.1" value="${rep ? rep.intervalMs / 1000 : 1.0}" id="audioflix-rep-interval" ${rep ? 'disabled' : ''}></label><label class="audioflix-repeater-field"><span>Count (0 = inf)</span><input type="number" min="0" value="${rep ? rep.count : 0}" id="audioflix-rep-count" ${rep ? 'disabled' : ''}></label><button type="button" class="audioflix-repeater-btn${rep ? ' is-active' : ''}" data-af-action="toggle-repeater" data-af-id="${esc(item.id)}">${rep ? 'Stop' : 'Start'}</button></div></div>` : '';
            const trackEditBlock = type === 'music' ? `<form class="audioflix-track-edit-form" data-af-form="edit-track" data-af-id="${esc(item.id)}"><span class="audioflix-info-groups-label" style="display:block; margin-bottom:6px;">Edit Track Details</span><div class="audioflix-track-edit-grid"><label><span>Track Title</span><input name="title" value="${esc(item.title)}" required></label><label><span>URL / Path</span><input name="url" value="${esc(item.url)}" required></label><label><span>Artist</span><input name="artist" value="${esc(item.artist || '')}"></label><label><span>Folder / Card</span><input name="folder" value="${esc(item.folder || item.card || '')}"></label><label class="audioflix-wide-field" style="grid-column: span 2; margin-top: 4px;"><span>Local Path (offline copy)</span><input name="localPath" value="${esc(item.localPath || '')}" placeholder="C:\\path\\to\\offline\\file.mp3"></label></div><button type="submit" class="audioflix-save-track-btn" data-af-action="submit-form">Save Track Edits</button></form>` : '';
            
            const dupMatches = window.EveAudioflixDuplicates?.duplicatesFor?.(type, item.id) || [];
            let dupSection = '';
            if (dupMatches.length) {
                const srcKind = (u) => (/^https?:\/\//i.test(String(u || '')) ? 'online' : (u ? 'local file' : ''));
                const matchItems = dupMatches.map(d => {
                    const kind = srcKind(d.url);
                    const kindTag = kind ? ` <em style="color:#94a3b8; font-style:normal;">· ${kind}</em>` : '';
                    return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:4px; padding:6px 10px; background:rgba(239,68,68,0.15); border-radius:4px; font-size:0.85rem;"><span style="color:#f8fafc; min-width:0; overflow:hidden; text-overflow:ellipsis;">${esc(d.title)} <code style="color:#cbd5e1;">(${esc(d.folder || d.category || 'Ungrouped')})</code>${kindTag}</span><span style="display:flex; gap:6px; flex:none;"><button type="button" class="audioflix-save-track-btn" data-af-action="merge-duplicate" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" data-af-dupid="${esc(d.id)}" style="background:#ef4444; color:#fff; padding:2px 8px; font-size:0.75rem;">Merge Into This</button><button type="button" class="audioflix-save-track-btn" data-af-action="keep-both-duplicate" data-af-id="${esc(item.id)}" data-af-dupid="${esc(d.id)}" style="background:rgba(148,163,184,0.25); color:#e2e8f0; padding:2px 8px; font-size:0.75rem;">Keep Both</button></span></div>`;
                }).join('');
                dupSection = `<div class="audioflix-dup-manager-box" style="margin-top:12px; padding:10px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); border-radius:6px;"><strong style="color:#f87171; font-size:0.9rem;">⚠️ Duplicate Detected (${dupMatches.length} match${dupMatches.length === 1 ? '' : 'es'})</strong><p style="font-size:0.8rem; color:#cbd5e1; margin:4px 0 8px;">Another item shares this title or URL. <strong>Merge Into This</strong> combines their groups and deletes the other — a file-path copy and an online copy become one track carrying both. <strong>Keep Both</strong> leaves them separate (move one to another folder/group) and stops the notice.</p>${matchItems}</div>`;
            }

            // Dual-source tracks (from a duplicate merge) carry a local file alongside the online url.
            const localSourceRow = (type === 'music' && item.localPath) ? `<div class="audioflix-info-url-container"><span>Local file (offline copy)</span><div class="audioflix-info-url-row"><input type="text" readonly value="${esc(item.localPath)}" class="audioflix-info-url-input" onclick="this.select()"><button type="button" class="audioflix-info-copy-btn" data-af-action="copy-url" data-af-url="${esc(item.localPath)}">Copy</button></div></div>` : '';
            // Collapsible localize control for this single track (relocalize stays available even after
            // the local copy is deleted). Lives here in the settings panel, not a popup.
            const canLocalizeSong = type === 'music' && (Boolean(item.url) || Boolean(item.localPath));
            const songLocOpen = localizeFormOpen().open && localizeFormOpen().scope === 'song' && localizeFormOpen().key === item.id;
            const songLocalizeSection = canLocalizeSong ? `<div class="audioflix-info-groups" style="margin-top:10px;"><button type="button" class="audioflix-add-toggle${songLocOpen ? ' is-active' : ''}" data-af-action="toggle-localize-form" data-af-scope="song" data-af-key="${esc(item.id)}">${item.localPath ? '⬇️ Re-localize this track' : '⬇️ Localize this track'}</button>${songLocOpen ? renderLocalizeForm() : ''}</div>` : '';

            return `<div class="audioflix-info-modal" data-af-action="close-info"><div class="audioflix-info-card"><div class="audioflix-info-header"><div><span class="audioflix-kicker">${type === 'music' ? 'Track Details' : 'Sound Details'}</span><h3 class="audioflix-info-title">${esc(item.title)}</h3></div><button type="button" class="audioflix-info-close-btn" data-af-action="close-info">${closeSvg}</button></div><div class="audioflix-info-body">${row('Type', type)}${row('Source', src)}${row('Duration', dur)}${item.artist ? row('Artist', item.artist) : ''}${item.volume !== undefined ? row('Volume modifier', item.volume) : ''}${exposeRow}${hotkeyRow}${repeaterBlock}${dupSection}${renderGroupAssign(item, type)}${trackEditBlock}<div class="audioflix-info-url-container"><span>Audio URL / Path</span><div class="audioflix-info-url-row"><input type="text" readonly value="${esc(item.url)}" class="audioflix-info-url-input" onclick="this.select()"><button type="button" class="audioflix-info-copy-btn" data-af-action="copy-url" data-af-url="${esc(item.url)}">Copy</button></div></div>${(type === 'music' ? uiLoc.renderSongLocalizations(item) : '') || localSourceRow}${type === 'music' ? uiClass.renderSongSection(item) : ''}${songLocalizeSection}</div><div class="audioflix-info-footer">${internalViewButton(item, type, true)}<button type="button" class="audioflix-info-close-action" data-af-action="close-info">Close</button></div></div></div>`;
        };
        const renderGroupAssign = (item, type = 'sound', mine = new Set(groupsOf(item.id, type))) => `<div class="audioflix-info-groups"><span class="audioflix-info-groups-label">Frontend Groups</span><div class="audioflix-group-checklist">${allGroups(type).map(g => `<label class="audioflix-group-check"><input type="checkbox" class="audioflix-group-cb" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" data-af-group="${esc(g)}" ${mine.has(g) ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('') || '<span class="audioflix-group-empty">No groups yet — create one below.</span>'}</div><form class="audioflix-group-quick" data-af-form="assign-new-group" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}"><input name="name" placeholder="New group" autocomplete="off" maxlength="40"><button type="submit" data-af-action="submit-form">Add</button></form></div>`;

        return { renderInfoModal, renderGroupAssign };
    };

    ns.ready = true;
})();
