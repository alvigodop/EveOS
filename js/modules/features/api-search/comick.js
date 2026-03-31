window.EveOS = window.EveOS || {};

(function () {
    async function searchComicK(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return []; }

        const targetUrl = `https://api.comick.io/v1.0/search/?q=${encodeURIComponent(query)}&limit=5&t=false`;
        
        // 1. Try standard Proxy first (Fastest)
        const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        try {
            const res = await fetch(proxyUrl);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            // Proxy failed or blocked
        }

        // 2. Fallback to Lightpanda engine if proxy is blocked (Cloudflare bypass)
        console.log("ComicK: Standard proxy blocked, attempting Lightpanda fallback...");
        const proxyBase = Core.ACTIVE_PROXY_URL.split('/api/proxy')[0];
        const lpUrl = `${proxyBase}/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}`;
        
        const lpResponse = await Core.safeFetch(lpUrl, {}, 'ComicK Lightpanda Fallback failed');
        
        // Lightpanda returns data in .metadata when using format=json
        return lpResponse?.ok ? lpResponse.metadata : [];
    }

    window.EveOS.API.ComicK = {
        searchComicK
    };
})();