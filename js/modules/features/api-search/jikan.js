window.EveOS = window.EveOS || {};

(function () {
    async function searchJikan(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const url = `${Core.JIKAN_API}?q=${encodeURIComponent(query)}&limit=2&sfw=true`;
        return Core.safeFetch(url, {}, 'Jikan Search failed') || { data: [] };
    }

    window.EveOS.API.Jikan = {
        searchJikan
    };
})();
