window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function () {
    // Ported from MegaBase Constants
    const PROXY_URL = 'https://corsproxy.io/?';
    const BRIDGE_PORT = 3037;
    const SERVER_PORT = 3000;
    let _activeProxyBase = ''; // Empty means use relative /api/proxy (local server)

    // Probe for ANY active local service (Main Server or Standalone Bridge)
    async function probeLocalServices() {
        const ports = [BRIDGE_PORT, SERVER_PORT];
        for (const port of ports) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                
                const res = await fetch(`http://localhost:${port}/api/status`, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === 'ok') {
                        console.log(`API Core: Local service detected on port ${port} (${data.service || 'server'})`);
                        _activeProxyBase = `http://localhost:${port}`;
                        return;
                    }
                }
            } catch (e) {}
        }
    }

    // Run probe immediately
    probeLocalServices();

    const ENDPOINTS = {
        ANILIST: 'https://graphql.anilist.co',
        JIKAN_MANGA: 'https://api.jikan.moe/v4/manga',
        JIKAN_ANIME: 'https://api.jikan.moe/v4/anime',
        MANGADEX: 'https://api.mangadex.org/manga',
        MANGAUPDATES: 'https://api.mangaupdates.com/v1/series/search',
        KITSU_ANIME: 'https://kitsu.io/api/edge/anime',
        KITSU_MANGA: 'https://kitsu.io/api/edge/manga',
        TVMAZE: 'https://api.tvmaze.com/search/shows',
        ITUNES: 'https://itunes.apple.com/search',
        WLNUPDATES: 'https://www.wlnupdates.com/api',
        OPENLIBRARY: 'https://openlibrary.org/search.json',
        COMICK: 'https://api.comick.io/v1.0/search'
    };

    async function safeFetch(url, options = {}, errorMsg = 'API Request failed') {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`${errorMsg} (${response.status}): ${errorText}`);
            }
            return await response.json();
        } catch (e) {
            console.warn(errorMsg, e);
            return null;
        }
    }

    async function fetchWithFallback(targetUrl, options = {}, errorMsg = 'API Search failed') {
        const Core = window.EveOS.API.Core;
        const isPost = options.method === 'POST';
        
        // 0. Try Direct Fetch (Works if browser security is disabled or API allows it)
        try {
            const directRes = await fetch(targetUrl, options);
            if (directRes.ok) return await directRes.json();
        } catch (e) {}

        // 1. Try Detected Local Proxy (Port 3000 or 3037)
        if (_activeProxyBase) {
            try {
                const proxyUrl = `${_activeProxyBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl, options);
                if (response.ok) return await response.json();
            } catch (e) {}
        }

        // 2. Try Public Proxies (Works in file:// without any server)
        if (!isPost) {
            const publicProxies = [
                `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
                `${Core.PROXY_URL}${encodeURIComponent(targetUrl)}`
            ];

            for (const pubUrl of publicProxies) {
                try {
                    const response = await fetch(pubUrl);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.contents) {
                            try { return JSON.parse(data.contents); } catch(e) {}
                        }
                        return data;
                    }
                } catch (e) {}
            }
        }

        // 3. Last Resort: Force Lightpanda Bridge (Fallback if probe failed but bridge is active)
        const bridgeUrl = `http://localhost:3037/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}`;
        const lpRes = await safeFetch(bridgeUrl, {}, `${errorMsg} (Lightpanda Fallback)`);
        
        if (lpRes?.ok && lpRes.html) {
            try { return JSON.parse(lpRes.html); } catch (e) { return lpRes.metadata; }
        }
        
        return null;
    }

    // Expose for other modules
    window.EveOS.API.Core = {
        PROXY_URL,
        get ACTIVE_PROXY_URL() {
            return (_activeProxyBase || 'http://localhost:3000') + '/api/proxy?url=';
        },
        ANILIST_API: ENDPOINTS.ANILIST,
        JIKAN_API: ENDPOINTS.JIKAN_MANGA,
        JIKAN_MANGA_API: ENDPOINTS.JIKAN_MANGA,
        JIKAN_ANIME_API: ENDPOINTS.JIKAN_ANIME,
        MANGADEX_API: ENDPOINTS.MANGADEX,
        MANGAUPDATES_API: ENDPOINTS.MANGAUPDATES,
        KITSU_ANIME_API: ENDPOINTS.KITSU_ANIME,
        KITSU_MANGA_API: ENDPOINTS.KITSU_MANGA,
        TVMAZE_API: ENDPOINTS.TVMAZE,
        ITUNES_API: ENDPOINTS.ITUNES,
        WLNUPDATES_API: ENDPOINTS.WLNUPDATES,
        OPENLIBRARY_API: ENDPOINTS.OPENLIBRARY,
        safeFetch,
        fetchWithFallback
    };
})();