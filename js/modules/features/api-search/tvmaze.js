window.EveOS = window.EveOS || {};

(function () {
    async function searchTVmaze(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return []; }

        const url = `${Core.TVMAZE_API}?q=${encodeURIComponent(query)}`;
        return Core.safeFetch(url, {}, 'TVmaze Search failed') || [];
    }

    window.EveOS.API.TVmaze = {
        searchTVmaze
    };
})();