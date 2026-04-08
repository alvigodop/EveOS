window.EveOS = window.EveOS || {};

(function () {
    async function searchOpenLibrary(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { docs: [] }; }

        const targetUrl = `${Core.OPENLIBRARY_API}?q=${encodeURIComponent(query)}&limit=20`;
        return await Core.fetchWithFallback(targetUrl, {}, 'OpenLibrary Search failed') || { docs: [] };
    }

    window.EveOS.API.OpenLibrary = {
        searchOpenLibrary
    };
})();