window.EveOS = window.EveOS || {};

(function () {
    async function fetchSeriesDetails(seriesId) {
        const Core = window.EveOS.API.Core;
        const targetUrl = `https://api.mangaupdates.com/v1/series/${seriesId}`;
        
        // 1. Try Configured Proxy (Local Server or Standalone Bridge)
        const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        try {
            const response = await fetch(proxyUrl);
            if (response.ok) return await response.json();
        } catch (e) {}

        // 2. Try Public Proxy
        try {
            const pubUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(pubUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.contents) return JSON.parse(data.contents);
            }
        } catch (e) {}

        return null;
    }

    async function searchMangaUpdates(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) return { results: [] };

        const targetUrl = Core.MANGAUPDATES_API;
        const body = new URLSearchParams();
        body.append('search', query);
        body.append('perpage', '5');

        // 1. Try Configured Proxies (Local Server or Standalone Bridge only)
        // We skip the public POST proxy here because it's usually blocked by Cloudflare
        const proxyBase = Core.ACTIVE_PROXY_URL.split('/api/proxy')[0];
        if (proxyBase) {
            const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
            try {
                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body
                });
                if (response.ok) {
                    const searchData = await response.json();
                    if (searchData.results) return await enrichResults(searchData.results);
                }
            } catch (e) {}
        }

        // 2. High-Reliability Fallback: HTML Scraping via AllOrigins (Zero-Server mode)
        // This is the most stable way to get results when running from file:// without a server.
        try {
            const webSearchUrl = `https://www.mangaupdates.com/series.html?search=${encodeURIComponent(query)}`;
            const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(webSearchUrl)}`;
            const res = await fetch(fallbackUrl);
            const data = await res.json();
            const html = data.contents;
            if (html) {
                const idRegex = /series\.html\?id=(\d+)/g;
                const foundIds = [];
                let match;
                while ((match = idRegex.exec(html)) !== null && foundIds.length < 5) {
                    if (!foundIds.includes(match[1])) foundIds.push(match[1]);
                }
                if (foundIds.length) {
                    const mockResults = foundIds.map(id => ({ record: { series_id: id } }));
                    return await enrichResults(mockResults);
                }
            }
        } catch (e) {
            console.warn('MangaUpdates Scraper Fallback failed', e);
        }

        return { results: [] };
    }

    async function enrichResults(results) {
        if (!results || !Array.isArray(results)) return { results: [] };
        const enriched = await Promise.all(results.map(async (hit) => {
            const seriesId = hit.record?.series_id;
            if (!seriesId) return hit;
            const details = await fetchSeriesDetails(seriesId);
            return details ? { ...hit, _fullDetails: details } : hit;
        }));
        return { results: enriched };
    }

    window.EveOS.API.MangaUpdates = {
        searchMangaUpdates
    };
})();