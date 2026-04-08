window.EveOS = window.EveOS || {};

(function () {
    async function searchJikanManga(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const targetUrl = `${Core.JIKAN_MANGA_API}?q=${encodeURIComponent(query)}&limit=20&sfw=true`;
        return await Core.fetchWithFallback(targetUrl, {}, 'Jikan Manga Search failed') || { data: [] };
    }

    async function searchJikanAnime(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const targetUrl = `${Core.JIKAN_ANIME_API}?q=${encodeURIComponent(query)}&limit=20&sfw=true`;
        return await Core.fetchWithFallback(targetUrl, {}, 'Jikan Anime Search failed') || { data: [] };
    }

    async function searchJikan(query) {
        // Backward-compatible alias (manga search).
        return searchJikanManga(query);
    }

    window.EveOS.API.Jikan = {
        searchJikan,
        searchJikanManga,
        searchJikanAnime
    };
})();
