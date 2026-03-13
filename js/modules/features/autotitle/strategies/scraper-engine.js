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

    const getMetaContent = (doc, selectors) => {
        for (const selector of selectors) {
            const value = doc.querySelector(selector)?.getAttribute('content')
                || doc.querySelector(selector)?.getAttribute('href')
                || null;
            if (value) return value;
        }
        return null;
    };

    const extractJsonLdValue = (doc, keys) => {
        const blocks = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
        for (const block of blocks) {
            const jsonText = block.textContent?.trim();
            if (!jsonText) continue;
            try {
                const parsed = JSON.parse(jsonText);
                const queue = Array.isArray(parsed) ? parsed : [parsed];
                while (queue.length) {
                    const current = queue.shift();
                    if (!current || typeof current !== 'object') continue;
                    for (const key of keys) {
                        const value = current[key];
                        if (typeof value === 'string' && value.trim()) return value.trim();
                        if (Array.isArray(value)) {
                            const firstString = value.find((entry) => typeof entry === 'string' && entry.trim());
                            if (firstString) return firstString.trim();
                        }
                        if (value && typeof value === 'object' && typeof value.url === 'string' && value.url.trim()) {
                            return value.url.trim();
                        }
                    }
                    Object.values(current).forEach((value) => {
                        if (value && typeof value === 'object') queue.push(value);
                    });
                }
            } catch (error) {
                // Ignore malformed JSON-LD blocks.
            }
        }
        return null;
    };

    const extractMetadata = (content, baseUrl) => {
        let doc = null;
        if (typeof content === 'string') {
            doc = new DOMParser().parseFromString(content, 'text/html');
        } else if (content instanceof Document) {
            doc = content;
        }
        if (!doc) return null;

        const title = cleanTitle(
            getMetaContent(doc, [
                'meta[property="og:title"]',
                'meta[name="twitter:title"]',
                'meta[name="title"]'
            ])
            || extractJsonLdValue(doc, ['name', 'headline'])
            || doc.title
            || doc.querySelector('title')?.innerText
            || ''
        );

        const icon = resolveAssetUrl(
            doc.querySelector('link[rel*="icon"]')?.href
            || doc.querySelector('link[rel="apple-touch-icon"]')?.href
            || null,
            baseUrl
        );

        const coverUrl = resolveAssetUrl(
            getMetaContent(doc, [
                'meta[property="og:image"]',
                'meta[property="og:image:secure_url"]',
                'meta[name="twitter:image"]',
                'meta[name="twitter:image:src"]',
                'meta[itemprop="image"]',
                'link[rel="image_src"]'
            ]) || extractJsonLdValue(doc, ['image']),
            baseUrl
        );

        const description = getMetaContent(doc, [
            'meta[name="description"]',
            'meta[property="og:description"]'
        ]) || null;

        if (!title && !icon && !coverUrl && !description) return null;

        return {
            title: title ? title.trim() : null,
            icon,
            coverUrl,
            description,
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
