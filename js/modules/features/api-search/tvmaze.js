window.EveOS = window.EveOS || {};

(function () {
    async function searchTVmaze(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return []; }

        const targetUrl = `${Core.TVMAZE_API}?q=${encodeURIComponent(query)}`;
        return await Core.fetchWithFallback(targetUrl, {}, 'TVmaze Search failed') || [];
    }

    window.EveOS.API.TVmaze = {
        searchTVmaze
    };
})();