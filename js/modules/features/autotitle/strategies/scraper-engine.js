// Strategy: Advanced Scraper Engine (CORS Proxy Manager & Browser Emulator)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

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

    const resolveAssetUrl = (assetUrl, baseUrl) => {
        if (!assetUrl) return null;
        try {
            return new URL(assetUrl, baseUrl).href;
        } catch (error) {
            return null;
        }
    };

    const extractMetadata = (content, baseUrl) => {
        let doc = null;
        if (typeof content === 'string') {
            doc = new DOMParser().parseFromString(content, 'text/html');
        } else if (content instanceof Document) {
            doc = content;
        }
        if (!doc) return null;

        const title = cleanTitle(doc.title || doc.querySelector('title')?.innerText || '');
        if (!title) return null;

        return {
            title: title.trim(),
            icon: resolveAssetUrl(doc.querySelector('link[rel*="icon"]')?.href || null, baseUrl),
            coverUrl: resolveAssetUrl(doc.querySelector('meta[property="og:image"]')?.content
                || doc.querySelector('meta[name="twitter:image"]')?.content
                || null, baseUrl),
            description: doc.querySelector('meta[name="description"]')?.content
                || doc.querySelector('meta[property="og:description"]')?.content
                || null,
            source: 'ScraperEngine',
            isAdvancedScrape: true
        };
    };

    window.EveOS.Autotitle.Strategies.ScraperEngine = async function (url, signal) {
        console.log("Autotitle: Attempting Advanced Scraper Engine...");

        if (window.CORSProxyManager && typeof window.CORSProxyManager.fetch === 'function') {
            try {
                const response = await window.CORSProxyManager.fetch(url, { signal });
                if (response.ok) {
                    const html = await response.text();
                    const metadata = extractMetadata(html, url);
                    if (metadata?.title) {
                        console.log("Autotitle: ScraperEngine (proxy pool) success:", metadata.title);
                        return metadata;
                    }
                }
            } catch (error) {
                console.warn("Autotitle: CORSProxyManager fallback failed", error);
            }
        }

        if (window.BrowserEmulator && (typeof window.BrowserEmulator.renderUrl === 'function' || typeof window.BrowserEmulator.render === 'function')) {
            try {
                if (!window.BrowserEmulator._initialized && typeof window.BrowserEmulator.init === 'function') {
                    window.BrowserEmulator.init();
                }
                const renderFn = window.BrowserEmulator.renderUrl || window.BrowserEmulator.render;
                const renderedHtml = await renderFn.call(window.BrowserEmulator, url, {
                    method: 'iframe',
                    timeout: 10000
                });
                if (renderedHtml) {
                    const metadata = extractMetadata(renderedHtml, url);
                    if (metadata?.title) {
                        console.log("Autotitle: ScraperEngine (emulator) success:", metadata.title);
                        return metadata;
                    }
                }
            } catch (error) {
                console.warn("Autotitle: BrowserEmulator rendering fallback failed", error);
            }
        }

        return null;
    };
})();
