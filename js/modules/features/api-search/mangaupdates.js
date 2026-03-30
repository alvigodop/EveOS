window.EveOS = window.EveOS || {};

(function () {
    async function searchMangaUpdates(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { results: [] }; }

        const targetUrl = Core.MANGAUPDATES_API;
        
        // Strategy: We try to use the local proxy first (best chance), 
        // then fall back to a public proxy using form-urlencoded to skip preflight.
        const endpoints = [
            `/api/proxy?url=${encodeURIComponent(targetUrl)}`,
            `${Core.PROXY_URL}${encodeURIComponent(targetUrl)}`
        ];

        const body = new URLSearchParams();
        body.append('search', query);
        body.append('perpage', '5');

        for (const url of endpoints) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: body
                });
                if (response.ok) {
                    return await response.json();
                }
            } catch (e) {
                console.warn(`MangaUpdates attempt failed for ${url}`, e);
            }
        }

        return { results: [] };
    }

    window.EveOS.API.MangaUpdates = {
        searchMangaUpdates
    };
})();