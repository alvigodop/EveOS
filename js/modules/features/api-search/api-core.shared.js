window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CoreRuntime = api.CoreRuntime || {};
    if (rt.sharedReady) return;

    // Defaults — overridable via Settings → Integrations (config.bridges.*).
    const BRIDGE_DEFAULTS = {
        proxyUrl: 'https://corsproxy.io/?',
        codetabsProxyUrl: 'https://api.codetabs.com/v1/proxy/?quest=',
        localHost: '127.0.0.1',
        bridgePort: 3037,
        camofoxPort: 3038,
        wikimediaPort: 3039,
        popupPort: 3040,
        serverPort: 3000,
        statusTimeoutMs: 350
    };

    function resolvePort(configValue, fallback) {
        const num = Number(configValue);
        if (!Number.isFinite(num) || num < 1 || num > 65535) return fallback;
        return Math.round(num);
    }

    function resolveString(configValue, fallback) {
        const raw = String(configValue == null ? '' : configValue).trim();
        return raw || fallback;
    }

    // Apply current config.bridges overrides to rt.* base URLs. Called at init
    // and exposed as rt.refreshBridgeConfig() so a Settings change can hot-apply
    // without a page reload.
    rt.refreshBridgeConfig = function refreshBridgeConfig() {
        const overrides = (typeof config === 'object' && config && config.bridges && typeof config.bridges === 'object') ? config.bridges : {};
        rt.PROXY_URL = resolveString(overrides.corsProxyUrl, BRIDGE_DEFAULTS.proxyUrl);
        rt.CODETABS_PROXY_URL = resolveString(overrides.codetabsProxyUrl, BRIDGE_DEFAULTS.codetabsProxyUrl);
        rt.LOCAL_HOST = BRIDGE_DEFAULTS.localHost;
        rt.BRIDGE_PORT = resolvePort(overrides.lightpandaPort, BRIDGE_DEFAULTS.bridgePort);
        rt.CAMOFOX_BRIDGE_PORT = resolvePort(overrides.camofoxPort, BRIDGE_DEFAULTS.camofoxPort);
        rt.WIKIMEDIA_BRIDGE_PORT = resolvePort(overrides.wikimediaPort, BRIDGE_DEFAULTS.wikimediaPort);
        rt.POPUP_BRIDGE_PORT = resolvePort(overrides.popupPort, BRIDGE_DEFAULTS.popupPort);
        rt.SERVER_PORT = resolvePort(overrides.serverPort, BRIDGE_DEFAULTS.serverPort);
        rt.LIGHTPANDA_BASE = `http://${rt.LOCAL_HOST}:${rt.BRIDGE_PORT}`;
        rt.CAMOFOX_BASE = `http://${rt.LOCAL_HOST}:${rt.CAMOFOX_BRIDGE_PORT}`;
        rt.WIKIMEDIA_BASE = `http://${rt.LOCAL_HOST}:${rt.WIKIMEDIA_BRIDGE_PORT}`;
        rt.POPUP_BRIDGE_BASE = `http://${rt.LOCAL_HOST}:${rt.POPUP_BRIDGE_PORT}`;
        rt.SERVER_BASE = `http://${rt.LOCAL_HOST}:${rt.SERVER_PORT}`;
        const statusTimeout = Number(overrides.statusTimeoutMs);
        rt.BRIDGE_STATUS_TIMEOUT_MS = Number.isFinite(statusTimeout) && statusTimeout >= 50 && statusTimeout <= 10000
            ? Math.round(statusTimeout)
            : BRIDGE_DEFAULTS.statusTimeoutMs;
    };

    rt.refreshBridgeConfig();

    if (typeof rt._activeProxyBase !== 'string') rt._activeProxyBase = '';
    rt._serviceProbePromise = rt._serviceProbePromise || null;
    rt._bridgeAvailability = rt._bridgeAvailability || {
        lightpanda: false,
        camofox: false,
        wikimedia: false,
        popup: false,
        popupWikimedia: false
    };

    rt.SERVER_STATUS_TIMEOUT_MS = 1500;
    // BRIDGE_STATUS_TIMEOUT_MS is set by refreshBridgeConfig() above so the
    // user's Integrations override wins; default falls back to 350.
    rt.OPTIMISTIC_LOCAL_PROXY_TIMEOUT_MS = 1000;
    rt.BLOCKED_TEXT_TOKENS = [
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
    rt.WIKIMEDIA_MIN_INTERVAL_MS = 250;
    rt.WIKIMEDIA_DEFAULT_BACKOFF_MS = 5000;
    rt._wikimediaQueue = rt._wikimediaQueue || Promise.resolve();
    rt._wikimediaLastRequestAt = Number(rt._wikimediaLastRequestAt || 0);
    rt._wikimediaDirectWarningShown = rt._wikimediaDirectWarningShown === true;

    rt.ENDPOINTS = {
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

    async function probeStatus(baseUrl, timeoutMs = rt.BRIDGE_STATUS_TIMEOUT_MS) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch(`${baseUrl}/api/status`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return null;
            const data = await response.json();
            return data?.status === 'ok' ? data : null;
        } catch (error) {
            return null;
        }
    }

    function shouldAutoProbeLocalServices() {
        try {
            return !(window.location && window.location.protocol === 'file:');
        } catch (error) {
            return true;
        }
    }

    async function probeLocalServices(force = false) {
        if (rt._serviceProbePromise && !force) return rt._serviceProbePromise;

        rt._serviceProbePromise = (async function () {
            const [serverStatus, lightpandaStatus, camofoxStatus, wikimediaStatus, popupStatus] = await Promise.all([
                probeStatus(rt.SERVER_BASE, rt.SERVER_STATUS_TIMEOUT_MS),
                probeStatus(rt.LIGHTPANDA_BASE, rt.BRIDGE_STATUS_TIMEOUT_MS),
                probeStatus(rt.CAMOFOX_BASE, rt.BRIDGE_STATUS_TIMEOUT_MS),
                probeStatus(rt.WIKIMEDIA_BASE, rt.BRIDGE_STATUS_TIMEOUT_MS),
                probeStatus(rt.POPUP_BRIDGE_BASE, rt.BRIDGE_STATUS_TIMEOUT_MS)
            ]);

            rt._activeProxyBase = serverStatus ? rt.SERVER_BASE : '';
            rt._bridgeAvailability.lightpanda = Boolean(lightpandaStatus);
            rt._bridgeAvailability.camofox = Boolean(camofoxStatus);
            rt._bridgeAvailability.popup = Boolean(popupStatus);
            rt._bridgeAvailability.popupWikimedia = Boolean(
                popupStatus?.wikimediaTransport
                || (Array.isArray(popupStatus?.capabilities) && popupStatus.capabilities.includes('wikimedia-proxy'))
            );
            rt._bridgeAvailability.wikimedia = Boolean(wikimediaStatus || rt._bridgeAvailability.popupWikimedia);

            if (rt._activeProxyBase) {
                console.log(`API Core: Local proxy server detected (${serverStatus?.service || 'server'})`);
            }
        })();

        return rt._serviceProbePromise;
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
        } catch (error) {
            return false;
        }
    }

    function looksBlockedTextResponse(value) {
        const text = String(value || '').toLowerCase();
        if (!text) return false;
        return rt.BLOCKED_TEXT_TOKENS.some((token) => text.includes(token));
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

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
    }

    function parseRetryAfterMs(value) {
        const rawValue = String(value || '').trim();
        if (!rawValue) return 0;

        const seconds = Number(rawValue);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return seconds * 1000;
        }

        const retryDate = Date.parse(rawValue);
        if (Number.isFinite(retryDate)) {
            return Math.max(0, retryDate - Date.now());
        }

        return 0;
    }

    Object.assign(rt, {
        probeStatus,
        shouldAutoProbeLocalServices,
        probeLocalServices,
        isLikelyApiUrl,
        looksBlockedTextResponse,
        extractBridgeTextPayload,
        splitRequestOptions,
        sleep,
        parseRetryAfterMs
    });

    if (shouldAutoProbeLocalServices()) {
        rt.probeLocalServices();
    }
    rt.sharedReady = true;
})(window.EveOS.API);
