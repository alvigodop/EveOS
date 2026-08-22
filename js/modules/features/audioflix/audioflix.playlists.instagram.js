window.EveAudioflixInstagramPlaylists = window.EveAudioflixInstagramPlaylists || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixInstagramPlaylists;
    if (ns.ready) return;

    const REEL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/gi;
    const MAX_ITEMS = 250;
    const text = (value) => String(value ?? '').trim();

    function parseUrls(value) {
        const source = text(value);
        const urls = [];
        const seen = new Set();
        let match;
        REEL_RE.lastIndex = 0;
        while ((match = REEL_RE.exec(source))) {
            const kind = match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase();
            const canonical = `https://www.instagram.com/${kind}/${match[2]}/`;
            if (!seen.has(canonical)) {
                seen.add(canonical);
                urls.push(canonical);
            }
            if (urls.length >= MAX_ITEMS) break;
        }
        return urls;
    }

    function codeFor(url) {
        REEL_RE.lastIndex = 0;
        return REEL_RE.exec(text(url))?.[2] || '';
    }

    function normalize(value) {
        const urls = parseUrls(value);
        if (!urls.length) {
            return { ok: false, reason: 'Add at least one Instagram Reel or post URL.' };
        }
        return {
            ok: true,
            url: urls.join('\n'),
            urls,
            playlistId: `instagram:${urls.map(codeFor).join(',')}`
        };
    }

    function fallbackEntries(urls) {
        return urls.map((url, index) => ({
            sourceId: codeFor(url),
            title: `Instagram Reel ${index + 1}`,
            url,
            position: index + 1,
            sourceProvider: 'instagram'
        }));
    }

    async function fetchPlaylist(value, force, options = {}) {
        const normalized = normalize(value);
        if (!normalized.ok) return normalized;
        const title = text(options.title) || 'Instagram Reels';
        let enriched = null;
        try {
            enriched = await window.EveAudioflixNative?.listInstagramCollection?.(
                normalized.url,
                { title, force: force === true }
            );
        } catch (_) {}
        if (enriched?.ok && Array.isArray(enriched.entries) && enriched.entries.length) {
            return Object.assign({}, enriched, normalized, {
                ok: true,
                title: text(enriched.title) || title,
                entries: enriched.entries
            });
        }
        return {
            ...normalized,
            ok: true,
            title,
            entries: fallbackEntries(normalized.urls),
            scrapeSource: 'url-list',
            enrichmentWarning: enriched?.reason || 'Metadata will be enriched when the EveOS server can access these Reels.'
        };
    }

    // "Instagram Reel 7" is what BOTH sides produce when they have no real name: the client-side
    // import numbers them, and the backend falls back to the same shape. Letting that through a
    // patch would let a refresh overwrite a genuine name -- or one the user typed -- with a
    // placeholder, so it is filtered out rather than trusted.
    const PLACEHOLDER_TITLE = /^instagram\s+reel\s*\d*$/i;

    function realTitle(value) {
        const title = text(value);
        return title && !PLACEHOLDER_TITLE.test(title) ? title : '';
    }

    function entryPatch(entry) {
        // title was missing here entirely, which is why "Refresh metadata" never renamed anything:
        // the backend resolved real titles and the reconcile threw them away.
        const title = realTitle(entry?.title);
        return {
            ...(title ? { title } : {}),
            artist: text(entry?.artist || entry?.uploader || entry?.author),
            album: text(entry?.album),
            image: text(entry?.image || entry?.thumbnail),
            duration: Number(entry?.duration || 0) || 0,
            sourceId: text(entry?.sourceId || entry?.id),
            sourceProvider: 'instagram',
            playlistPosition: Number(entry?.position || 0) || 0
        };
    }

    function connectionPatch(payload) {
        return {
            image: text(payload?.image || payload?.thumbnail),
            scrapeSource: text(payload?.scrapeSource) || 'url-list'
        };
    }

    window.EveAudioflixPlaylistProviders?.register?.('instagram', {
        label: 'Instagram Reels',
        detect: (value) => parseUrls(value).length > 0,
        normalize,
        fetchPlaylist,
        entryPatch,
        connectionPatch
    });

    Object.assign(ns, { ready: true, parseUrls, normalize, fetchPlaylist, codeFor });
})();
