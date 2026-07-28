window.EveAudioflixNativeSpotify = window.EveAudioflixNativeSpotify || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixNativeSpotify;
    if (ns.ready) return;

    function create({ fetchJson }) {
        async function listSpotifyPlaylist(playlistUrl, force = false) {
            if (!playlistUrl) return { ok: false, reason: 'Missing Spotify playlist URL' };
            const refresh = force ? '&refresh=1' : '';
            return fetchJson(`/api/audioflix/spotify-playlist?url=${encodeURIComponent(playlistUrl)}${refresh}`, {
                method: 'GET',
                timeout: 180000,
                probe: force === true
            });
        }

        async function openSpotifySession(playlistUrl) {
            if (!playlistUrl) return { ok: false, reason: 'Missing Spotify playlist URL' };
            return fetchJson('/api/audioflix/spotify-session', {
                method: 'POST',
                body: JSON.stringify({ url: playlistUrl }),
                timeout: 8000,
                probe: true
            });
        }

        return { listSpotifyPlaylist, openSpotifySession };
    }

    Object.assign(ns, { ready: true, create });
})();
