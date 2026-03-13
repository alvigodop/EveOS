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

    const decodeInlineHtmlEntities = (value) => String(value || '')
        .replace(/&quot;|&#34;/gi, '"')
        .replace(/&#x27;|&#39;/gi, "'")
        .replace(/&amp;/gi, '&');

    const sanitizeAssetUrlRaw = (assetUrl) => {
        let value = decodeInlineHtmlEntities(assetUrl).trim();
        if (!value) return null;
        value = value.replace(/^url\((.*)\)$/i, '$1').trim();
        value = value.replace(/^['"]+|['"]+$/g, '').trim();
        value = value.replace(/(?:&quot;|&#34;|&#x27;|&#39;)+$/gi, '').trim();
        value = value.replace(/[);,\s]+$/g, '').trim();
        return value || null;
    };

    const resolveAssetUrl = (assetUrl, baseUrl) => {
        const sanitized = sanitizeAssetUrlRaw(assetUrl);
        if (!sanitized) return null;
        try {
            return new URL(sanitized, baseUrl).href;
        } catch (e) {
            return null;
        }
    };

    const scoreCoverCandidate = (url) => {
        if (!url) return -999;
        const low = String(url).toLowerCase();
        if (/favicon|logo|sprite|avatar|flag|sharethis|emoji|icon|badge|banner|header|ad[sx]?|pixel/.test(low)) return -200;
        if (/\.svg(?:\?.*)?$/i.test(low)) return -120;
        let score = 0;
        if (/cover|poster|thumbnail|thumb|manga|comic|chapter|title/.test(low)) score += 35;
        if (/\/w\/\d+\/\d+\/[^/?#]+\.(webp|avif|jpg|jpeg|png)(?:[?#].*)?$/i.test(low)) score += 90;
        if (/\/cover\/(?:avif|webp|png|jpe?g)\//i.test(low)) score += 80;
        if (/\/cover\/(?:avif|webp|png|jpe?g)\/_s\d+\.(jpg|jpeg|png|webp|avif)(?:\?.*)?$/i.test(low)) score += 40;
        if (/\/cover\/avif\/[^/?#]+\.avif(?:[?#].*)?$/i.test(low)) score += 70;
        if (/\/cover\/webp\/[^/?#]+\.webp(?:[?#].*)?$/i.test(low)) score += 60;
        if (/uploads|static|cdn|images|image|media/.test(low)) score += 15;
        if (/\/cover\/\d+\/_s\d+/i.test(low)) score -= 85;
        if (/\/cover\/\d+\//i.test(low) && !/[a-z]{3,}[_-][a-z]{3,}\/\d+\//i.test(low)) score -= 25;
        if (/[a-z0-9][a-z0-9_-]{4,}\/\d+\//i.test(low)) score += 18;
        if (!/@\d+\.(jpg|jpeg|png|webp|avif)$/i.test(low)) score += 20;
        if (/\.(jpg|jpeg|png|webp|avif)(?:\?.*)?$/i.test(low)) score += 25;
        if (/\/assets\//.test(low)) score -= 35;
        if (/@100\./.test(low)) score -= 18;
        if (/\/g\/[a-z0-9_-]{1,8}\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(low)) score -= 90;
        if (/placeholder|default|no-cover/.test(low)) score -= 40;
        return score;
    };

    const isRejectedCoverUrl = (url) => {
        const raw = String(url || '').trim();
        if (!raw) return false;
        const variants = new Set([raw.toLowerCase()]);
        try {
            variants.add(decodeURIComponent(raw).toLowerCase());
        } catch (e) { }
        try {
            const parsed = new URL(raw);
            variants.add((parsed.href || '').toLowerCase());
            variants.add((parsed.pathname || '').toLowerCase());
            variants.add((parsed.search || '').toLowerCase());
            try {
                variants.add(decodeURIComponent(parsed.pathname || '').toLowerCase());
                variants.add(decodeURIComponent(parsed.search || '').toLowerCase());
            } catch (e) { }
        } catch (e) { }
        for (const low of variants) {
            if (/\/cover\/\d+\/_s\d+\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(low)) return true;
            if (/\/g\/[a-z0-9_-]{1,12}\.(jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(low)) return true;
            if (/\/g\/ygm\.png(?:[?#].*)?$/i.test(low)) return true;
            if (/\/cover\/avif\/[^/?#]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(low)) return true;
            if (/\/cover\/webp\/[^/?#]+\.(?:jpe?g|png|avif)(?:[?#].*)?$/i.test(low)) return true;
            if (/noimage|no-image|nocover|no-cover|placeholder|default-cover/i.test(low)) return true;
        }
        return false;
    };

    const extractImageCandidates = (html, baseUrl) => {
        const patterns = [
            /<(?:img|source)[^>]+(?:src|data-src)=["']([^"']+)["']/gi,
            /<(?:img|source)[^>]+(?:srcset|data-srcset)=["']([^"']+)["']/gi,
            /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/gi,
            /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi
        ];
        const rawCandidates = [];
        patterns.forEach((pattern) => {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                const raw = String(match[1] || '').split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
                raw.forEach((entry) => rawCandidates.push(entry));
            }
        });
        const expandedHtml = String(html || '').replace(/\\\//g, '/');
        const inlineUrlPatterns = [
            /url\((?:&quot;|&#34;|["'])?(https?:\/\/[^"')\s]+|\/\/[^"')\s]+|\/[^"')\s]+\.(?:avif|webp|png|jpe?g)[^"')\s]*)(?:&quot;|&#34;|["'])?\)/gi,
            /https?:\/\/[^"'`\s<>()\\]+?\.(?:avif|webp|png|jpe?g)(?:\?[^"'`\s<>()\\]*)?/gi,
            /\/\/[^"'`\s<>()\\]+?\.(?:avif|webp|png|jpe?g)(?:\?[^"'`\s<>()\\]*)?/gi,
            /(?:\/|\.\.?\/)[^"'`\s<>()\\]*\/cover\/[^"'`\s<>()\\]+\.(?:avif|webp|png|jpe?g)(?:\?[^"'`\s<>()\\]*)?/gi
        ];
        inlineUrlPatterns.forEach((pattern) => {
            let match;
            while ((match = pattern.exec(expandedHtml)) !== null) {
                const candidate = match[1] || match[0];
                if (candidate) rawCandidates.push(candidate);
            }
        });
        return Array.from(new Set(rawCandidates))
            .map((raw) => resolveAssetUrl(raw, baseUrl))
            .filter(Boolean)
            .map((url) => ({ url, score: scoreCoverCandidate(url) }))
            .filter((candidate) => candidate.score > -20)
            .sort((a, b) => b.score - a.score);
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
                if (resolved && !isRejectedCoverUrl(resolved)) return resolved;
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
                        if (resolved && !isRejectedCoverUrl(resolved)) return resolved;
                    }
                    if (Array.isArray(imageValue)) {
                        for (const entry of imageValue) {
                            if (typeof entry === 'string') {
                                const resolved = resolveAssetUrl(entry, baseUrl);
                                if (resolved && !isRejectedCoverUrl(resolved)) return resolved;
                            }
                            if (entry && typeof entry === 'object' && typeof entry.url === 'string') {
                                const resolved = resolveAssetUrl(entry.url, baseUrl);
                                if (resolved && !isRejectedCoverUrl(resolved)) return resolved;
                            }
                        }
                    }
                    if (imageValue && typeof imageValue === 'object' && typeof imageValue.url === 'string') {
                        const resolved = resolveAssetUrl(imageValue.url, baseUrl);
                        if (resolved && !isRejectedCoverUrl(resolved)) return resolved;
                    }
                    Object.values(current).forEach((value) => {
                        if (value && typeof value === 'object') queue.push(value);
                    });
                }
            } catch (e) {
                // Ignore malformed JSON-LD blocks.
            }
        }
        return extractImageCandidates(html, baseUrl)
            .find((candidate) => !isRejectedCoverUrl(candidate.url))?.url || null;
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
        try {
            const rawRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: signal });
            const rawHtml = await rawRes.text();
            if (rawHtml) {
                const t = cleanTitle(extractTitle(rawHtml));
                if (t === "CLOUDFLARE_BLOCK") throw new Error("AllOrigins Raw Cloudflare Block");
                const i = extractIcon(rawHtml, url);
                const coverUrl = extractCover(rawHtml, url);
                if (t || i || coverUrl) return { title: t, icon: i, coverUrl };
            }
        } catch (e) {
            console.warn("AllOrigins raw failed", e);
        }
        return null; // Continue to next strategy
    };
})();
