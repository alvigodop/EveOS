window.EveOS = window.EveOS || {};

(function () {
    async function searchOpenLibrary(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { docs: [] }; }

        const targetUrl = `${Core.OPENLIBRARY_API}?q=${encodeURIComponent(query)}&limit=5`;
        const url = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        return Core.safeFetch(url, {}, 'OpenLibrary Search failed') || { docs: [] };
    }

    window.EveOS.API.OpenLibrary = {
        searchOpenLibrary
    };
})();