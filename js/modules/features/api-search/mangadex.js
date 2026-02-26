window.EveOS = window.EveOS || {};

(function () {
    // Wait for Core to be ready (script-loader handles order, but good to be safe)

    async function fetchMangaDexStatistics(ids) {
        const Core = window.EveOS.API.Core;
        if (!Core || !Array.isArray(ids) || ids.length === 0) return {};

        const query = ids
            .map(id => `manga[]=${encodeURIComponent(String(id || '').trim())}`)
            .filter(Boolean)
            .join('&');
        if (!query) return {};

        const url = `${Core.PROXY_URL}https://api.mangadex.org/statistics/manga?${query}`;
        const response = await Core.safeFetch(url, {}, 'MangaDex Statistics failed');
        return response?.statistics && typeof response.statistics === 'object'
            ? response.statistics
            : {};
    }

    async function searchMangaDex(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const url = `${Core.PROXY_URL}${Core.MANGADEX_API}?title=${encodeURIComponent(query)}&limit=3&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc`;
        const searchResponse = await Core.safeFetch(url, {}, 'MangaDex Search failed');
        const data = Array.isArray(searchResponse?.data) ? searchResponse.data : [];
        if (!data.length) return { data: [] };

        const ids = data.map(item => item?.id).filter(Boolean);
        const statisticsMap = await fetchMangaDexStatistics(ids);
        const enriched = data.map(item => ({
            ...item,
            stats: statisticsMap?.[item?.id] || null
        }));

        return {
            ...(searchResponse || {}),
            data: enriched
        };
    }

    window.EveOS.API.MangaDex = {
        searchMangaDex
    };
})();
