window.EveOS = window.EveOS || {};

(function () {
    async function searchJikanManga(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const targetUrl = `${Core.JIKAN_MANGA_API}?q=${encodeURIComponent(query)}&limit=2&sfw=true`;
        const url = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        return Core.safeFetch(url, {}, 'Jikan Manga Search failed') || { data: [] };
    }

    async function searchJikanAnime(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const targetUrl = `${Core.JIKAN_ANIME_API}?q=${encodeURIComponent(query)}&limit=2&sfw=true`;
        const url = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        return Core.safeFetch(url, {}, 'Jikan Anime Search failed') || { data: [] };
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
