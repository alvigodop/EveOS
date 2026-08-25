window.EveAudioflixNativeInstagram = window.EveAudioflixNativeInstagram || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixNativeInstagram;
    if (ns.ready) return;

    function canonical(value) {
        return window.EveAudioflixInstagramPlaylists?.parseUrls?.(value)?.[0] || String(value || '').trim();
    }

    function create({ fetchJson }) {
        async function listInstagramCollection(source, options = {}) {
            if (!source) return { ok: false, reason: 'Missing Instagram video collection.' };
            return fetchJson('/api/audioflix/instagram-collection', {
                method: 'POST',
                body: JSON.stringify({ source, title: String(options.title || '').trim(), force: options.force === true }),
                timeout: 180000,
                probe: options.force === true
            });
        }

        async function resolveInstagramVideo(url, options = {}) {
            if (!url) return { ok: false, reason: 'Missing Instagram video URL.' };
            const key = canonical(url);
            const cache = window.EveAudioflixInstagramCache;
            if (!options.force) {
                const cached = cache?.recall?.(key);
                if (cached?.videoUrl) return cached;
            }
            const result = await fetchJson('/api/audioflix/instagram-video', {
                method: 'POST',
                body: JSON.stringify({ url }),
                timeout: 60000,
                probe: true
            });
            if (result?.ok && result.videoUrl) {
                cache?.remember?.(key, result);
            }
            return result;
        }

        return { listInstagramCollection, resolveInstagramVideo };
    }

    Object.assign(ns, { ready: true, create });
})();