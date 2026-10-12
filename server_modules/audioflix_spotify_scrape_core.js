'use strict';

const crypto = require('node:crypto');

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const durationSeconds = (value) => {
    const parts = clean(value).split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
};
const trackId = (value) => clean(value).match(/(?:spotify:track:|\/track\/)([A-Za-z0-9]{10,})/)?.[1] || '';
// Playlist rows are media items: track, podcast episode, or a Spotify-local file. Track and
// episode IDs are separate namespaces, so a ref always carries its type.
const mediaRef = (value) => {
    const raw = clean(value);
    const local = raw.match(/spotify:local:[^\s"'<>]+/)?.[0];
    if (local) return { type: 'local', id: local, uri: local };
    const match = raw.match(/(?:spotify:(track|episode):|\/(track|episode)\/)([A-Za-z0-9]{10,})/);
    if (!match) return null;
    const type = match[1] || match[2];
    return { type, id: match[3], uri: `spotify:${type}:${match[3]}` };
};
const mediaUrl = (type, id) => (type === 'track' || type === 'episode') && id ? `https://open.spotify.com/${type}/${id}` : '';
// Local URIs look like spotify:local:Artist:Album:Title:seconds (URL-encoded, + for spaces).
function localUriMetadata(uri) {
    const parts = clean(uri).replace(/^spotify:local:/, '').split(':')
        .map((part) => { try { return decodeURIComponent(part.replace(/\+/g, ' ')); } catch { return part; } });
    if (parts.length < 4) return {};
    return { artist: clean(parts[0]), album: clean(parts[1]), title: clean(parts[2]), duration: Number(parts[3]) || 0 };
}
const playlistIdFromUrl = (value) => clean(value).match(/playlist\/([A-Za-z0-9]+)/)?.[1] || '';
const matchKey = (value) => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Tracks keep their bare ID as sourceId (existing libraries reconcile on it). Episodes and
// locals are namespaced so they can never collide with a track that happens to share an ID.
const stableId = (row, position) => {
    const type = row.mediaType || mediaRef(row.uri || row.url)?.type || '';
    const id = trackId(row.url || row.uri) || (type === 'track' ? clean(row.id) : '');
    if (id) return id;
    if (type === 'episode') { const ep = clean(row.id) || mediaRef(row.uri || row.url)?.id; if (ep) return `episode:${ep}`; }
    if (type === 'local' && clean(row.uri)) return `local:${crypto.createHash('sha1').update(clean(row.uri)).digest('hex').slice(0, 22)}`;
    return crypto.createHash('sha1').update(`${row.title}|${row.artist}|${position}`).digest('hex').slice(0, 22);
};

const playlistCount = (value) => {
    const text = clean(value);
    const summary = text.match(/\b([\d,]+)\s+(?:songs?|tracks?|items?|episodes?)\s*,?\s*(?:about\s+)?(?:(?:\d+\s*(?:hr|hrs|hours?))(?:\s+\d+\s*(?:min|mins|minutes?))?|(?:\d+\s*(?:min|mins|minutes?)))\b/i);
    if (!summary) return 0;
    const count = Number(summary[1].replace(/,/g, ''));
    return Number.isFinite(count) && count > 0 ? count : 0;
};
const isEmbedPlaylistUrl = (value) => /open\.spotify\.com\/embed\/playlist\//i.test(clean(value));
const fullPlaylistUrl = (value) => {
    const id = playlistIdFromUrl(value);
    return id ? `https://open.spotify.com/playlist/${id}` : clean(value);
};
const needsFullPlayerPromotion = (value, expectedCount = 0, capturedCount = 0) => (
    isEmbedPlaylistUrl(value)
    && (Number(expectedCount) > 100 || (!Number(expectedCount) && Number(capturedCount) >= 100))
);
const assessPlaylistCompleteness = (expectedCount = 0, capturedCount = 0) => {
    const expected = Math.max(0, Number(expectedCount) || 0);
    const captured = Math.max(0, Number(capturedCount) || 0);
    if (!expected || captured >= expected) {
        return { ok: true, expectedCount: expected, capturedCount: captured, unexposedCount: 0 };
    }
    const shortfall = expected - captured;
    const tolerance = Math.min(3, Math.max(1, Math.ceil(expected * 0.02)));
    const singleUnavailable = captured > 0 && shortfall === 1;
    const nearComplete = captured > 0 && captured / expected >= 0.97 && shortfall <= tolerance;
    const acceptable = singleUnavailable || nearComplete;
    return {
        ok: acceptable,
        expectedCount: expected,
        capturedCount: captured,
        unexposedCount: acceptable ? shortfall : 0,
        shortfall
    };
};
const shouldPromoteEmbedAfterScan = (value, expectedCount = 0, capturedCount = 0) => {
    if (!isEmbedPlaylistUrl(value)) return false;
    const captured = Math.max(0, Number(capturedCount) || 0);
    if (!captured) return true;
    if (needsFullPlayerPromotion(value, expectedCount, captured)) return true;
    const expected = Math.max(0, Number(expectedCount) || 0);
    return expected > 0 && !assessPlaylistCompleteness(expected, captured).ok;
};

function requestMentionsPlaylist(url = '', postData = '', playlistId = '') {
    if (!playlistId) return false;
    const values = [url, postData].map((value) => {
        const raw = String(value || '');
        try { return `${raw}\n${decodeURIComponent(raw)}`; } catch { return raw; }
    });
    const haystack = values.join('\n');
    return haystack.includes(playlistId)
        || haystack.includes(`spotify:playlist:${playlistId}`)
        || haystack.includes(`/playlist/${playlistId}`);
}

function mergeTrack(base = {}, overlay = {}) {
    base = base && typeof base === 'object' ? base : {};
    overlay = overlay && typeof overlay === 'object' ? overlay : {};
    const artists = overlay.artists?.length ? overlay.artists : (base.artists || []);
    const durationMs = Number(overlay.durationMs || base.durationMs || 0);
    const known = (value) => value && value !== 'unknown' ? value : '';
    const mediaType = known(overlay.mediaType) || known(base.mediaType)
        || mediaRef(overlay.uri || overlay.url || base.uri || base.url)?.type || (overlay.mediaType || base.mediaType || '');
    const id = overlay.id || base.id || mediaRef(overlay.url || base.url)?.id || trackId(overlay.url || base.url);
    const uri = clean(overlay.uri || base.uri) || (mediaType && mediaType !== 'local' && mediaType !== 'unknown' && id ? `spotify:${mediaType}:${id}` : '');
    const fallbackUrl = mediaType ? mediaUrl(mediaType, id) : (id ? `https://open.spotify.com/track/${id}` : '');
    return {
        id,
        mediaType: mediaType || 'track',
        uri,
        show: clean(overlay.show || base.show),
        available: overlay.available === false || base.available === false ? false : undefined,
        title: clean(overlay.title || overlay.name || base.title || base.name || 'Unknown track'),
        artists: [...new Set(artists.map(clean).filter(Boolean))],
        artist: clean(artists.join(', ')),
        album: clean(overlay.album || base.album),
        image: clean(overlay.image || base.image),
        duration: durationMs > 0 ? durationMs / 1000 : durationSeconds(overlay.durationText || base.durationText),
        explicit: Boolean(overlay.explicit || base.explicit),
        // Never synthesize a URL for a local file: it has no Spotify page.
        url: mediaType === 'local' ? '' : clean(overlay.url || overlay.spotifyUrl || base.url || base.spotifyUrl || fallbackUrl)
    };
}

function rowIdentity(row = {}) {
    const ref = mediaRef(row.uri || row.url);
    const type = row.mediaType && row.mediaType !== 'unknown' ? row.mediaType : (ref?.type || '');
    // Local files have no stable Spotify ID; the DOM row and the network row meet on metadata.
    const id = type === 'local' ? '' : (clean(row.id) || ref?.id || trackId(row.url || row.uri));
    if (id) return `id:${type || 'track'}:${id}`;
    const title = matchKey(row.title || row.name);
    const artist = matchKey(row.artist || row.artists?.join(' '));
    return title ? `meta:${title}|${artist}` : '';
}

function mergePlaylistRows(domRows = [], networkTracks = new Map(), expectedCount = 0) {
    const networkRows = networkTracks instanceof Map ? [...networkTracks.values()] : [...(networkTracks || [])];
    if (!domRows.length) return expectedCount ? networkRows.slice(0, expectedCount) : networkRows;
    const domHasTrackUrls = domRows.some((row) => Boolean(mediaRef(row?.url || row?.uri)));
    if (!domHasTrackUrls && networkRows.length) {
        const firstDomTitle = matchKey(domRows[0]?.title || domRows[0]?.name);
        const titleAnchor = firstDomTitle
            ? networkRows.findIndex((row) => matchKey(row?.title || row?.name) === firstDomTitle)
            : -1;
        if (titleAnchor >= 0) {
            const available = networkRows.slice(titleAnchor);
            const limit = expectedCount ? Math.min(expectedCount, available.length) : Math.min(domRows.length, available.length);
            const positional = available.slice(0, limit).map((networkRow, index) => {
                const domRow = domRows[index];
                const titlesMatch = domRow && matchKey(domRow.title || domRow.name) === matchKey(networkRow.title || networkRow.name);
                return titlesMatch ? mergeTrack(networkRow, domRow) : networkRow;
            });
            if (positional.length) return positional;
        }
    }
    const networkByIdentity = new Map(networkRows.map((row) => [rowIdentity(row), row]).filter(([key]) => key));
    const enrichedDom = domRows.map((row) => mergeTrack(networkByIdentity.get(rowIdentity(row)), row));
    const firstIdentity = rowIdentity(enrichedDom[0]);
    const anchor = firstIdentity ? networkRows.findIndex((row) => rowIdentity(row) === firstIdentity) : -1;
    if (expectedCount > enrichedDom.length && anchor >= 0 && networkRows.length - anchor >= expectedCount) {
        const domByIdentity = new Map(enrichedDom.map((row) => [rowIdentity(row), row]).filter(([key]) => key));
        return networkRows.slice(anchor, anchor + expectedCount)
            .map((row) => mergeTrack(row, domByIdentity.get(rowIdentity(row))));
    }
    const merged = [...enrichedDom];
    const seen = new Set(merged.map(rowIdentity).filter(Boolean));
    if (anchor >= 0) {
        for (const row of networkRows.slice(anchor)) {
            // The DOM can already hold every row Spotify counted; never append past that count.
            if (expectedCount && merged.length >= expectedCount) break;
            const key = rowIdentity(row);
            if (!key || seen.has(key)) continue;
            merged.push(row); seen.add(key);
            if (expectedCount && merged.length >= expectedCount) break;
        }
    }
    return merged;
}

function scanValue(value, tracks, depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || depth > 14 || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((entry) => scanValue(entry, tracks, depth + 1, seen));
        return;
    }
    const candidates = [
        value.uri, value.trackUri, value.spotifyUri, value.external_urls?.spotify,
        value.externalUrls?.spotify, value.spotifyUrl, value.url, value.href
    ];
    const kind = String(value.type || value.__typename || value.contentType || '').toLowerCase();
    let ref = candidates.map(mediaRef).find(Boolean) || null;
    if (!ref && typeof value.id === 'string' && /^(track|episode|podcastepisode)$/.test(kind)) {
        const type = kind === 'track' ? 'track' : 'episode';
        ref = { type, id: value.id, uri: `spotify:${type}:${value.id}` };
    }
    if (!ref && (value.is_local === true || value.isLocal === true || kind === 'localtrack') && (value.name || value.title)) {
        const uri = clean(value.uri) || `spotify:local:${encodeURIComponent(clean(value.name || value.title))}`;
        ref = { type: 'local', id: uri, uri };
    }
    // Containers (playlist items wrapper, show) carry the ref only through a child; skip shells
    // that merely link to a show/album without naming a playable item.
    if (ref && !(value.name || value.title || value.trackName) && ref.type !== 'track') ref = null;
    const id = ref?.type === 'track' ? ref.id : '';
    if (ref && ref.type !== 'track') {
        const localMeta = ref.type === 'local' ? localUriMetadata(ref.uri) : {};
        const show = value.podcastV2?.data?.name || value.podcast?.name || value.show?.name || '';
        const images = value.coverArt?.sources || value.images || value.podcastV2?.data?.coverArt?.sources || [];
        const key = `${ref.type}:${ref.id}`;
        tracks.set(key, mergeTrack(tracks.get(key), {
            id: ref.type === 'episode' ? ref.id : '',
            mediaType: ref.type,
            uri: ref.uri,
            title: value.name || value.title || localMeta.title,
            artists: ref.type === 'episode' ? (show ? [show] : []) : [value.artists?.[0]?.name || localMeta.artist].filter(Boolean),
            show,
            album: value.album?.name || localMeta.album,
            image: (Array.isArray(images) ? images : []).map((entry) => entry?.url).find(Boolean) || '',
            durationMs: value.duration_ms || value.durationMs || value.duration?.totalMilliseconds || (localMeta.duration ? localMeta.duration * 1000 : 0),
            explicit: value.explicit || value.contentRating?.label === 'EXPLICIT',
            available: value.playability?.playable === false ? false : undefined,
            url: mediaUrl(ref.type, ref.id)
        }));
    }
    if (id) {
        const rawArtists = value.artists?.items || value.artists?.nodes || value.artists || value.artist || value.performers || [];
        const artists = (Array.isArray(rawArtists) ? rawArtists : [rawArtists])
            .map((entry) => entry?.node || entry?.profile || entry)
            .map((entry) => typeof entry === 'string' ? entry : entry?.name || entry?.title)
            .filter(Boolean);
        if (!artists.length && typeof value.subtitle === 'string') {
            value.subtitle.split(',').map(clean).filter(Boolean).forEach((artist) => artists.push(artist));
        }
        const imageSources = value.album?.images || value.albumOfTrack?.coverArt?.sources || value.images || [];
        const image = (Array.isArray(imageSources) ? imageSources : [imageSources])
            .map((entry) => entry?.url || entry?.src).find(Boolean) || '';
        const row = mergeTrack(tracks.get(id), {
            id,
            title: value.name || value.title || value.trackName,
            artists,
            album: value.album?.name || value.albumOfTrack?.name || value.albumName,
            image,
            durationMs: value.duration_ms || value.durationMs || value.duration?.totalMilliseconds,
            explicit: value.explicit || value.contentRating?.label === 'EXPLICIT',
            mediaType: 'track',
            available: value.playability?.playable === false || value.is_playable === false ? false : undefined,
            url: `https://open.spotify.com/track/${id}`
        });
        tracks.set(id, row);
    }
    Object.values(value).forEach((child) => scanValue(child, tracks, depth + 1, seen));
}

module.exports = {
    clean, trackId, mediaRef, mediaUrl, localUriMetadata, playlistIdFromUrl, stableId, playlistCount, isEmbedPlaylistUrl, fullPlaylistUrl,
    needsFullPlayerPromotion, assessPlaylistCompleteness, shouldPromoteEmbedAfterScan,
    requestMentionsPlaylist, mergeTrack, mergePlaylistRows, scanValue
};
