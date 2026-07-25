// Localization UI renderers for the Audioflix music library. Split out of audioflix.ui.js to keep
// that view under the line cap and to house the growing localization surface: the collapsible
// localize form (with the group class-mode selector), the music-port extract form, a group's
// "connected paths" popover (1st-class folder files + the group's own files/shortcuts), and the
// per-track localization list shown in the settings panel (folder > shortcut > group-dup order).
window.EveAudioflixUiLocalize = window.EveAudioflixUiLocalize || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiLocalize;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const esc = deps.esc;
        const findItem = deps.findItem;
        const getLoc = deps.getLocalizeFormOpen;       // () -> { open, scope, key }
        const getMissing = deps.getMissingListOpen;    // () -> { open, scope, key }
        const getPaths = deps.getGroupPathsOpen;       // () -> { open, key }
        const L = () => window.EveAudioflixLocalize;

        function renderLocalizeForm() {
            const lo = getLoc();
            const scope = lo.scope || 'library';
            const key = lo.key || '';
            const api = L();
            const stats = api?.scopeStats?.(scope, key) || { online: 0, notLocal: 0, alreadyLocal: 0, missingLocal: 0 };
            const lastDir = api?.getScopeDir?.(scope, key) || api?.lastDir?.() || '';
            const scopeLabel = scope === 'library' ? 'Entire Music Library'
                : scope === 'group' ? `Group "${key}"`
                    : scope === 'folder' ? `Folder "${key}"`
                        : `Track "${(findItem('music', key) || {}).title || ''}"`;
            const forceOnly = stats.notLocal === 0 && stats.alreadyLocal > 0;
            const canRun = stats.notLocal > 0 || stats.alreadyLocal > 0 || scope === 'group';
            const count = forceOnly ? stats.alreadyLocal : stats.notLocal;
            const forceField = forceOnly
                ? `<input type="hidden" name="force" value="1">`
                : (stats.alreadyLocal > 0
                    ? `<label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:#cbd5e1; margin-top:6px;"><input type="checkbox" name="force" value="1"> Also re-download ${stats.alreadyLocal} already-local (refresh deleted copies)</label>`
                    : '');
            // Group scope offers the three localization classes (see localizeGroup for the rules).
            const modeField = scope === 'group'
                ? `<label style="display:flex; flex-direction:column; gap:2px; font-size:0.8rem; color:#cbd5e1; margin-top:4px;"><span>Group localization mode</span><select name="mode" style="padding:4px 6px; border-radius:8px;"><option value="link">Reuse — folder copies stay 1st; already-local songs get a shortcut (no duplicate files)</option><option value="smart">Fresh — folder copies stay 1st; every other song downloads into this group's path</option><option value="dup">Duplicate — own copy of every song here (track keeps both physical paths)</option></select></label>`
                : '';
            const btnLabel = forceOnly ? `Re-localize (${count})` : (scope === 'group' ? 'Localize Group' : `Start Localizing (${count})`);
            const note = (canRun || scope === 'group')
                ? `${scopeLabel} — ${stats.notLocal} new${stats.alreadyLocal ? `, ${stats.alreadyLocal} already local` : ''}`
                : `${scopeLabel} — nothing to localize (no online tracks).`;
            const mo = getMissing();
            const isMissingOpen = mo.open && mo.scope === scope && mo.key === key;
            const missingTracks = (api?.collectScope?.(scope, key) || []).filter((it) => it.missingLocal === true);
            const missingListBlock = (isMissingOpen && missingTracks.length > 0) ? `<div class="audioflix-missing-tracks-box" style="margin-top:6px; padding:8px 10px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); border-radius:8px; font-size:0.78rem; max-height:140px; overflow-y:auto;"><div style="font-weight:700; margin-bottom:4px; color:#f87171;">Missing Files (${missingTracks.length}):</div>${missingTracks.map((it) => `<div style="padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;"><strong style="color:#f8fafc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(it.title)}</strong><span style="color:#cbd5e1; font-family:monospace; font-size:0.72rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%;" title="${esc(it.localPath || '')}">${esc(it.localPath || '')}</span></div>`).join('')}</div>` : '';
            const missingWarning = stats.missingLocal > 0
                ? `<div style="margin-top:4px; color:#f87171; font-size:0.8rem; font-weight:600; display:flex; align-items:center; gap:8px;"><span>⚠️ ${stats.missingLocal} track file${stats.missingLocal === 1 ? '' : 's'} missing on disk (deleted). Ready to re-download.</span><button type="button" class="audioflix-add-toggle${isMissingOpen ? ' is-active' : ''}" data-af-action="toggle-missing-list" data-af-scope="${esc(scope)}" data-af-key="${esc(key)}" style="background:rgba(248,113,113,0.18); color:#f87171; border:1px solid rgba(248,113,113,0.4); font-size:0.75rem; padding:2px 8px; border-radius:12px; white-space:nowrap; cursor:pointer;" title="View list of missing track names">📋 ${isMissingOpen ? 'Hide Missing' : 'View Missing'}</button></div>${missingListBlock}`
                : '';
            const btnStyle = `font-size:0.8rem; padding:5px 12px; height:32px; white-space:nowrap; border-radius:16px;`;
            const auditBtn = `<button type="button" class="audioflix-add-toggle" data-af-action="audit-scope-disk" data-af-scope="${esc(scope)}" data-af-key="${esc(key)}" style="${btnStyle} background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.35);" title="Scan the folder on PC to check if files were deleted outside EveOS">🔍 Verify Files</button>`;
            const recalibrateBtn = `<button type="button" class="audioflix-add-toggle" data-af-action="recalibrate-scope-path" data-af-scope="${esc(scope)}" data-af-key="${esc(key)}" style="${btnStyle} background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.35);" title="Re-link local files to this path without re-downloading">🔄 Recalibrate Path</button>`;
            return `<form class="audioflix-form audioflix-localize-panel-form" data-af-form="localize-form" data-af-scope="${esc(scope)}" data-af-key="${esc(key)}" style="display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:12px; background:rgba(0,0,0,0.25);">
                <label class="audioflix-wide-field" style="width:100%;"><span>Target Local Folder Path (on PC)</span><input name="targetDir" required value="${esc(lastDir)}" placeholder="e.g. C:\\Music\\EveOS or /home/you/Music" style="width:100%; box-sizing:border-box;"></label>
                ${modeField}
                ${forceField}
                ${missingWarning}
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:4px;">
                    <button type="submit" data-af-action="submit-form" ${canRun ? '' : 'disabled'} style="${btnStyle}">${btnLabel}</button>
                    ${recalibrateBtn}
                    ${auditBtn}
                </div>
                <div style="font-size:0.78rem; color:#94a3b8; font-weight:500; margin-top:2px;">${esc(note)}</div>
            </form>`;
        }

        function renderMusicPortForm() {
            const lastDir = L()?.lastDir?.() || '';
            return `<form class="audioflix-form" data-af-form="music-port-form">
                <label class="audioflix-wide-field"><span>Local Folder Path (Extract Music)</span><input name="path" required value="${esc(lastDir)}" placeholder="C:\\path\\to\\music\\folder"></label>
                <label><span>Target Folder Tag Name</span><input name="folder" placeholder="Ported Music"></label>
                <button type="submit" data-af-action="submit-form">Extract to Folder Tag</button>
            </form>`;
        }

        // A group's connected localization paths: 1st-class folder files of its members, and the
        // group's own files/shortcuts. Shown alongside the group's main path, not replacing it.
        function renderGroupPaths(groupKey) {
            const po = getPaths();
            if (!po.open || po.key !== groupKey) return '';
            const data = L()?.groupLocalizationPaths?.(groupKey) || { firstClass: [], groupPaths: [], groupDir: '' };
            const row = (label, path, tag, color) => `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.06);"><span style="color:#f8fafc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(label)} <em style="color:${color}; font-style:normal; font-size:0.7rem;">${tag}</em></span><span style="color:#cbd5e1; font-family:monospace; font-size:0.7rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:52%;" title="${esc(path)}">${esc(path)}</span></div>`;
            const first = data.firstClass.map((e) => row(e.title, e.path, `1st · folder ${e.source}`, '#38bdf8')).join('');
            const grp = data.groupPaths.map((e) => row(e.title, e.path, e.kind === 'shortcut' ? '3rd · shortcut' : '2nd · group', e.kind === 'shortcut' ? '#c084fc' : '#34d399')).join('');
            const body = (first || grp) || '<div style="color:#94a3b8;">No localizations connected to this group yet.</div>';
            return `<div class="audioflix-group-paths-box" style="margin-top:6px; padding:8px 10px; background:rgba(15,23,42,0.5); border:1px solid rgba(148,163,184,0.25); border-radius:8px; font-size:0.78rem;"><div style="font-weight:700; margin-bottom:4px; color:#93c5fd;">Connected Paths — group dir: <span style="font-family:monospace; color:#cbd5e1;">${esc(data.groupDir || '(none)')}</span></div>${first ? `<div style="color:#38bdf8; font-weight:600; margin-top:4px;">1st class (folder)</div>${first}` : ''}${grp ? `<div style="color:#34d399; font-weight:600; margin-top:4px;">Group (2nd class / shortcuts)</div>${grp}` : ''}${(!first && !grp) ? body : ''}</div>`;
        }

        // The track settings panel's localization list, most-important class first.
        function renderSongLocalizations(track) {
            const list = L()?.songLocalizationList?.(track) || [];
            if (!list.length) return '';
            const color = (kind, label) => label.startsWith('Folder') ? '#38bdf8' : kind === 'shortcut' ? '#c084fc' : '#34d399';
            const rows = list.map((e, i) => `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:3px 0; ${i ? 'border-top:1px solid rgba(255,255,255,0.06);' : ''}"><span style="color:${color(e.kind, e.label)}; font-weight:600; white-space:nowrap;">${i === 0 ? '★ ' : ''}${esc(e.label)}</span><span style="color:#cbd5e1; font-family:monospace; font-size:0.72rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60%;" title="${esc(e.path)}">${esc(e.path)}</span></div>`).join('');
            return `<div class="audioflix-info-url-container"><span>Localizations (★ = plays first)</span><div style="padding:6px 10px; background:rgba(0,0,0,0.25); border-radius:8px;">${rows}</div></div>`;
        }

        return { renderLocalizeForm, renderMusicPortForm, renderGroupPaths, renderSongLocalizations };
    };

    ns.ready = true;
})();
