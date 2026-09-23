// Strategy: MangaDex API via browser-safe proxy
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    function parseMangaDexId(url) {
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.toLowerCase().includes('mangadex.org')) return null;
            const match = parsed.pathname.match(/^\/title\/([0-9a-f-]{36})/i);
            return match ? match[1] : null;
        } catch (error) {
            return null;
        }
    }

    function pickLocalizedText(value) {
        if (!value) return null;
        if (typeof value === 'string') return value.trim() || null;
        if (Array.isArray(value)) {
            for (const entry of value) {
                const resolved = pickLocalizedText(entry);
                if (resolved) return resolved;
            }
            return null;
        }
        if (typeof value === 'object') {
            const preferredKeys = ['en', 'en-us', 'en-gb', 'ja-ro', 'zh-ro', 'ja', 'zh', 'ko'];
            for (const key of preferredKeys) {
                if (typeof value[key] === 'string' && value[key].trim()) {
                    return value[key].trim();
                }
            }
            for (const candidate of Object.values(value)) {
                if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
            }
        }
        return null;
    }

    function pickEnglishAltTitle(altTitles) {
        if (!Array.isArray(altTitles)) return null;
        for (const alt of altTitles) {
            if (alt && typeof alt.en === 'string' && alt.en.trim()) return alt.en.trim();
        }
        return pickLocalizedText(altTitles);
    }

    async function fetchMangaDexPayload(apiUrl, signal) {
        const encoded = encodeURIComponent(apiUrl);
        const transports = [
            { label: 'direct', url: apiUrl },
            { label: 'local-proxy', url: `http://127.0.0.1:8765/api/proxy?url=${encoded}` },
            { label: 'codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${encoded}` },
            { label: 'allorigins', url: `https://api.allorigins.win/raw?url=${encoded}` }
        ];

        for (const transport of transports) {
            try {
                const response = await fetch(transport.url, { signal });
                if (!response.ok) continue;
                const payload = await response.json();
                if (payload?.data?.attributes) {
                    return { payload, transport: transport.label };
                }
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
            }
        }
        return null;
    }

    window.EveOS.Autotitle.Strategies.MangaDexApi = async function (url, signal) {
        const mangaId = parseMangaDexId(url);
        if (!mangaId) return null;

        try {
            const apiUrl = `https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art`;
            const fetched = await fetchMangaDexPayload(apiUrl, signal);
            if (!fetched) return null;

            const manga = fetched.payload?.data;
            const attributes = manga?.attributes || {};
            const relationships = Array.isArray(manga?.relationships) ? manga.relationships : [];
            const coverRel = relationships.find((rel) => rel?.type === 'cover_art');
            const coverFileName = coverRel?.attributes?.fileName || null;

            const title = pickLocalizedText(attributes?.title) || pickEnglishAltTitle(attributes?.altTitles);
            const englishAlt = pickEnglishAltTitle(attributes?.altTitles);
            const description = pickLocalizedText(attributes?.description);

            return {
                title: englishAlt || title || null,
                icon: 'https://mangadex.org/pwa/icons/icon-180.png',
                coverUrl: coverFileName
                    ? `https://uploads.mangadex.org/covers/${mangaId}/${coverFileName}`
                    : `https://og.mangadex.org/og-image/manga/${mangaId}`,
                description: description || null,
                source: 'MangaDexAPI',
                transport: fetched.transport
            };
        } catch (error) {
            console.warn('Autotitle: MangaDex API strategy failed', error);
        }
        return null;
    };
})();
