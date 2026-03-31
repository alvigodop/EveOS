window.EveOS = window.EveOS || {};

(function () {
    async function searchComicK(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return []; }

        const targetUrl = `https://api.comick.io/v1.0/search/?q=${encodeURIComponent(query)}&limit=5&t=false`;
        return await Core.fetchWithFallback(targetUrl, {}, 'ComicK Search failed') || [];
    }

    window.EveOS.API.ComicK = {
        searchComicK
    };
})();