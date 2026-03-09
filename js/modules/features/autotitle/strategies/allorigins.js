// Strategy 1: AllOrigins (JSON)
(function () {
    window.EveOS = window.EveOS || {};
    window.EveOS.Autotitle = window.EveOS.Autotitle || {};
    window.EveOS.Autotitle.Strategies = window.EveOS.Autotitle.Strategies || {};

    const cleanTitle = (raw) => {
        if (!raw) return null;
        const blockedTitles = [
            "Just a moment...", "Attention Required! | Cloudflare", "Access denied", "403 Forbidden", "404 Not Found", "Too Many Requests"
        ];

        const t = raw
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            .trim();

        if (blockedTitles.some(bt => t.includes(bt))) {
            if (t.includes("Just a moment") || t.includes("Cloudflare")) {
                console.info("Cloudflare protection detected (handled).");
                return "CLOUDFLARE_BLOCK";
            }
            console.warn("Blocked title detected:", t);
            return null;
        }
        return t;
    };

    const extractTitle = (html) => {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match && match[1] ? match[1] : null;
    };

    const extractIcon = (html, baseUrl) => {
        const match = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
        if (match && match[1]) {
            let iconUrl = match[1];
            if (!iconUrl.startsWith('http')) {
                try {
                    iconUrl = new URL(iconUrl, baseUrl).href;
                } catch (e) { return null; }
            }
            return iconUrl;
        }
        return null;
    };

    const resolveAssetUrl = (assetUrl, baseUrl) => {
        if (!assetUrl) return null;
        try {
            return new URL(assetUrl, baseUrl).href;
        } catch (e) {
            return null;
        }
    };

    const extractCover = (html, baseUrl) => {
        const metaPatterns = [
            /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
            /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i
        ];
        for (const pattern of metaPatterns) {
            const match = html.match(pattern);
            if (match?.[1]) {
                const resolved = resolveAssetUrl(match[1], baseUrl);
                if (resolved) return resolved;
            }
        }

        const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
        for (const block of jsonLdMatches) {
            const contentMatch = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            const jsonText = contentMatch?.[1]?.trim();
            if (!jsonText) continue;
            try {
                const parsed = JSON.parse(jsonText);
                const queue = Array.isArray(parsed) ? parsed : [parsed];
                while (queue.length) {
                    const current = queue.shift();
                    if (!current || typeof current !== 'object') continue;
                    const imageValue = current.image;
                    if (typeof imageValue === 'string') {
                        const resolved = resolveAssetUrl(imageValue, baseUrl);
                        if (resolved) return resolved;
                    }
                    if (Array.isArray(imageValue)) {
                        for (const entry of imageValue) {
                            if (typeof entry === 'string') {
                                const resolved = resolveAssetUrl(entry, baseUrl);
                                if (resolved) return resolved;
                            }
                            if (entry && typeof entry === 'object' && typeof entry.url === 'string') {
                                const resolved = resolveAssetUrl(entry.url, baseUrl);
                                if (resolved) return resolved;
                            }
                        }
                    }
                    if (imageValue && typeof imageValue === 'object' && typeof imageValue.url === 'string') {
                        const resolved = resolveAssetUrl(imageValue.url, baseUrl);
                        if (resolved) return resolved;
                    }
                    Object.values(current).forEach((value) => {
                        if (value && typeof value === 'object') queue.push(value);
                    });
                }
            } catch (e) {
                // Ignore malformed JSON-LD blocks.
            }
        }
        return null;
    };

    window.EveOS.Autotitle.Strategies.AllOrigins = async function (url, signal) {
        try {
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: signal });
            const data = await res.json();
            if (data.contents) {
                const t = cleanTitle(extractTitle(data.contents));
                if (t === "CLOUDFLARE_BLOCK") throw new Error("AllOrigins Cloudflare Block");
                const i = extractIcon(data.contents, url);
                const coverUrl = extractCover(data.contents, url);
                if (t) return { title: t, icon: i, coverUrl };
            }
        } catch (e) {
            console.warn("AllOrigins failed", e);
        }
        return null; // Continue to next strategy
    };
})();
