window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function () {
    // Ported from MegaBase Constants
    const PROXY_URL = 'https://corsproxy.io/?';
    const BRIDGE_PORT = 3037;
    let _activeProxyBase = ''; // Empty means use relative /api/proxy (local server)

    // Probe for standalone bridge if running on file:// or if local server might be down
    async function probeBridge() {
        try {
            const res = await fetch(`http://localhost:${BRIDGE_PORT}/api/status`);
            if (res.ok) {
                const data = await res.json();
                if (data.service === 'lightpanda-bridge') {
                    console.log(`API Core: Standalone bridge detected on port ${BRIDGE_PORT}`);
                    _activeProxyBase = `http://localhost:${BRIDGE_PORT}`;
                }
            }
        } catch (e) {
            // Bridge not running
        }
    }

    // Run probe immediately
    probeBridge();

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
        const proxyUrl = `${window.EveOS.API.Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
        
        // 1. Try standard Proxy first
        try {
            const response = await fetch(proxyUrl, options);
            if (response.ok) return await response.json();
            
            // If we get a 403 (Cloudflare) or 5xx, we fall back
            if (response.status !== 403 && response.status < 500) {
                return null; 
            }
        } catch (e) {}

        // 2. Fallback to Lightpanda
        const proxyBase = window.EveOS.API.Core.ACTIVE_PROXY_URL.split('/api/proxy')[0];
        const lpUrl = `${proxyBase}/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}`;
        
        console.log(`API Core: Proxy failed/blocked for ${targetUrl.substring(0, 40)}..., falling back to Lightpanda.`);
        const lpRes = await safeFetch(lpUrl, {}, `${errorMsg} (Lightpanda Fallback)`);
        
        return lpRes?.ok ? lpRes.metadata : null;
    }

    // Expose for other modules
    window.EveOS.API.Core = {
        PROXY_URL,
        get ACTIVE_PROXY_URL() {
            return `${_activeProxyBase}/api/proxy?url=`;
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
