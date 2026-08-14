window.EveAudioflixInstagramUi = window.EveAudioflixInstagramUi || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixInstagramUi;
    if (ns.ready) return;

    const stripExt = (name) => String(name || '').replace(/\.[^.]+$/, '').trim();

    function renderLinkForm(group, connection, { esc, state }) {
        const tracks = (state().music || [])
            .filter((item) => item.playlistId === connection.id)
            .sort((a, b) => Number(a.playlistPosition || 0) - Number(b.playlistPosition || 0));
        const rows = tracks.map((item, index) => `<li><span>${index + 1}. ${esc(item.title || 'Instagram Reel')}</span><a href="${esc(item.url || '')}" target="_blank" rel="noopener">Open Reel</a></li>`).join('');
        return `<section class="audioflix-instagram-source" style="margin-top:6px;"><header><div><strong>Reel collection source</strong><small>${tracks.length} imported item${tracks.length === 1 ? '' : 's'}</small></div><button type="button" data-af-action="instagram-sync" data-af-group="${esc(group)}">Refresh metadata</button></header><form class="audioflix-form audioflix-instagram-link-form" data-af-form="playlist-link-form" data-af-group="${esc(group)}"><label class="audioflix-wide-field"><span>Editable Reel URLs</span><textarea name="link" rows="6" required>${esc(connection.url || '')}</textarea><small>One URL per line. Saving updates the source; Refresh metadata reconciles the items.</small></label><button type="submit" data-af-action="submit-form">Save Source</button><button type="button" data-af-action="toggle-playlist-link-form" data-af-group="${esc(group)}">Close</button></form><ol class="audioflix-instagram-source-list">${rows}</ol></section>`;
    }

    function createActions(ctx) {
        return async function handleInstagramAction(target, action) {
            if (action === 'instagram-collection-file') {
                const picker = document.createElement('input');
                picker.type = 'file';
                picker.accept = '.txt,text/plain';
                picker.addEventListener('change', async () => {
                    const file = picker.files?.[0];
                    if (!file) return;
                    ctx.importFormValues = Object.assign({}, ctx.importFormValues, {
                        instagramUrl: await file.text(),
                        instagramGroup: stripExt(file.name),
                        instagramFolder: ctx.importFormValues?.instagramFolder || 'IG Reel Playlists',
                        instagramStatus: `Loaded ${file.name}. Review the group title, then import.`
                    });
                    ctx.rerender();
                }, { once: true });
                picker.click();
                return true;
            }
            if (action === 'instagram-sync') {
                const group = target.dataset.afGroup || '';
                ctx.playbackStatus = `Refreshing Reel collection "${group}"...`;
                ctx.rerender();
                const result = await window.EveAudioflixPlaylists?.syncPlaylistByGroup?.(group, true);
                ctx.playbackStatus = result?.ok
                    ? `Refreshed "${group}" - ${result.added || 0} added, ${result.missing || 0} missing.`
                    : (result?.reason || 'Reel refresh failed.');
                ctx.rerender();
                return true;
            }
            return false;
        };
    }

    Object.assign(ns, { ready: true, renderLinkForm, createActions });
})();
