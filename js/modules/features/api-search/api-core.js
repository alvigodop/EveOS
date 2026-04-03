window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function () {
    // Ported from MegaBase Constants
    const PROXY_URL = 'https://corsproxy.io/?';
    const CODETABS_PROXY_URL = 'https://api.codetabs.com/v1/proxy/?quest=';
    const LOCAL_HOST = '127.0.0.1';
    const BRIDGE_PORT = 3037;
    const CAMOFOX_BRIDGE_PORT = 3038;
    const SERVER_PORT = 3000;
    const LIGHTPANDA_BASE = `http://${LOCAL_HOST}:${BRIDGE_PORT}`;
    const CAMOFOX_BASE = `http://${LOCAL_HOST}:${CAMOFOX_BRIDGE_PORT}`;
    const SERVER_BASE = `http://${LOCAL_HOST}:${SERVER_PORT}`;
    let _activeProxyBase = ''; // Empty means no local proxy server is available.
    let _serviceProbePromise = null;
    const _bridgeAvailability = {
        lightpanda: false,
        camofox: false
    };

    const SERVER_STATUS_TIMEOUT_MS = 1500;
    const BRIDGE_STATUS_TIMEOUT_MS = 350;
    const OPTIMISTIC_LOCAL_PROXY_TIMEOUT_MS = 1000;
    const BLOCKED_TEXT_TOKENS = [
        'just a moment',
        'attention required! | cloudflare',
        'access denied',
        'performing security verification',
        'verify you are human',
        'checking your browser',
        'enable javascript and cookies',
        'cf-turnstile',
        'cdn-cgi/challenge-platform',
        'captcha',
        'too many requests'
    ];

    async function probeStatus(baseUrl, timeoutMs = BRIDGE_STATUS_TIMEOUT_MS) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(`${baseUrl}/api/status`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.status === 'ok' ? data : null;
        } catch (e) {
            return null;
        }
    }

    // Probe local services once so only the actual main server is treated as /api/proxy.
    async function probeLocalServices(force = false) {
        if (_serviceProbePromise && !force) return _serviceProbePromise;

        _serviceProbePromise = (async () => {
            const [serverStatus, lightpandaStatus, camofoxStatus] = await Promise.all([
                probeStatus(SERVER_BASE, SERVER_STATUS_TIMEOUT_MS),
                probeStatus(LIGHTPANDA_BASE, BRIDGE_STATUS_TIMEOUT_MS),
                probeStatus(CAMOFOX_BASE, BRIDGE_STATUS_TIMEOUT_MS)
            ]);

            _activeProxyBase = serverStatus ? SERVER_BASE : '';
            _bridgeAvailability.lightpanda = Boolean(lightpandaStatus);
            _bridgeAvailability.camofox = Boolean(camofoxStatus);

            if (_activeProxyBase) {
                console.log(`API Core: Local proxy server detected (${serverStatus?.service || 'server'})`);
            }
        })();

        return _serviceProbePromise;
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

    function isLikelyApiUrl(targetUrl) {
        try {
            const parsed = new URL(targetUrl);
            const host = String(parsed.hostname || '').toLowerCase();
            const pathname = String(parsed.pathname || '').toLowerCase();

            return host.startsWith('api.')
                || host.startsWith('graphql.')
                || pathname.includes('/graphql')
                || pathname.endsWith('.json');
        } catch (e) {
            return false;
        }
    }

    function looksBlockedTextResponse(value) {
        const text = String(value || '').toLowerCase();
        if (!text) return false;
        return BLOCKED_TEXT_TOKENS.some((token) => text.includes(token));
    }

    function extractBridgeTextPayload(payload) {
        if (!payload || typeof payload !== 'object') return '';
        if (typeof payload.html === 'string' && payload.html.trim()) return payload.html;
        if (typeof payload.snapshot === 'string' && payload.snapshot.trim()) return payload.snapshot;
        if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
        if (typeof payload.metadata === 'string' && payload.metadata.trim()) return payload.metadata;
        return '';
    }

    function splitRequestOptions(options = {}) {
        const {
            allowBridgeForApiTarget = false,
            ...requestOptions
        } = options || {};

        return {
            allowBridgeForApiTarget: allowBridgeForApiTarget === true,
            requestOptions
        };
    }

    async function tryOptimisticLocalProxy(targetUrl, options = {}) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), OPTIMISTIC_LOCAL_PROXY_TIMEOUT_MS);
            const proxyUrl = `${SERVER_BASE}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(proxyUrl, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return null;
            _activeProxyBase = SERVER_BASE;
            return await response.json();
        } catch (e) {
            return null;
        }
    }

    async function tryOptimisticLocalProxyText(targetUrl, options = {}) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), OPTIMISTIC_LOCAL_PROXY_TIMEOUT_MS);
            const proxyUrl = `${SERVER_BASE}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(proxyUrl, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return null;
            _activeProxyBase = SERVER_BASE;
            return await response.text();
        } catch (e) {
            return null;
        }
    }

    async function fetchDirectThenProxy(targetUrl, options = {}, errorMsg = 'API Request failed') {
        try {
            const directRes = await fetch(targetUrl, options);
            if (directRes.ok) return await directRes.json();
        } catch (e) {}

        await probeLocalServices();
        if (!_activeProxyBase) return null;

        const proxyUrl = `${_activeProxyBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
        return await safeFetch(proxyUrl, options, `${errorMsg} (Local Proxy)`);
    }

    async function fetchTextWithFallback(targetUrl, options = {}, errorMsg = 'API Text Fetch failed') {
        const { allowBridgeForApiTarget, requestOptions } = splitRequestOptions(options);
        const isPost = requestOptions.method === 'POST';
        const isApiTarget = isLikelyApiUrl(targetUrl);

        try {
            const directRes = await fetch(targetUrl, requestOptions);
            if (directRes.ok) {
                const text = await directRes.text();
                if (text && !looksBlockedTextResponse(text)) return text;
            }
        } catch (e) {}

        await probeLocalServices();
        if (_activeProxyBase) {
            try {
                const proxyUrl = `${_activeProxyBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl, requestOptions);
                if (response.ok) {
                    const text = await response.text();
                    if (text && !looksBlockedTextResponse(text)) return text;
                }
            } catch (e) {}
        } else {
            const optimisticProxyResult = await tryOptimisticLocalProxyText(targetUrl, requestOptions);
            if (optimisticProxyResult && !looksBlockedTextResponse(optimisticProxyResult)) return optimisticProxyResult;
        }

        if (isPost) return null;

        const publicTextProxies = [
            `${CODETABS_PROXY_URL}${encodeURIComponent(targetUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
        ];

        for (const proxyUrl of publicTextProxies) {
            try {
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const text = await response.text();
                    if (text && !looksBlockedTextResponse(text)) return text;
                }
            } catch (e) {}
        }

        if (isApiTarget && !allowBridgeForApiTarget) {
            console.warn(errorMsg);
            return null;
        }

        const bridges = [
            _bridgeAvailability.lightpanda ? { name: 'Lightpanda', url: `${LIGHTPANDA_BASE}/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}` } : null,
            _bridgeAvailability.camofox ? { name: 'Camofox', url: `${CAMOFOX_BASE}/api/camofox?format=json&url=${encodeURIComponent(targetUrl)}` } : null
        ].filter(Boolean);

        for (const bridge of bridges) {
            try {
                const response = await fetch(bridge.url);
                if (!response.ok) continue;
                const payload = await response.json();
                const rawText = extractBridgeTextPayload(payload);
                if (rawText && !looksBlockedTextResponse(rawText)) {
                    return rawText;
                }
            } catch (e) {}
        }

        console.warn(errorMsg);
        return null;
    }

    async function fetchWithFallback(targetUrl, options = {}, errorMsg = 'API Search failed') {
        const { allowBridgeForApiTarget, requestOptions } = splitRequestOptions(options);
        const isPost = requestOptions.method === 'POST';
        const isApiTarget = isLikelyApiUrl(targetUrl);
        
        // 0. Try Direct Fetch (Works if browser security is disabled)
        try {
            const directRes = await fetch(targetUrl, requestOptions);
            if (directRes.ok) return await directRes.json();
        } catch (e) {}

        await probeLocalServices();

        // 1. Try Detected Local Proxy (port 3000 only)
        if (_activeProxyBase) {
            try {
                const proxyUrl = `${_activeProxyBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl, requestOptions);
                if (response.ok) return await response.json();
            } catch (e) {}
        } else if (isApiTarget) {
            const optimisticProxyResult = await tryOptimisticLocalProxy(targetUrl, requestOptions);
            if (optimisticProxyResult) return optimisticProxyResult;
        }

        // 2. Try Public Proxies (Works in file:// without any server)
        if (!isPost) {
            const publicProxies = [
                {
                    parse: 'raw-json',
                    url: `${CODETABS_PROXY_URL}${encodeURIComponent(targetUrl)}`
                },
                {
                    parse: 'allorigins',
                    url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
                }
            ];

            for (const proxyConfig of publicProxies) {
                try {
                    const response = await fetch(proxyConfig.url);
                    if (response.ok) {
                        const data = await response.json();

                        if (proxyConfig.parse === 'raw-json' && typeof data === 'object' && data !== null) {
                            return data;
                        }

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

        // 3. Fallback Chain: Lightpanda -> Camofox (HTML/content pages only)
        if (isApiTarget && !allowBridgeForApiTarget) {
            return null;
        }

        const bridges = [
            _bridgeAvailability.lightpanda ? { name: 'Lightpanda', url: `${LIGHTPANDA_BASE}/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}` } : null,
            _bridgeAvailability.camofox ? { name: 'Camofox', url: `${CAMOFOX_BASE}/api/camofox?format=json&url=${encodeURIComponent(targetUrl)}` } : null
        ].filter(Boolean);
        for (const bridge of bridges) {
            try {
                const res = await safeFetch(bridge.url, {}, `${errorMsg} (${bridge.name} Fallback)`);
                if (res) {
                    // Try to find the content in .html (Lightpanda), .snapshot (Camofox), or .metadata
                    const rawData = res.html || res.snapshot || res.metadata;

                    if (typeof rawData === 'string' && rawData.length > 0) {
                        const tryParse = (text) => {
                            if (!text) return null;
                            try { return JSON.parse(text); } catch (e) {}
                            
                            // Try de-escaping if it looks like an escaped string
                            if (text.includes('\\"')) {
                                try {
                                    const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                    return JSON.parse(unescaped);
                                } catch (e) {}
                            }

                            // Extract using balanced markers
                            const firstBrace = text.indexOf('{');
                            const firstBracket = text.indexOf('[');
                            const start = Math.min(firstBrace !== -1 ? firstBrace : Infinity, firstBracket !== -1 ? firstBracket : Infinity);
                            if (start !== Infinity) {
                                const lastBrace = text.lastIndexOf('}');
                                const lastBracket = text.lastIndexOf(']');
                                const end = Math.max(lastBrace, lastBracket);
                                if (end > start) {
                                    const slice = text.substring(start, end + 1);
                                    try { return JSON.parse(slice); } catch (e) {}
                                    // Try unescaping the slice too
                                    if (slice.includes('\\"')) {
                                        try { return JSON.parse(slice.replace(/\\"/g, '"').replace(/\\\\/g, '\\')); } catch (e) {}
                                    }
                                }
                            }
                            return null;
                        };

                        // 1. Try raw
                        let result = tryParse(rawData);
                        if (result) return result;

                        // 2. Try HTML entity decode
                        const decoded = rawData.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                        result = tryParse(decoded);
                        if (result) return result;

                        // 3. Try <pre> extraction
                        const preMatch = rawData.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                        if (preMatch) {
                            result = tryParse(preMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
                            if (result) return result;
                        }

                        // 4. Try DOM stripping
                        try {
                            const doc = new DOMParser().parseFromString(rawData, 'text/html');
                            const text = doc.body.textContent || doc.body.innerText || '';
                            result = tryParse(text);
                            if (result) return result;
                        } catch (e) {}

                        // If still failing, skip to next bridge
                        continue;
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
        CODETABS_PROXY_URL,
        get ACTIVE_PROXY_URL() {
            return _activeProxyBase ? `${_activeProxyBase}/api/proxy?url=` : '';
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
        ensureLocalServicesProbed: probeLocalServices,
        safeFetch,
        fetchDirectThenProxy,
        fetchTextWithFallback,
        fetchWithFallback
    };
})();
