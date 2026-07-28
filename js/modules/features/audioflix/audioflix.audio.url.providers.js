window.EveAudioflixUrlProviders = window.EveAudioflixUrlProviders || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixUrlProviders;
    if (ns.ready) return;
    const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

    function providerFor(rawUrl) {
        const raw = String(rawUrl || '').trim();
        if (/^blob:/i.test(raw) || /^data:audio\//i.test(raw)) return 'direct';
        let parsed;
        try {
            parsed = new URL(raw);
        } catch {
            return '';
        }
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
        if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) return 'soundcloud';
        if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo';
        return /^https?:$/.test(parsed.protocol) ? 'direct' : '';
    }

    function youtubeId(rawUrl) {
        try {
            const url = new URL(rawUrl);
            const host = url.hostname.toLowerCase().replace(/^www\./, '');
            let id = host === 'youtu.be'
                ? url.pathname.split('/').filter(Boolean)[0]
                : url.searchParams.get('v');
            if (!id) {
                const parts = url.pathname.split('/').filter(Boolean);
                const marker = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
                if (marker >= 0) id = parts[marker + 1];
            }
            return YOUTUBE_ID_RE.test(id || '') ? id : '';
        } catch {
            return '';
        }
    }

    Object.assign(ns, { ready: true, providerFor, youtubeId });
})();
