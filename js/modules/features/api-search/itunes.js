window.EveOS = window.EveOS || {};

(function () {
    async function searchiTunes(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { results: [] }; }

        const targetUrl = `${Core.ITUNES_API}?term=${encodeURIComponent(query)}&entity=movie&limit=5`;
        const url = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        return Core.safeFetch(url, {}, 'iTunes Search failed') || { results: [] };
    }

    window.EveOS.API.iTunes = {
        searchiTunes
    };
})();