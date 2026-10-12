// Pure Spotify playback identity; track and episode IDs occupy different namespaces.
// Untyped bare IDs are legacy tracks. Spotify-local rows are never remote media.
(function () {
    'use strict';
    const ns = window.EveAudioflixSpotifyMedia = window.EveAudioflixSpotifyMedia || {};
    if (ns.ready) return;
    const text = value => String(value ?? '').trim();
    function parse(value, hint = '') {
        const raw = text(value), type = text(hint).toLowerCase();
        if (type && !['track', 'episode'].includes(type)) return null;
        let match = raw.match(/^spotify:(track|episode):([A-Za-z0-9]{22})$/i);
        if (!match) match = raw.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|episode)\/([A-Za-z0-9]{22})\/?(?:[?#].*)?$/i);
        if (match) return type && type !== match[1].toLowerCase() ? null
            : { spotifyId: match[2], spotifyUri: `spotify:${match[1].toLowerCase()}:${match[2]}`, mediaType: match[1].toLowerCase() };
        return /^[A-Za-z0-9]{22}$/.test(raw)
            ? { spotifyId: raw, spotifyUri: `spotify:${type || 'track'}:${raw}`, mediaType: type || 'track' } : null;
    }
    function fromPayload(payload = {}) {
        const type = text(payload.mediaType).toLowerCase();
        if (type && !['track', 'episode'].includes(type)) return null;
        const value = text(payload.spotifyUri || payload.uri || payload.url);
        const identity = parse(value || payload.spotifyId, type);
        if (!identity || (type && type !== identity.mediaType)) return null;
        if (text(payload.spotifyId) && text(payload.spotifyId) !== identity.spotifyId) return null;
        for (const candidate of [payload.spotifyUri, payload.uri, payload.url]) {
            if (text(candidate) && parse(candidate, identity.mediaType)?.spotifyUri !== identity.spotifyUri) return null;
        }
        return identity;
    }
    function fromItem(item = {}) {
        const type = text(item.sourceMediaType).toLowerCase();
        if (item.sourceIsLocal === true || (type && !['track', 'episode'].includes(type))) return null;
        const value = text(item.sourceUri || item.spotifyUri || item.spotifyUrl || item.url || item.originalUrl);
        const id = text(item.sourceMediaId || item.spotifyTrackId);
        if (text(item.sourceProvider).toLowerCase() !== 'spotify' && !item.spotifyTrackId && !item.spotifyUri && !item.spotifyUrl
            && !/^spotify:(track|episode):|^https?:\/\/open\.spotify\.com\//i.test(value)) return null;
        const identity = value ? parse(value) : type && id ? parse(`spotify:${type}:${id}`) : parse(id);
        if (!identity || (type && type !== identity.mediaType)) return null;
        if (text(item.sourceMediaId) && text(item.sourceMediaId) !== identity.spotifyId) return null;
        for (const candidate of [item.sourceUri, item.spotifyUri, item.spotifyUrl, item.url, item.originalUrl]) {
            const other = parse(candidate);
            if (other && other.spotifyUri !== identity.spotifyUri) return null;
        }
        return identity;
    }
    function matches(state, expected) {
        const actual = fromPayload(state);
        return !!actual && !!expected && actual.spotifyUri === expected.spotifyUri;
    }
    Object.assign(ns, { ready: true, parse, fromPayload, fromItem, matches,
        trackId(value) { const identity = parse(value); return identity?.mediaType === 'track' ? identity.spotifyId : ''; } });
})();
