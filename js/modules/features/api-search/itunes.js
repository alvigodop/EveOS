window.EveOS = window.EveOS || {};

(function () {
    async function searchiTunes(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { results: [] }; }

        const targetUrl = `${Core.ITUNES_API}?term=${encodeURIComponent(query)}&entity=movie&limit=5`;
        return await Core.fetchWithFallback(targetUrl, {}, 'iTunes Search failed') || { results: [] };
    }

    window.EveOS.API.iTunes = {
        searchiTunes
    };
})();