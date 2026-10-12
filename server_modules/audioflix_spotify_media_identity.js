'use strict';

function parseMedia(value, hint = '') {
    const raw = String(value || '').trim(), kindHint = String(hint || '').toLowerCase();
    if (kindHint && !['track', 'episode'].includes(kindHint)) return null;
    let kind, id;
    if (/^[A-Za-z0-9]{22}$/.test(raw)) { kind = kindHint || 'track'; id = raw; }
    else {
        let match = raw.match(/^spotify:(track|episode):([A-Za-z0-9]{22})$/i);
        if (!match) {
            try {
                const url = new URL(raw);
                if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'open.spotify.com') return null;
                match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|episode)\/([A-Za-z0-9]{22})\/?$/i);
            } catch { return null; }
        }
        if (!match) return null;
        kind = match[1].toLowerCase(); id = match[2];
        if (kindHint && kindHint !== kind) return null;
    }
    return { spotifyId: id, mediaType: kind, spotifyUri: `spotify:${kind}:${id}` };
}

function fromPayload(body = {}) {
    const keys = ['spotifyUri', 'uri', 'sourceUri', 'url', 'spotifyUrl', 'originalUrl', 'spotifyId', 'trackId', 'sourceMediaId', 'spotifyTrackId'];
    const hints = ['mediaType', 'sourceMediaType'].filter(key => body[key]).map(key => String(body[key]).trim().toLowerCase());
    if (body.sourceIsLocal === true || hints.some(hint => !['track', 'episode'].includes(hint)) || new Set(hints).size > 1) {
        throw new Error('A consistent remote Spotify media identity is required.');
    }
    const supplied = keys.filter(key => body[key]);
    if (!supplied.length) return null;
    const identity = parseMedia(body[supplied[0]], hints[0]);
    if (!identity || (body.spotifyTrackId && identity.mediaType !== 'track')
        || supplied.some(key => parseMedia(body[key], identity.mediaType)?.spotifyUri !== identity.spotifyUri)) {
        throw new Error('A consistent remote Spotify media identity is required.');
    }
    return identity;
}

function mediaKey(state = {}) {
    try { return fromPayload({ spotifyId: state.spotifyId, spotifyUri: state.spotifyUri, mediaType: state.mediaType })?.spotifyUri || ''; }
    catch { return ''; }
}

function normalizeTrackId(value) {
    const media = parseMedia(value);
    return media?.mediaType === 'track' ? media.spotifyId : '';
}

function isSpotifyEmbedUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'open.spotify.com'
            && parsed.pathname.startsWith('/embed/');
    } catch { return false; }
}

function spotifyFrameTrackId(value) {
    if (!isSpotifyEmbedUrl(value)) return '';
    return normalizeTrackId(value);
}

function playingTrackIds(snapshots) {
    return [...new Set((Array.isArray(snapshots) ? snapshots : [])
        .filter(item => Number(item?.playingCount || 0) > 0)
        .map(item => String(item?.trackId || '')).filter(Boolean))];
}

module.exports = { parseMedia, fromPayload, mediaKey, normalizeTrackId, isSpotifyEmbedUrl,
    spotifyFrameTrackId, playingTrackIds };
