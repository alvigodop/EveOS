// Spotify playlist provider adapter. Extraction runs through the local EveOS bridge because the
// browser cannot reliably enumerate a full playlist iframe and Spotify's Web API requires auth.
window.EveAudioflixSpotify = window.EveAudioflixSpotify || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSpotify;
    if (ns.ready) return;

    const text = (value) => String(value ?? '').trim();
    const PLAYLIST_RE = /https?:\/\/open\.spotify\.com\/(?:embed\/)?playlist\/([A-Za-z0-9]+)(?:\?[^"'<>\s]+)?/i;

    function normalizeInput(value) {
        const raw = text(value)
            .replace(/&amp;/gi, '&')
            .replace(/&#x2F;/gi, '/')
            .replace(/&quot;/gi, '"');
        const match = raw.match(PLAYLIST_RE);
        if (!match) return { ok: false, reason: 'Enter a public Spotify playlist URL, embed URL, or iframe snippet.' };
        const playlistId = match[1];
        let query = '';
        try {
            query = new URL(match[0]).search;
        } catch {}
        return {
            ok: true,
            playlistId,
            // Preserve Spotify share parameters, especially pt= for private playlist access.
            // Stripping them leaves only the playlist shell visible and hides the song rows.
            url: `https://open.spotify.com/playlist/${playlistId}${query}`,
            embedUrl: `https://open.spotify.com/embed/playlist/${playlistId}${query}`
        };
    }

    function isSpotify(value) {
        return PLAYLIST_RE.test(text(value));
    }

    async function fetchPlaylist(value, force = true) {
        const normalized = normalizeInput(value);
        if (!normalized.ok) return normalized;
        const result = await window.EveAudioflixNative?.listSpotifyPlaylist?.(normalized.url, force);
        return result?.ok ? { ...result, ...normalized, provider: 'spotify' } : result;
    }

    async function openSession(value) {
        const normalized = normalizeInput(value);
        if (!normalized.ok) return normalized;
        return window.EveAudioflixNative?.openSpotifySession?.(normalized.url);
    }

    // One extracted playlist row -> AudioFlix fields. Rows are media items, not just tracks:
    // track | episode | local | unknown. Never invent a track ID or an open.spotify.com URL for
    // an episode or a Spotify-local file; keep what Spotify exposed and mark it metadata-only.
    function entryPatch(entry = {}) {
        const schema = window.EveAudioflixStateSchema;
        const declared = text(entry.mediaType).toLowerCase();
        const ref = schema?.spotifyRef?.(entry.uri || entry.spotifyUri || entry.url)
            || (declared === 'track' || !declared ? schema?.spotifyRef?.(entry.spotifyTrackId || entry.id ? `spotify:track:${entry.spotifyTrackId || entry.id}` : '') : null);
        const mediaType = ['track', 'episode', 'local', 'unknown'].includes(declared) ? declared : (ref?.type || 'unknown');
        const mediaId = ref && ref.type === mediaType ? ref.id : '';
        const unavailable = entry.available === false || entry.playable === false;
        const patch = {
            album: text(entry.album),
            image: text(entry.image),
            explicit: entry.explicit === true,
            sourceProvider: 'spotify',
            sourceMediaType: mediaType,
            sourceMediaId: mediaId,
            sourceUri: mediaId ? `spotify:${mediaType}:${mediaId}` : text(entry.uri),
            sourceIsLocal: mediaType === 'local',
            sourceAvailability: unavailable ? 'unavailable' : (mediaType === 'track' && mediaId ? 'playable' : 'metadata-only'),
            spotifyTrackId: mediaType === 'track' ? mediaId : '',
            spotifyUri: mediaType === 'track' && mediaId ? `spotify:track:${mediaId}` : '',
            isrc: text(entry.isrc || entry.external_ids?.isrc || entry.externalIds?.isrc),
            playlistPosition: Math.max(0, Number(entry.position || 0) || 0)
        };
        // Episodes carry their show as the artist line so cards stay readable.
        if (mediaType === 'episode' && !text(entry.artist) && text(entry.show)) patch.artist = text(entry.show);
        return patch;
    }

    function connectionPatch(payload = {}) {
        const source = text(payload.scrapeSource);
        const patch = {
            playlistId: text(payload.playlistId),
            owner: text(payload.owner),
            description: text(payload.description),
            image: text(payload.image),
            embedUrl: text(payload.embedUrl)
        };
        if (source) patch.scrapeSource = payload.cached ? `${source}-cache` : source;
        return patch;
    }

    Object.assign(ns, {
        ready: true,
        normalizeInput,
        isSpotify,
        fetchPlaylist,
        openSession,
        entryPatch,
        connectionPatch
    });
    window.EveAudioflixPlaylistProviders?.register?.('spotify', {
        label: 'Spotify',
        detect: isSpotify,
        normalize: normalizeInput,
        fetchPlaylist,
        entryPatch,
        connectionPatch
    });
})();
