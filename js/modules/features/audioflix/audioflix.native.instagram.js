window.EveAudioflixNativeInstagram = window.EveAudioflixNativeInstagram || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixNativeInstagram;
    if (ns.ready) return;

    function create({ fetchJson }) {
        async function listInstagramCollection(source, options = {}) {
            if (!source) return { ok: false, reason: 'Missing Instagram Reel collection.' };
            return fetchJson('/api/audioflix/instagram-collection', {
                method: 'POST',
                body: JSON.stringify({
                    source,
                    title: String(options.title || '').trim(),
                    force: options.force === true
                }),
                timeout: 180000,
                probe: options.force === true
            });
        }
        async function resolveInstagramVideo(url) {
            if (!url) return { ok: false, reason: 'Missing Instagram Reel URL.' };
            return fetchJson('/api/audioflix/instagram-video', {
                method: 'POST',
                body: JSON.stringify({ url }),
                timeout: 30000,
                probe: true
            });
        }
        return { listInstagramCollection, resolveInstagramVideo };
    }

    Object.assign(ns, { ready: true, create });
})();
