// Strategy: Advanced Scraper Engine (CORS Proxy Manager & Browser Emulator)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    /**
     * Helper to clean titles and detect Cloudflare/Junk
     */
    const cleanTitle = (raw) => {
        if (!raw) return null;
        const blockedTitles = [
            "Just a moment...", "Attention Required! | Cloudflare", "Access denied", "403 Forbidden", "404 Not Found", "Too Many Requests"
        ];
        const t = raw
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            .trim();

        if (blockedTitles.some(bt => t.includes(bt))) {
            return "CLOUDFLARE_BLOCK";
        }
        return t;
    };

    /**
     * Helper to extract metadata from a DOM object or HTML string
     */
    const extractMetadata = (content, baseUrl) => {
        let doc;
        if (typeof content === 'string') {
            doc = new DOMParser().parseFromString(content, 'text/html');
        } else if (content instanceof Document) {
            doc = content;
        } else {
            return null;
        }

        const rawTitle = doc.title || doc.querySelector('title')?.innerText;
        const title = cleanTitle(rawTitle);
        if (!title) return null;

        const description = doc.querySelector('meta[name="description"]')?.content || 
                          doc.querySelector('meta[property="og:description"]')?.content;
        
        // Use the existing AllOrigins logic for icon/cover if possible, 
        // but here we can just do a quick extraction
        const icon = doc.querySelector('link[rel*="icon"]')?.href;
        const cover = doc.querySelector('meta[property="og:image"]')?.content || 
                      doc.querySelector('meta[name="twitter:image"]')?.content;

        return {
            title: title ? title.trim() : null,
            icon: icon || null,
            coverUrl: cover || null,
            description: description || null,
            source: 'ScraperEngine'
        };
    };

    window.EveOS.Autotitle.Strategies.ScraperEngine = async function (url, signal) {
        console.log("Autotitle: Attempting Advanced Scraper Engine...");

        // 1. Try CORS Proxy Manager (Pool of proxies)
        if (window.CORSProxyManager && typeof window.CORSProxyManager.fetch === 'function') {
            try {
                console.log("Autotitle: Using CORSProxyManager pool...");
                const response = await window.CORSProxyManager.fetch(url, { signal });
                if (response.ok) {
                    const html = await response.text();
                    const meta = extractMetadata(html, url);
                    if (meta && meta.title) {
                        console.log("Autotitle: ScraperEngine (ProxyPool) success:", meta.title);
                        return meta;
                    }
                }
            } catch (e) {
                console.warn("Autotitle: CORSProxyManager fallback failed", e);
            }
        }

        // 2. Try BrowserEmulator Rendering (Iframe fallback / JS Execution)
        if (window.BrowserEmulator && (typeof window.BrowserEmulator.renderUrl === 'function' || typeof window.BrowserEmulator.render === 'function')) {
            try {
                console.log("Autotitle: Using BrowserEmulator rendering...");
                
                // Ensure initialization
                if (!window.BrowserEmulator._initialized && typeof window.BrowserEmulator.init === 'function') {
                    window.BrowserEmulator.init();
                }

                const renderFn = window.BrowserEmulator.renderUrl || window.BrowserEmulator.render;
                const renderedHtml = await renderFn.call(window.BrowserEmulator, url, { 
                    method: 'iframe', 
                    timeout: 10000 
                });
                
                if (renderedHtml) {
                    const meta = extractMetadata(renderedHtml, url);
                    if (meta && meta.title) {
                        console.log("Autotitle: ScraperEngine (Emulator) success:", meta.title);
                        meta.isAdvancedScrape = true; // Flag for UI status
                        return meta;
                    }
                }
            } catch (e) {
                console.warn("Autotitle: BrowserEmulator rendering fallback failed", e);
            }
        }

        return null;
    };
})();
