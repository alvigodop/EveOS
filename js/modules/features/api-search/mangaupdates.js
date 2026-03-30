window.EveOS = window.EveOS || {};

(function () {
    async function fetchSeriesDetails(seriesId) {
        const Core = window.EveOS.API.Core;
        const targetUrl = `https://api.mangaupdates.com/v1/series/${seriesId}`;
        const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;

        try {
            const response = await fetch(proxyUrl);
            if (response.ok) return await response.json();
        } catch (e) {}
        return null;
    }

    async function searchMangaUpdates(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) return { results: [] };

        const searchUrl = Core.MANGAUPDATES_API;
        const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(searchUrl)}`;

        const body = new URLSearchParams();
        body.append('search', query);
        body.append('perpage', '5');

        try {
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });
            if (response.ok) {
                const searchData = await response.json();
                return await enrichResults(searchData.results);
            }
        } catch (e) {
            console.warn('MangaUpdates Proxy Search failed', e);
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