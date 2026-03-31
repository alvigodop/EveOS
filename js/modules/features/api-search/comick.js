window.EveOS = window.EveOS || {};

(function () {
    async function searchComicK(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return []; }

        const targetUrl = `https://api.comick.dev/v1.0/search/?q=${encodeURIComponent(query)}&limit=25&t=false`;
        const res = await Core.fetchWithFallback(targetUrl, {}, 'ComicK Search failed');
        return Array.isArray(res) ? res : [];
    }

    window.EveOS.API.ComicK = {
        searchComicK
    };
})();