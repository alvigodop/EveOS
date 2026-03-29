// Strategy: Camofox (standalone browser bridge)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};
    window.EveOS.Autotitle._camofoxInflight = window.EveOS.Autotitle._camofoxInflight || new Map();

    function cleanTitle(raw) {
        if (!raw) return null;
        const title = String(raw)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();
        if (!title) return null;
        const blockedTitles = [
            'Just a moment...',
            'Attention Required! | Cloudflare',
            'Access denied',
            '403 Forbidden',
            'Too Many Requests',
            'CLOUDFLARE_BLOCK'
        ];
        if (blockedTitles.some((blocked) => title.includes(blocked))) {
            return 'CLOUDFLARE_BLOCK';
        }
        return title;
    }

    function normalizePayloadMetadata(payload, url) {
        const metadata = payload?.metadata ? { ...payload.metadata } : null;
        if (!metadata) return null;
        metadata.title = cleanTitle(metadata.title);
        metadata.source = 'Camofox';
        metadata.quickLinks = Array.isArray(metadata.quickLinks) ? metadata.quickLinks : [];
        metadata.canonicalUrl = metadata.canonicalUrl || url;
        metadata.blocked = !!(payload?.metadata?.blocked || metadata.title === 'CLOUDFLARE_BLOCK');
        metadata.cookieFileExists = !!payload?.cookieDiagnostics?.cookieFileExists;
        metadata.cookieHostConfigured = !!payload?.cookieDiagnostics?.cookieHostConfigured;
        metadata.configuredHost = payload?.cookieDiagnostics?.configuredHost || null;
        metadata.nonEmptyCookieCount = Number(payload?.cookieDiagnostics?.nonEmptyCookieCount || 0);
        metadata.cookieConfigPath = payload?.cookieDiagnostics?.cookieConfigPath || null;
        metadata.usedCookies = !!payload?.usedCookies;
        metadata.camofoxBlocked = !!metadata.blocked;
        metadata.browserFallbackBlocked = !!metadata.blocked;
        return metadata;
    }

    function createAbortError() {
        try {
            return new DOMException('Aborted', 'AbortError');
        } catch (_error) {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            return error;
        }
    }

    function waitForAbort(signal) {
        if (!signal) return null;
        if (signal.aborted) return Promise.reject(createAbortError());
        return new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
        });
    }

    async function requestCamofox(url) {
        const isFileProtocol = window.location?.protocol === 'file:';
        if (isFileProtocol) {
            window._eveCamofoxReachable = false;
        }
        let portsToTry = isFileProtocol ? [window._eveCamofoxPort, 3038].filter(Boolean) : [null];
        portsToTry = [...new Set(portsToTry)];

        for (const port of portsToTry) {
            try {
                const apiBase = port ? `http://localhost:${port}` : '';
                const apiUrl = `${apiBase}/api/camofox?format=json&metadata_only=1&url=${encodeURIComponent(url)}`;
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    console.warn(`Autotitle: Camofox backend at ${apiBase} returned error ${response.status}`);
                    continue;
                }

                if (isFileProtocol) {
                    window._eveCamofoxReachable = true;
                    if (port) window._eveCamofoxPort = port;
                }

                const payload = await response.json();
                const metadata = normalizePayloadMetadata(payload, url);
                if (metadata?.title || metadata?.coverUrl || metadata?.icon || metadata?.blocked) {
                    console.log(`Autotitle: Camofox JSON success (via port ${port || 'default'}):`, metadata.title || metadata.coverUrl || metadata.icon);
                    return metadata;
                }
            } catch (_error) {
                if (isFileProtocol) {
                    console.warn(`Autotitle: Camofox connection refused at localhost:${port}.`);
                    continue;
                }
            }

            if (!isFileProtocol) break;
        }

        return null;
    }

    window.EveOS.Autotitle.Strategies.Camofox = async function (url, signal) {
        console.log('Autotitle: Attempting Camofox Strategy...');

        const inflight = window.EveOS.Autotitle._camofoxInflight;
        let request = inflight.get(url);
        if (!request) {
            request = requestCamofox(url).finally(() => {
                if (inflight.get(url) === request) {
                    inflight.delete(url);
                }
            });
            inflight.set(url, request);
        }

        const abortPromise = waitForAbort(signal);
        if (!abortPromise) {
            return request;
        }

        try {
            return await Promise.race([request, abortPromise]);
        } catch (error) {
            if (error?.name === 'AbortError') return null;
            throw error;
        }
    };
})();
