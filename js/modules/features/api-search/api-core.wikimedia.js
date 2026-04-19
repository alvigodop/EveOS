window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CoreRuntime = api.CoreRuntime || {};
    if (rt.wikimediaReady || !rt.sharedReady) return;

    function isWikimediaUrl(targetUrl) {
        try {
            const parsed = new URL(String(targetUrl || ''));
            const host = String(parsed.hostname || '').toLowerCase();
            return host === 'wikipedia.org'
                || host.endsWith('.wikipedia.org')
                || host === 'wikimedia.org'
                || host.endsWith('.wikimedia.org');
        } catch (error) {
            return false;
        }
    }

    function warnWikimediaDirectMode() {
        if (rt._wikimediaDirectWarningShown) return;
        rt._wikimediaDirectWarningShown = true;
        console.warn('API Core: Wikimedia live requests are running without the local EveOS proxy/bridge, so the browser cannot send a custom bot User-Agent. Start python-server.py or start-popup-bridge.bat for policy-compliant Wikimedia transport.');
    }

    async function enqueueWikimediaRequest(task) {
        const prior = rt._wikimediaQueue.catch(() => {});
        let releaseQueue = null;
        rt._wikimediaQueue = new Promise((resolve) => {
            releaseQueue = resolve;
        });

        await prior;

        try {
            const waitMs = Math.max(0, (rt._wikimediaLastRequestAt + rt.WIKIMEDIA_MIN_INTERVAL_MS) - Date.now());
            if (waitMs > 0) {
                await rt.sleep(waitMs);
            }
            return await task();
        } finally {
            rt._wikimediaLastRequestAt = Date.now();
            if (typeof releaseQueue === 'function') {
                releaseQueue();
            }
        }
    }

    async function fetchWikimediaResponse(targetUrl, options = {}) {
        const requestOptions = { ...(options || {}) };

        return enqueueWikimediaRequest(async function () {
            await rt.probeLocalServices();

            const bridgeBase = rt._bridgeAvailability.popupWikimedia
                ? rt.POPUP_BRIDGE_BASE
                : (rt._bridgeAvailability.wikimedia
                    ? rt.WIKIMEDIA_BASE
                    : (rt._activeProxyBase || ''));
            const requestUrl = bridgeBase
                ? `${bridgeBase}/api/proxy?url=${encodeURIComponent(targetUrl)}`
                : targetUrl;

            if (!bridgeBase) {
                warnWikimediaDirectMode();
            }

            for (let attempt = 0; attempt < 2; attempt += 1) {
                const response = await fetch(requestUrl, requestOptions);
                if (response.status !== 429 || attempt > 0) {
                    return response;
                }

                const retryDelayMs = rt.parseRetryAfterMs(response.headers.get('Retry-After')) || rt.WIKIMEDIA_DEFAULT_BACKOFF_MS;
                await rt.sleep(retryDelayMs);
            }

            return fetch(requestUrl, requestOptions);
        });
    }

    async function fetchWikimediaJson(targetUrl, options = {}) {
        const response = await fetchWikimediaResponse(targetUrl, options);
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Wikimedia request failed (${response.status}): ${errorText}`);
        }
        return response.json();
    }

    async function getWikipediaSearchUrl(query) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) return '';

        await rt.probeLocalServices();

        if (rt._bridgeAvailability.popupWikimedia) {
            return `${rt.POPUP_BRIDGE_BASE}/api/wikipedia/search?q=${encodeURIComponent(normalizedQuery)}`;
        }

        if (rt._bridgeAvailability.wikimedia) {
            return `${rt.WIKIMEDIA_BASE}/api/wikipedia/search?q=${encodeURIComponent(normalizedQuery)}`;
        }

        if (rt._activeProxyBase) {
            return `${rt._activeProxyBase}/api/wikipedia/search?q=${encodeURIComponent(normalizedQuery)}`;
        }

        return `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(normalizedQuery)}&limit=10&namespace=0&format=json&origin=*`;
    }

    Object.assign(rt, {
        isWikimediaUrl,
        warnWikimediaDirectMode,
        enqueueWikimediaRequest,
        fetchWikimediaResponse,
        fetchWikimediaJson,
        getWikipediaSearchUrl
    });

    rt.wikimediaReady = true;
})(window.EveOS.API);
