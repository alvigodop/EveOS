// Strategy: Lightpanda (WSL-based Browsing via Backend)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};
    window.EveOS.Autotitle._lightpandaInflight = window.EveOS.Autotitle._lightpandaInflight || new Map();

    const cleanTitle = (raw) => {
        if (!raw) return null;
        const blockedTitles = [
            "Just a moment...", "Attention Required! | Cloudflare", "Access denied", "403 Forbidden", "404 Not Found", "Too Many Requests"
        ];
        const title = String(raw)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();

        if (blockedTitles.some((blocked) => title.includes(blocked))) {
            return "CLOUDFLARE_BLOCK";
        }
        return title;
    };

    const extractMetadataFromHtml = (html, baseUrl) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const title = cleanTitle(
            doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
            || doc.title
            || doc.querySelector('title')?.innerText
            || ''
        );

        const icon = doc.querySelector('link[rel*="icon"]')?.href
            || doc.querySelector('link[rel="apple-touch-icon"]')?.href
            || null;

        const coverUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
            || null;

        const description = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')
            || doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content')
            || doc.querySelector('meta[name="description"]')?.getAttribute('content')
            || null;

        return {
            title: title ? title.trim() : null,
            icon,
            coverUrl,
            description,
            canonicalUrl: doc.querySelector('link[rel="canonical"]')?.href || baseUrl,
            quickLinks: [],
            source: 'Lightpanda'
        };
    };

    const normalizePayloadMetadata = (payload, url) => {
        const metadata = payload?.metadata ? { ...payload.metadata } : null;
        if (!metadata) return null;
        metadata.title = cleanTitle(metadata.title);
        metadata.source = 'Lightpanda';
        metadata.quickLinks = Array.isArray(metadata.quickLinks) ? metadata.quickLinks : [];
        metadata.canonicalUrl = metadata.canonicalUrl || url;
        metadata.blocked = !!(payload?.metadata?.blocked || metadata.title === 'CLOUDFLARE_BLOCK');
        metadata.usedLocalExtractor = !!payload?.usedLocalExtractor;
        metadata.usedRenderedExtraction = !!payload?.usedRenderedExtraction;
        metadata.cookieFileExists = !!payload?.cookieDiagnostics?.cookieFileExists;
        metadata.cookieHostConfigured = !!payload?.cookieDiagnostics?.cookieHostConfigured;
        metadata.configuredHost = payload?.cookieDiagnostics?.configuredHost || null;
        metadata.nonEmptyCookieCount = Number(payload?.cookieDiagnostics?.nonEmptyCookieCount || 0);
        metadata.cookieConfigPath = payload?.cookieDiagnostics?.cookieConfigPath || null;
        return metadata;
    };

    const createAbortError = () => {
        try {
            return new DOMException('Aborted', 'AbortError');
        } catch (e) {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            return error;
        }
    };

    const waitForAbort = (signal) => {
        if (!signal) return null;
        if (signal.aborted) return Promise.reject(createAbortError());
        return new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
        });
    };

    const requestLightpanda = async function (url) {
        const isFileProtocol = window.location?.protocol === 'file:';
        if (isFileProtocol) {
            window._eveLightpandaReachable = false;
        }
        let portsToTry = isFileProtocol ? [window._eveLightpandaPort, 3037, 3000, 3001, 3002, 3003, 3004, 3005].filter(Boolean) : [null];
        portsToTry = [...new Set(portsToTry)];

        for (const port of portsToTry) {
            try {
                const apiBase = port ? `http://localhost:${port}` : '';
                const apiUrl = `${apiBase}/api/lightpanda?format=json&metadata_only=1&url=${encodeURIComponent(url)}`;
                const response = await fetch(apiUrl);

                if (response.ok) {
                    if (isFileProtocol) {
                        window._eveLightpandaReachable = true;
                        if (port) window._eveLightpandaPort = port;
                    }
                    const contentType = String(response.headers.get('content-type') || '').toLowerCase();

                    if (contentType.includes('application/json')) {
                        const payload = await response.json();
                        const metadata = normalizePayloadMetadata(payload, url);
                        if (metadata?.title || metadata?.coverUrl || metadata?.icon) {
                            console.log(`Autotitle: Lightpanda JSON success (via port ${port || 'default'}):`, metadata.title || metadata.coverUrl || metadata.icon);
                            return metadata;
                        }

                        if (payload?.html) {
                            const fallback = extractMetadataFromHtml(payload.html, url);
                            if (fallback?.title || fallback?.coverUrl || fallback?.icon) {
                                console.log(`Autotitle: Lightpanda HTML fallback success (via port ${port || 'default'}):`, fallback.title);
                                return fallback;
                            }
                        }
                    } else {
                        const html = await response.text();
                        const metadata = extractMetadataFromHtml(html, url);
                        if (metadata?.title || metadata?.coverUrl || metadata?.icon) {
                            console.log(`Autotitle: Lightpanda HTML success (via port ${port || 'default'}):`, metadata.title);
                            return metadata;
                        }
                    }
                } else if (response.status === 503) {
                    console.warn("Autotitle: Lightpanda bridge is currently DISABLED in the launcher.");
                    return null;
                } else {
                    console.warn(`Autotitle: Lightpanda backend at ${apiBase} returned error ${response.status}`);
                }
            } catch (error) {
                if (isFileProtocol) {
                    console.warn(`Autotitle: Lightpanda connection refused at localhost:${port}. Probing next...`);
                    continue;
                }
                console.warn("Autotitle: Lightpanda strategy failed", error);
            }

            if (!isFileProtocol) break;
        }

        if (isFileProtocol) {
            console.error("Autotitle: Could not connect to a local Lightpanda bridge. Start 'start-lightpanda-bridge.bat' from 'start-server.bat', then retry.");
        }

        return null;
    };

    window.EveOS.Autotitle.Strategies.Lightpanda = async function (url, signal) {
        console.log("Autotitle: Attempting Lightpanda Strategy...");

        const inflight = window.EveOS.Autotitle._lightpandaInflight;
        let request = inflight.get(url);
        if (!request) {
            request = requestLightpanda(url).finally(() => {
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
