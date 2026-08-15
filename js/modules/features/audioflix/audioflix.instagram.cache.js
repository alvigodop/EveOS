// Remembers the real video URL behind a Reel, so it can still be played with no server running.
//
// Instagram's embed cannot be driven by script: it is cross-origin, it ignores the autoplay
// attribute, and it exposes no message API for play or pause. So on file:// the embed can only ever
// be a poster the user taps -- Play cannot start it. The resolved video is different. It is a plain
// progressive URL, and a media element loads a cross-origin URL WITHOUT CORS, which means a <video>
// can play it straight from file:// with real play, pause, seek and volume.
//
// The only thing missing offline is the URL itself, and that is already fetched every time a Reel is
// played while EveOS localhost is up. Keeping it means a Reel played once with the server running
// stays fully playable afterwards without one.
//
// Deliberately NOT time-expired. These links are signed and do expire, but the lifetime is
// Instagram's to decide and any constant here would be a guess -- too short throws away links that
// still work, too long is no better than trying. The player verifies the media actually opens and
// calls forget() when it does not, so expiry is observed rather than predicted.
window.EveAudioflixInstagramCache = window.EveAudioflixInstagramCache || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixInstagramCache;
    if (ns.ready) return;

    const KEY = 'eveos.audioflix.instagram.direct';
    // Bounded so a large collection cannot grow this without limit and cost the whole origin its
    // storage quota -- losing the music library with it, which has happened once already.
    const LIMIT = 300;

    const key = (url) => String(url || '').trim();

    function load() {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (error) {
            return {};   // unreadable or blocked; an empty cache is a cost, never a failure
        }
    }

    function save(map) {
        try {
            window.localStorage.setItem(KEY, JSON.stringify(map));
        } catch (error) {
            /* quota or private mode: the cache is an optimisation, so losing it changes nothing */
        }
    }

    const size = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

    /** Store the resolved video for `url`. Silently ignores anything unusable. */
    function remember(url, result) {
        const id = key(url);
        const videoUrl = String(result?.videoUrl || '').trim();
        if (!id || !videoUrl) return;
        const map = load();
        map[id] = {
            videoUrl,
            duration: Number(result?.duration || 0) || 0,
            // The reel's real shape. Every other source for this is a guess: the embed is
            // cross-origin so it cannot be measured, and reels are not all portrait -- assuming
            // 9/16 letterboxes a landscape one inside a box built for a phone screen.
            width: size(result?.width),
            height: size(result?.height),
            at: Date.now()
        };
        const ids = Object.keys(map);
        if (ids.length > LIMIT) {
            ids.sort((a, b) => (map[a]?.at || 0) - (map[b]?.at || 0))
                .slice(0, ids.length - LIMIT)
                .forEach((stale) => { delete map[stale]; });
        }
        save(map);
    }

    /** The remembered video for `url`, shaped like a resolver reply, or null. */
    function recall(url) {
        const entry = load()[key(url)];
        const videoUrl = String(entry?.videoUrl || '').trim();
        return videoUrl ? {
            ok: true,
            videoUrl,
            duration: Number(entry?.duration || 0) || 0,
            width: size(entry?.width),
            height: size(entry?.height)
        } : null;
    }

    /** The reel's shape alone, which outlives its video link.
     *
     * Kept separate from recall() on purpose: the video URL expires, the dimensions do not. When a
     * link dies and the embed has to be used again, the shape is still known, so the box is still
     * the right shape instead of falling back to a guess. */
    function shape(url) {
        const entry = load()[key(url)];
        const width = size(entry?.width);
        const height = size(entry?.height);
        return (width && height) ? { width, height } : null;
    }

    /** Record a shape learned from a playing video, which is the most accurate source there is. */
    function rememberShape(url, width, height) {
        const id = key(url);
        if (!id || !size(width) || !size(height)) return;
        const map = load();
        const entry = map[id] || { videoUrl: '', duration: 0, at: Date.now() };
        map[id] = { ...entry, width: size(width), height: size(height) };
        save(map);
    }

    /** Drop the video link for `url`, for when it is proven dead rather than merely old.
     *
     * The SHAPE is kept. Only the link expires, and having to fall back to the embed is exactly
     * when the shape matters most -- discarding it here would send the box back to guessing at the
     * one moment it no longer has to. */
    function forget(url) {
        const map = load();
        const id = key(url);
        const entry = map[id];
        if (!entry) return;
        if (size(entry.width) && size(entry.height)) {
            map[id] = { videoUrl: '', duration: 0, width: entry.width, height: entry.height, at: entry.at || Date.now() };
        } else {
            delete map[id];
        }
        save(map);
    }

    Object.assign(ns, { ready: true, remember, recall, shape, rememberShape, forget, KEY, LIMIT });
})();
