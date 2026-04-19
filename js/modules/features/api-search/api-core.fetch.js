window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CoreRuntime = api.CoreRuntime || {};
    if (rt.fetchReady || !rt.sharedReady) return;

    async function safeFetch(url, options = {}, errorMsg = 'API Request failed') {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`${errorMsg} (${response.status}): ${errorText}`);
            }
            return await response.json();
        } catch (error) {
            console.warn(errorMsg, error);
            return null;
        }
    }

    async function tryOptimisticLocalProxy(targetUrl, options = {}) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), rt.OPTIMISTIC_LOCAL_PROXY_TIMEOUT_MS);
            const proxyUrl = `${rt.SERVER_BASE}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(proxyUrl, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return null;
            rt._activeProxyBase = rt.SERVER_BASE;
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    async function tryOptimisticLocalProxyText(targetUrl, options = {}) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), rt.OPTIMISTIC_LOCAL_PROXY_TIMEOUT_MS);
            const proxyUrl = `${rt.SERVER_BASE}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(proxyUrl, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return null;
            rt._activeProxyBase = rt.SERVER_BASE;
            return await response.text();
        } catch (error) {
            return null;
        }
    }

    async function fetchDirectThenProxy(targetUrl, options = {}, errorMsg = 'API Request failed') {
        try {
            const directRes = await fetch(targetUrl, options);
            if (directRes.ok) return await directRes.json();
        } catch (error) {}

        await rt.probeLocalServices();
        if (!rt._activeProxyBase) return null;

        const proxyUrl = `${rt._activeProxyBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
        return await safeFetch(proxyUrl, options, `${errorMsg} (Local Proxy)`);
    }

    async function fetchTextWithFallback(targetUrl, options = {}, errorMsg = 'API Text Fetch failed') {
        const { allowBridgeForApiTarget, requestOptions } = rt.splitRequestOptions(options);
        const isPost = requestOptions.method === 'POST';
        const isApiTarget = rt.isLikelyApiUrl(targetUrl);

        try {
            const directRes = await fetch(targetUrl, requestOptions);
            if (directRes.ok) {
                const text = await directRes.text();
                if (text && !rt.looksBlockedTextResponse(text)) return text;
            }
        } catch (error) {}

        await rt.probeLocalServices(true);
        if (rt._activeProxyBase) {
            try {
                const proxyUrl = `${rt._activeProxyBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl, requestOptions);
                if (response.ok) {
                    const text = await response.text();
                    if (text && !rt.looksBlockedTextResponse(text)) return text;
                }
            } catch (error) {}
        } else {
            const optimisticProxyResult = await tryOptimisticLocalProxyText(targetUrl, requestOptions);
            if (optimisticProxyResult && !rt.looksBlockedTextResponse(optimisticProxyResult)) return optimisticProxyResult;
        }

        if (isPost) return null;

        const publicTextProxies = [
            `${rt.CODETABS_PROXY_URL}${encodeURIComponent(targetUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
        ];

        for (const proxyUrl of publicTextProxies) {
            try {
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const text = await response.text();
                    if (text && !rt.looksBlockedTextResponse(text)) return text;
                }
            } catch (error) {}
        }

        if (isApiTarget && !allowBridgeForApiTarget) {
            console.warn(errorMsg);
            return null;
        }

        const bridges = [
            rt._bridgeAvailability.lightpanda ? { name: 'Lightpanda', url: `${rt.LIGHTPANDA_BASE}/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}` } : null,
            rt._bridgeAvailability.camofox ? { name: 'Camofox', url: `${rt.CAMOFOX_BASE}/api/camofox?format=json&url=${encodeURIComponent(targetUrl)}` } : null
        ].filter(Boolean);

        for (const bridge of bridges) {
            try {
                const response = await fetch(bridge.url);
                if (!response.ok) continue;
                const payload = await response.json();
                const rawText = rt.extractBridgeTextPayload(payload);
                if (rawText && !rt.looksBlockedTextResponse(rawText)) {
                    return rawText;
                }
            } catch (error) {}
        }

        console.warn(errorMsg);
        return null;
    }

    async function fetchWithFallback(targetUrl, options = {}, errorMsg = 'API Search failed') {
        const { allowBridgeForApiTarget, requestOptions } = rt.splitRequestOptions(options);
        const isPost = requestOptions.method === 'POST';
        const isApiTarget = rt.isLikelyApiUrl(targetUrl);

        try {
            const directRes = await fetch(targetUrl, requestOptions);
            if (directRes.ok) return await directRes.json();
        } catch (error) {}

        await rt.probeLocalServices(true);

        if (rt._activeProxyBase) {
            try {
                const proxyUrl = `${rt._activeProxyBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl, requestOptions);
                if (response.ok) return await response.json();
            } catch (error) {}
        } else if (isApiTarget) {
            const optimisticProxyResult = await tryOptimisticLocalProxy(targetUrl, requestOptions);
            if (optimisticProxyResult) return optimisticProxyResult;
        }

        if (!isPost) {
            const publicProxies = [
                {
                    parse: 'raw-json',
                    url: `${rt.CODETABS_PROXY_URL}${encodeURIComponent(targetUrl)}`
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
                            } catch (error) {
                                continue;
                            }
                        }
                        if (typeof data === 'object' && data !== null && !data.contents) return data;
                    }
                } catch (error) {}
            }
        }

        if (isApiTarget && !allowBridgeForApiTarget) {
            return null;
        }

        const bridges = [
            rt._bridgeAvailability.lightpanda ? { name: 'Lightpanda', url: `${rt.LIGHTPANDA_BASE}/api/lightpanda?format=json&url=${encodeURIComponent(targetUrl)}` } : null,
            rt._bridgeAvailability.camofox ? { name: 'Camofox', url: `${rt.CAMOFOX_BASE}/api/camofox?format=json&url=${encodeURIComponent(targetUrl)}` } : null
        ].filter(Boolean);
        for (const bridge of bridges) {
            try {
                const response = await safeFetch(bridge.url, {}, `${errorMsg} (${bridge.name} Fallback)`);
                if (response) {
                    const rawData = response.html || response.snapshot || response.metadata;

                    if (typeof rawData === 'string' && rawData.length > 0) {
                        const tryParse = function (text) {
                            if (!text) return null;
                            try { return JSON.parse(text); } catch (error) {}

                            if (text.includes('\\"')) {
                                try {
                                    const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                    return JSON.parse(unescaped);
                                } catch (error) {}
                            }

                            const firstBrace = text.indexOf('{');
                            const firstBracket = text.indexOf('[');
                            const start = Math.min(firstBrace !== -1 ? firstBrace : Infinity, firstBracket !== -1 ? firstBracket : Infinity);
                            if (start !== Infinity) {
                                const lastBrace = text.lastIndexOf('}');
                                const lastBracket = text.lastIndexOf(']');
                                const end = Math.max(lastBrace, lastBracket);
                                if (end > start) {
                                    const slice = text.substring(start, end + 1);
                                    try { return JSON.parse(slice); } catch (error) {}
                                    if (slice.includes('\\"')) {
                                        try { return JSON.parse(slice.replace(/\\"/g, '"').replace(/\\\\/g, '\\')); } catch (error) {}
                                    }
                                }
                            }
                            return null;
                        };

                        let result = tryParse(rawData);
                        if (result) return result;

                        const decoded = rawData.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                        result = tryParse(decoded);
                        if (result) return result;

                        const preMatch = rawData.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                        if (preMatch) {
                            result = tryParse(preMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
                            if (result) return result;
                        }

                        try {
                            const doc = new DOMParser().parseFromString(rawData, 'text/html');
                            const text = doc.body.textContent || doc.body.innerText || '';
                            result = tryParse(text);
                            if (result) return result;
                        } catch (error) {}

                        continue;
                    }
                    if (typeof rawData === 'object' && rawData !== null) return rawData;
                }
            } catch (error) {}
        }

        return null;
    }

    async function getPopupViewerUrl(targetUrl) {
        const normalizedTarget = String(targetUrl || '').trim();
        if (!normalizedTarget) return '';
        const runningFromFile = String(window.location?.protocol || '').toLowerCase() === 'file:';

        try {
            const parsed = new URL(normalizedTarget);
            const host = String(parsed.hostname || '').trim();
            if ((host === rt.LOCAL_HOST || host === 'localhost') && /^\/api\//.test(String(parsed.pathname || ''))) {
                return normalizedTarget;
            }
        } catch (error) {}

        await rt.probeLocalServices();

        if (rt._bridgeAvailability.popup) {
            return `${rt.POPUP_BRIDGE_BASE}/api/popup-view?url=${encodeURIComponent(normalizedTarget)}`;
        }

        if (!runningFromFile && rt._activeProxyBase) {
            return `${rt._activeProxyBase}/api/popup-view?url=${encodeURIComponent(normalizedTarget)}`;
        }

        if (rt._bridgeAvailability.lightpanda) {
            return `${rt.LIGHTPANDA_BASE}/api/lightpanda?url=${encodeURIComponent(normalizedTarget)}`;
        }

        if (rt._activeProxyBase) {
            if (runningFromFile) {
                return normalizedTarget;
            }
            return `${rt._activeProxyBase}/api/proxy?url=${encodeURIComponent(normalizedTarget)}`;
        }

        return normalizedTarget;
    }

    Object.assign(rt, {
        safeFetch,
        tryOptimisticLocalProxy,
        tryOptimisticLocalProxyText,
        fetchDirectThenProxy,
        fetchTextWithFallback,
        fetchWithFallback,
        getPopupViewerUrl
    });

    rt.fetchReady = true;
})(window.EveOS.API);
