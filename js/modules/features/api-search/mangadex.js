window.EveOS = window.EveOS || {};

(function () {
    // Wait for Core to be ready (script-loader handles order, but good to be safe)

    async function searchMangaDex(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const url = `${Core.PROXY_URL}${Core.MANGADEX_API}?title=${encodeURIComponent(query)}&limit=2&includes[]=author&includes[]=cover_art&includes[]=artist`;
        return Core.safeFetch(url, {}, 'MangaDex Search failed') || { data: [] };
    }

    window.EveOS.API.MangaDex = {
        searchMangaDex
    };
})();
