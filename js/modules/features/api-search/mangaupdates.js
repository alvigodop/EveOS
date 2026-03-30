window.EveOS = window.EveOS || {};

(function () {
    async function searchMangaUpdates(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { results: [] }; }

        const url = Core.MANGAUPDATES_API;
        
        // Use URLSearchParams to send as application/x-www-form-urlencoded
        // This avoids triggering a CORS preflight (OPTIONS) request, 
        // which MangaUpdates' Cloudflare blocks.
        const body = new URLSearchParams();
        body.append('search', query);
        body.append('perpage', '5');

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body
            });
            if (!response.ok) {
                console.warn('MangaUpdates Search failed', response.status);
                return { results: [] };
            }
            return await response.json();
        } catch (e) {
            console.warn('MangaUpdates Search failed', e);
            return { results: [] };
        }
    }

    window.EveOS.API.MangaUpdates = {
        searchMangaUpdates
    };
})();