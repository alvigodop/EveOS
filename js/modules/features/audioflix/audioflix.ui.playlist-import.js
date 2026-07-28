window.EveAudioflixPlaylistImportUi = window.EveAudioflixPlaylistImportUi || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixPlaylistImportUi;
    if (ns.ready) return;

    function modeSelector(mode) {
        const button = (value, label) => `<button type="button" class="audioflix-scope-pill${mode === value ? ' is-active' : ''}" data-af-action="select-playlist-mode" data-af-mode="${value}">${label}</button>`;
        return `<div class="audioflix-playlist-mode-row"><span>Import Mode:</span>${button('youtube', 'YouTube Playlist')}${button('wpl', 'WPL Playlist')}${button('spotify', 'Spotify Playlist')}</div>`;
    }

    function render({ mode = 'youtube', esc, values = {}, state = {} }) {
        const selector = modeSelector(mode);
        if (mode === 'wpl') {
            const urlValue = esc(values.wplUrl || '');
            return `<form class="audioflix-form" data-af-form="import-playlist" data-af-mode="wpl">${selector}<label class="audioflix-wide-field"><span>WPL Playlist File Path or Browse</span><div class="audioflix-inline-field"><input name="url" required placeholder="C:\\path\\to\\playlist.wpl" value="${urlValue}"><button type="button" class="audioflix-add-toggle" data-af-action="trigger-wpl-file-picker" title="Select .wpl file from your computer">Browse File</button></div></label><label><span>Target Folder</span><input name="folder" placeholder="WPL Playlists"></label><button type="submit" data-af-action="submit-form">Import WPL Playlist</button></form>`;
        }
        if (mode === 'spotify') {
            return `<form class="audioflix-form" data-af-form="import-playlist" data-af-mode="spotify">${selector}<label class="audioflix-wide-field"><span>Spotify playlist URL, embed URL, or iframe snippet</span><textarea name="url" rows="3" required placeholder="https://open.spotify.com/playlist/..."></textarea></label><label><span>Target Folder</span><input name="folder" placeholder="Spotify Playlists"></label><button type="submit" data-af-action="submit-form">Import Spotify Playlist</button><button type="button" data-af-action="spotify-session-import">Open Saved Session</button><small class="audioflix-wide-field">Metadata extraction needs the local EveOS server. Imported rows remain available in file:// after they are saved.</small></form>`;
        }

        const count = (state.musicPlaylists || []).filter((entry) => entry.provider !== 'wpl').length;
        const syncAll = count ? '<button type="button" class="audioflix-add-toggle" data-af-action="sync-all-playlists" title="Re-read all upstream playlists">Sync All Playlists</button>' : '';
        return `<form class="audioflix-form" data-af-form="import-playlist" data-af-mode="youtube">${selector}<label class="audioflix-wide-field"><span>Playlist URL</span><input name="url" required placeholder="https://youtube.com/playlist?list=..."></label><label><span>Target Folder</span><input name="folder" placeholder="Youtube Playlists"></label><button type="submit" data-af-action="submit-form">Import Playlist</button>${syncAll}</form>`;
    }

    Object.assign(ns, { ready: true, render });
})();
