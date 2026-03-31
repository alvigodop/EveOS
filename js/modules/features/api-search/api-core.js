window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function () {
    // Ported from MegaBase Constants
    const PROXY_URL = 'https://corsproxy.io/?';
    const BRIDGE_PORT = 3037;
    const CAMOFOX_BRIDGE_PORT = 3038;
    const SERVER_PORT = 3000;
    let _activeProxyBase = ''; // Empty means use relative /api/proxy (local server)

    // Probe for ANY active local service (Main Server, LP Bridge, or Camofox Bridge)
    async function probeLocalServices() {
        const ports = [BRIDGE_PORT, CAMOFOX_BRIDGE_PORT, SERVER_PORT];
        for (const port of ports) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 800);
                
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
        COMICK: 'https://api.comick.dev/v1.0/search'
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
        
        // 0. Try Direct Fetch (Works if browser security is disabled)
        try {
            const directRes = await fetch(targetUrl, options);
            if (directRes.ok) return await directRes.json();
        } catch (e) {}

        // 1. Try Detected Local Proxy (Port 3000, 3037, or 3038)
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
                            try { 
                                const parsed = JSON.parse(data.contents); 
                                if (typeof parsed === 'object' && parsed !== null) return parsed;
                            } catch(e) {
                                continue; // Likely Cloudflare HTML, skip to next proxy
                            }
                        }
                        if (typeof data === 'object' && data !== null && !data.contents) return data;
                    }
                } catch (e) {}
            }
        }

        // 3. Fallback Chain: Lightpanda -> Camofox (The "Solve it" engines)
        const bridges = [
            { name: 'Lightpanda', url: `http://localhost:3037/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}` },
            { name: 'Camofox', url: `http://localhost:3038/api/camofox?format=json&url=${encodeURIComponent(targetUrl)}` }
        ];
        for (const bridge of bridges) {
            try {
                const res = await safeFetch(bridge.url, {}, `${errorMsg} (${bridge.name} Fallback)`);
                if (res) {
                    // Try to find the content in .html (Lightpanda), .snapshot (Camofox), or .metadata
                    const rawData = res.html || res.snapshot || res.metadata;

                    if (typeof rawData === 'string' && rawData.length > 0) {
                        try {
                            const parsed = JSON.parse(rawData);
                            if (typeof parsed === 'object' && parsed !== null) return parsed;
                        } catch (e) {
                            // Browsers directly visiting JSON endpoints (like Camofox fallback) often wrap it in a <pre> tag.
                            const preMatch = rawData.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                            if (preMatch && preMatch[1]) {
                                try {
                                    // Decode HTML entities within the <pre> block
                                    const decodedPre = preMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                                    const parsedPre = JSON.parse(decodedPre);
                                    if (typeof parsedPre === 'object' && parsedPre !== null) return parsedPre;
                                } catch (e2) {}
                            }
                            
                            // If still failing, use the browser's native DOM parser to safely extract text content
                            const doc = new DOMParser().parseFromString(rawData, 'text/html');
                            // Remove scripts and styles so they don't pollute the extracted text
                            const scripts = doc.querySelectorAll('script, style');
                            scripts.forEach(s => s.remove());
                            
                            const htmlStripped = doc.body ? (doc.body.textContent || doc.body.innerText || '') : '';
                            
                            const firstBrace = htmlStripped.indexOf('{');
                            const firstBracket = htmlStripped.indexOf('[');
                            const firstChar = Math.min(firstBrace !== -1 ? firstBrace : Infinity, firstBracket !== -1 ? firstBracket : Infinity);

                            if (firstChar !== Infinity) {
                                const lastBrace = htmlStripped.lastIndexOf('}');
                                const lastBracket = htmlStripped.lastIndexOf(']');
                                const lastChar = Math.max(lastBrace, lastBracket);
                                
                                if (lastChar > firstChar) {
                                    const jsonCandidate = htmlStripped.substring(firstChar, lastChar + 1);
                                    try {
                                        const parsedSlice = JSON.parse(jsonCandidate);
                                        if (typeof parsedSlice === 'object' && parsedSlice !== null) return parsedSlice;
                                    } catch (e3) {
                                        console.warn("API Core: Extensive JSON extraction failed", e3);
                                    }
                                }
                            }
                            
                            // If all parsers failed, this layer returned bad data (like Cloudflare HTML). 
                            // Skip to the next fallback bridge instead of returning raw text!
                            continue;
                        }
                    }
                    if (typeof rawData === 'object' && rawData !== null) return rawData;
                }
            } catch (e) {}
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