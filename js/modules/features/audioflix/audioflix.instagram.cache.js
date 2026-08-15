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

    /** Store the resolved video for `url`. Silently ignores anything unusable. */
    function remember(url, result) {
        const id = key(url);
        const videoUrl = String(result?.videoUrl || '').trim();
        if (!id || !videoUrl) return;
        const map = load();
        map[id] = { videoUrl, duration: Number(result?.duration || 0) || 0, at: Date.now() };
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
        return videoUrl ? { ok: true, videoUrl, duration: Number(entry?.duration || 0) || 0 } : null;
    }

    /** Drop `url`, for when its link is proven dead rather than merely old. */
    function forget(url) {
        const map = load();
        const id = key(url);
        if (!(id in map)) return;
        delete map[id];
        save(map);
    }

    Object.assign(ns, { ready: true, remember, recall, forget, KEY, LIMIT });
})();
