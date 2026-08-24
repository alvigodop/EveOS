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
        const rows = tracks.map((item, index) => `<li class="audioflix-instagram-source-row"><span class="audioflix-instagram-source-index">${index + 1}</span><div class="audioflix-instagram-source-body"><strong title="${esc(item.title || '')}">${esc(item.title || 'Untitled Instagram Video')}</strong><input type="url" name="link" value="${esc(item.url || '')}" aria-label="URL for ${esc(item.title || 'this video')}" spellcheck="false"></div><a href="${esc(item.url || '')}" target="_blank" rel="noopener">Open</a></li>`).join('');
        const addField = `<label class="audioflix-wide-field audioflix-instagram-add"><span>Add more videos</span><textarea name="link" rows="2" placeholder="One URL per line"></textarea></label>`;
        const named = tracks.filter((item) => !/^instagram\s+(reel|video)\s*\d*$/i.test(String(item.title || '').trim())).length;
        const naming = named === tracks.length ? 'All items named.' : `${tracks.length - named} still unnamed — Refresh metadata pulls public Instagram metadata when available.`;
        return `<section class="audioflix-instagram-source" style="margin-top:6px;"><header><div><strong>Instagram collection source</strong><small>${tracks.length} imported item${tracks.length === 1 ? '' : 's'} · ${esc(naming)}</small></div><button type="button" data-af-action="instagram-sync" data-af-group="${esc(group)}">Refresh metadata</button></header><form class="audioflix-form audioflix-instagram-link-form" data-af-form="playlist-link-form" data-af-group="${esc(group)}"><ol class="audioflix-instagram-source-list">${rows}</ol>${addField}<div class="audioflix-instagram-source-actions"><button type="submit" data-af-action="submit-form">Save Source</button><button type="button" data-af-action="toggle-playlist-link-form" data-af-group="${esc(group)}">Close</button></div></form></section>`;
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
                        instagramFolder: ctx.importFormValues?.instagramFolder || 'IG Video Playlists',
                        instagramStatus: `Loaded ${file.name}. Review the group title, then import.`
                    });
                    ctx.rerender();
                }, { once: true });
                picker.click();
                return true;
            }
            if (action === 'instagram-sync') {
                const group = target.dataset.afGroup || '';
                ctx.playbackStatus = `Refreshing Instagram collection "${group}"...`;
                ctx.rerender();
                const result = await window.EveAudioflixPlaylists?.syncPlaylistByGroup?.(group, true);
                ctx.playbackStatus = result?.ok ? `Refreshed "${group}" - ${result.added || 0} added, ${result.missing || 0} missing.` : (result?.reason || 'Instagram refresh failed.');
                ctx.rerender();
                return true;
            }
            return false;
        };
    }

    Object.assign(ns, { ready: true, renderLinkForm, createActions });
})();
