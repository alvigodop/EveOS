window.EveOS = window.EveOS || {};

(function () {
    function enrichKitsuData(response) {
        if (!response || !Array.isArray(response.data)) return { data: [] };
        const included = response.included || [];
        const categoriesMap = {};
        
        included.forEach(inc => {
            if (inc.type === 'categories') {
                categoriesMap[inc.id] = inc.attributes?.title || inc.attributes?.name;
            }
        });

        const enrichedData = response.data.map(item => {
            const catData = item.relationships?.categories?.data || [];
            const tags = catData.map(c => categoriesMap[c.id]).filter(Boolean);
            return {
                ...item,
                _extractedTags: tags
            };
        });

        return { data: enrichedData };
    }

    async function searchKitsuAnime(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const url = `${Core.KITSU_ANIME_API}?filter[text]=${encodeURIComponent(query)}&page[limit]=3&include=categories`;
        const res = await Core.safeFetch(url, {}, 'Kitsu Anime Search failed');
        return enrichKitsuData(res);
    }

    async function searchKitsuManga(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const url = `${Core.KITSU_MANGA_API}?filter[text]=${encodeURIComponent(query)}&page[limit]=3&include=categories`;
        const res = await Core.safeFetch(url, {}, 'Kitsu Manga Search failed');
        return enrichKitsuData(res);
    }

    window.EveOS.API.Kitsu = {
        searchKitsuAnime,
        searchKitsuManga
    };
})();