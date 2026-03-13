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
        const metaPatterns = [
            /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
            /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i,
            /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']title["']/i
        ];
        for (const pattern of metaPatterns) {
            const match = html.match(pattern);
            if (match?.[1]) return match[1];
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
                    if (typeof current.name === 'string' && current.name.trim()) return current.name.trim();
                    if (typeof current.headline === 'string' && current.headline.trim()) return current.headline.trim();
                    Object.values(current).forEach((value) => {
                        if (value && typeof value === 'object') queue.push(value);
                    });
                }
            } catch (e) {
                // Ignore malformed JSON-LD blocks.
            }
        }

        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match && match[1] ? match[1] : null;
    };

    const isValidIconUrl = (iconUrl) => {
        if (!iconUrl || typeof iconUrl !== 'string') return false;
        const low = iconUrl.toLowerCase();
        if (iconUrl.length > 512) return false;
        if (/ads|track|pixel|metrics|analytics/i.test(iconUrl)) return false;
        if (/\.(png|ico|jpg|jpeg|svg|webp|avif)(?:\?.*)?$/i.test(low)) return true;
        if (/^https?:\/\//i.test(low) && !/\.(js|css|html|php|json)$/i.test(low)) return true;
        if (iconUrl.startsWith('/') && !/\.(js|css|html|php|json)$/i.test(low)) return true;
        return false;
    };

    const scoreIconUrl = (url) => {
        if (!url) return 0;
        const low = url.toLowerCase();
        let score = 0;

        if (low.includes('favicon')) score += 50;
        if (low.includes('apple-touch-icon')) score += 40;
        if (low.includes('logo')) score += 30;
        if (low.endsWith('.ico') || low.includes('.ico?')) score += 20;
        if (low.includes('icon')) score += 10;

        if (low.includes('custom') || low.includes('placeholder') || low.includes('default')) score -= 50;
        if (low.includes('banner') || low.includes('header') || low.includes('bg-')) score -= 30;
        if (/(?:^|\/)(?:images?|assets|static|wp-content|media)\//i.test(low) && score < 10) score -= 10;

        return score;
    };

    const shouldAcceptIconCandidate = (candidate) => {
        if (!candidate?.url) return false;
        return candidate.score >= -10;
    };

    const resolveAssetUrl = (assetUrl, baseUrl) => {
        if (!assetUrl) return null;
        try {
            return new URL(assetUrl, baseUrl).href;
        } catch (e) {
            return null;
        }
    };

    const extractIcon = (html, baseUrl) => {
        const iconPattern = /<link[^>]+rel=["'](?:shortcut |apple-touch-)?icon["'][^>]+href=["']([^"']+)["']/gi;
        const altPattern = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut |apple-touch-)?icon["']/gi;

        let match;
        const candidates = [];

        while ((match = iconPattern.exec(html)) !== null) {
            if (match[1]) candidates.push(match[1]);
        }
        while ((match = altPattern.exec(html)) !== null) {
            if (match[1]) candidates.push(match[1]);
        }

        if (candidates.length === 0) return null;

        const scored = candidates
            .map((raw) => {
                const resolved = resolveAssetUrl(raw, baseUrl);
                return { url: resolved, score: scoreIconUrl(resolved) };
            })
            .filter((candidate) => candidate.url && isValidIconUrl(candidate.url))
            .sort((a, b) => b.score - a.score);

        if (scored.length === 0) return null;

        const best = scored[0];
        if (shouldAcceptIconCandidate(best)) {
            console.log(`Autotitle: Selected icon ${best.url} (Score: ${best.score})`);
            return best.url;
        }

        console.log(`Autotitle: Best icon candidate score too low (${best.score}), favoring fallback.`);
        return null;
    };

    const extractCover = (html, baseUrl) => {
        const metaPatterns = [
            /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
            /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
            /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
            /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
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
                if (t || i || coverUrl) return { title: t, icon: i, coverUrl };
            }
        } catch (e) {
            console.warn("AllOrigins failed", e);
        }
        return null; // Continue to next strategy
    };
})();
