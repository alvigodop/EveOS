window.EveOS = window.EveOS || {};

(function () {
    async function searchWlnUpdates(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { data: [] }; }

        const targetUrl = Core.WLNUPDATES_API;
        const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        
        // WlnUpdates API uses POST but we can use form-urlencoded via proxy to bypass CORS
        const body = new URLSearchParams();
        body.append('mode', 'search-title');
        body.append('title', query);

        try {
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body
            });
            if (!response.ok) {
                console.warn('WlnUpdates Search failed', response.status);
                return { data: [] };
            }
            return await response.json();
        } catch (e) {
            console.warn('WlnUpdates Search failed', e);
            return { data: [] };
        }
    }

    window.EveOS.API.WlnUpdates = {
        searchWlnUpdates
    };
})();